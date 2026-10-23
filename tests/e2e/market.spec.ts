import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const market = "http://127.0.0.1:3001/command/market";
const axeSource = readFileSync(createRequire(process.cwd() + "/package.json").resolve("axe-core"), "utf8");
async function violations(page: Page) {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const r = await (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return r.violations.map(v => ({ id: v.id, targets: v.nodes.slice(0, 4).map(n => n.target.join(" ")) }));
  });
}
const band = (page: Page) => page.getByRole("region", { name: "Market headline figures" });
const cohort = "?make=Maruti&model=Swift&minYear=2021&maxYear=2021&maxAgeDays=14";

test("the radar shows demonstration evidence, labelled, with a rated cohort and freshness", async ({ page }) => {
  await page.goto(`${market}${cohort}`);
  await expect(page.getByRole("heading", { level: 1, name: "What the market is asking." })).toBeVisible();
  await expect(page.getByText("Demonstration data — fictional records").first()).toBeVisible();
  await expect(band(page)).toContainText("Median asking price", { ignoreCase: true });
  await expect(band(page)).toContainText("Medium");
  await expect(band(page)).toContainText("Newest observation");
  await expect(page.getByText("8 matching records from 1 source")).toBeVisible();
  const evidence = page.getByRole("region", { name: "Comparable asking-price records" });
  await expect(evidence.locator("tbody tr")).toHaveCount(8);
  await expect(evidence).toContainText("Fictional demo record");
});

test("regional comparison offers the same numbers as a table", async ({ page }) => {
  await page.goto(`${market}${cohort}`);
  const regional = page.getByRole("figure").filter({ hasText: "Median asking price per city" });
  await expect(regional.getByRole("listitem")).toHaveCount(3);
  await regional.getByText("View as table").click();
  await expect(regional.getByRole("table").getByRole("rowheader")).toHaveText(["Bengaluru", "Chennai", "Kochi"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("filters are visible, shown as removable chips and narrow the evidence", async ({ page }) => {
  await page.goto(`${market}${cohort}`);
  await page.getByLabel("City", { exact: true }).fill("Kochi");
  await page.getByRole("button", { name: "Compare asking prices" }).click();
  await expect(page).toHaveURL(/city=Kochi/);
  const evidence = page.getByRole("region", { name: "Comparable asking-price records" });
  await expect(evidence.locator("tbody tr")).toHaveCount(3);
  await expect(band(page)).toContainText("Insufficient");
  await expect(page.getByText("Fewer than five records — no price should be inferred.")).toBeVisible();
  await page.getByRole("link", { name: "Remove City filter" }).click();
  await expect(page).not.toHaveURL(/city=/);
  await expect(evidence.locator("tbody tr")).toHaveCount(8);
});

test("no match is an honest empty state, and invalid filters are explained", async ({ page }) => {
  await page.goto(`${market}?make=Nonexistent`);
  await expect(band(page)).toContainText("No evidence");
  await expect(page.getByText("No eligible asking-price evidence matches")).toBeVisible();
  await page.goto(`${market}?minYear=2030&maxYear=2001`);
  await expect(page.locator("main").getByRole("alert")).toContainText("Enter valid numeric fields");
  await expect(page.getByRole("link", { name: "Reset market filters" })).toBeVisible();
});

test("a mixed cohort caps evidence quality and says so", async ({ page }) => {
  await page.goto(`${market}?maxAgeDays=14`);
  await expect(band(page)).not.toContainText("High");
  await page.getByText("Limitations that always apply").click();
  await expect(page.getByText("Asking prices are advertised amounts")).toBeVisible();
});

test("WCAG 2.1 A/AA automated checks pass on the radar", async ({ page }) => {
  await page.goto(`${market}${cohort}`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  expect(await violations(page)).toEqual([]);
});
