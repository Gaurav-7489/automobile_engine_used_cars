import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const command = "http://127.0.0.1:3001/command";
const axeSource = readFileSync(createRequire(process.cwd() + "/package.json").resolve("axe-core"), "utf8");
async function violations(page: Page) {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const r = await (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return r.violations.map(v => ({ id: v.id, targets: v.nodes.slice(0, 4).map(n => n.target.join(" ")) }));
  });
}
async function growth(page: Page) {
  expect((await page.request.post(`${command}/api/dealer/demo-plan`, { data: { plan: "growth" } })).status()).toBe(200);
  await page.goto(`${command}/acquisition`);
}

test("each option shows landed cost, resale range, profit, capital committed and a stated risk", async ({ page }) => {
  await growth(page);
  await page.getByLabel("Buying strategy").selectOption("1");
  await page.getByRole("button", { name: "Find budget-fit acquisitions" }).click();
  const first = page.locator(".acquisition-option").first();
  await expect(first).toBeVisible();
  await expect(first).toContainText("Total landed + holding estimate");
  await expect(first).toContainText("Estimated gross contribution range");
  await expect(first).toContainText("Capital committed");
  await expect(first.getByRole("img", { name: /Landed cost .* Recorded resale range/ })).toBeVisible();
  await expect(first.locator(".ck-risk")).toHaveText(/Lower risk|Watch|High risk/);
  await first.getByText("View as table").click();
  await expect(first.getByRole("table").getByRole("rowheader")).toHaveText(["Purchase price", "Preparation + transfer", "Transport (estimate)", "Holding (your assumption)"]);
});

test("cautious risk tolerance drops options that cannot cover their cost at the low resale end", async ({ page }) => {
  await growth(page);
  await page.getByLabel("Buying strategy").selectOption("1");
  await page.getByRole("button", { name: "Find budget-fit acquisitions" }).click();
  await expect(page.locator(".acquisition-option .ck-risk[data-level='high']").first()).toBeAttached();   // later options sit in a closed disclosure
  const balanced = await page.locator(".acquisition-option").count();
  await page.getByLabel("Risk tolerance").selectOption("cautious");
  await page.getByRole("button", { name: "Find budget-fit acquisitions" }).click();
  await expect(page.locator(".acquisition-option").first()).toContainText("Cautious");
  expect(await page.locator(".acquisition-option").count()).toBeLessThan(balanced);
  await expect(page.locator(".acquisition-option .ck-risk[data-level='high']")).toHaveCount(0);
});

test("the server rejects an unknown risk tolerance and still enforces the car-count entitlement", async ({ page }) => {
  await growth(page);
  const body = { budget: 1000000, reserve: 50000, city: "Kochi", latitude: 9.9312, longitude: 76.2673, radiusKm: 600, count: 1, goal: "margin", transportPerKm: 20, dailyHoldingCost: 100, holdingDays: 30, fuel: "any", annualKm: 12000 };
  expect((await page.request.post(`${command}/api/dealer/recommendations`, { data: { ...body, risk: "reckless" } })).status()).toBe(400);
  expect((await page.request.post(`${command}/api/dealer/recommendations`, { data: { ...body, risk: "cautious" } })).status()).toBe(200);
  expect((await page.request.post(`${command}/api/dealer/demo-plan`, { data: { plan: "starter" } })).status()).toBe(200);
  expect((await page.request.post(`${command}/api/dealer/recommendations`, { data: { ...body, count: 2 } })).status()).toBe(403);
});

test("WCAG 2.1 A/AA automated checks pass on the planner with results", async ({ page }) => {
  await growth(page);
  await page.getByRole("button", { name: "Find budget-fit acquisitions" }).click();
  await page.locator(".acquisition-option").first().waitFor();
  expect(await violations(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
