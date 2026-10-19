import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const command = "http://127.0.0.1:3001/command", site = "http://127.0.0.1:3000";
const axeSource = readFileSync(createRequire(process.cwd() + "/package.json").resolve("axe-core"), "utf8");

/** A fresh lead with one follow-up that was due long ago, so the Action Center must surface it. */
async function overdueTask(request: APIRequestContext, title: string) {
  const lead = await request.post(`${site}/api/leads`, { data: { name: `Cockpit Buyer ${title}`, phone: "+91 90000 00077", intent: "finance", vehicleId: "veh-3", whatsappConsent: true, marketingConsent: false } });
  expect(lead.status()).toBe(201);
  const { leadId } = await lead.json();
  const task = await request.post(`${command}/api/leads/${leadId}/tasks`, { data: { title, owner: "Maya", dueAt: "2026-01-01T10:00:00Z", priority: "high" } });
  expect(task.status()).toBe(201);
  return { leadId, taskId: (await task.json()).data.id as string };
}

async function violations(page: Page) {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const result = await (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }> } }).axe
      .run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return result.violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.slice(0, 4).map(n => n.target.join(" ")) }));
  });
}

test("the cockpit leads with headline figures from recorded data and labels demonstration records", async ({ page }) => {
  await page.goto(`${command}`);
  await expect(page.getByRole("heading", { level: 1, name: "Today, decided." })).toBeVisible();
  const band = page.getByRole("region", { name: "Headline figures" });
  for (const label of ["Unsold stock", "Capital in stock", "Recorded contribution", "Open pipeline"]) await expect(band).toContainText(label, { ignoreCase: true });
  await expect(band).toContainText("never treated as zero");
  await expect(page.getByText("Demonstration data — fictional records")).toBeVisible();
  // The sidebar collapses into a menu on small screens, so check the link exists rather than that it is on screen.
  await expect(page.locator('a[href$="/actions"]').first()).toBeAttached();
});

test("an overdue follow-up surfaces as critical, resolves in place, and disappears once completed", async ({ page, request }, info) => {
  const title = `Cockpit chase ${info.project.name} ${Date.now()}`;
  await overdueTask(request, title);
  await page.goto(`${command}/actions?category=task`);
  const item = page.getByRole("listitem").filter({ hasText: title });
  await expect(item).toBeVisible();
  await expect(item).toContainText("Critical");
  await expect(item).toContainText("high priority");
  await item.getByText("Why this is flagged").click();
  await expect(item).toContainText("Overdue by");
  await item.getByRole("button", { name: `Complete ${title}` }).click();
  await expect(page.getByRole("listitem").filter({ hasText: title })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(title)).toHaveCount(0);
});

test("type filters narrow the list, mark the current filter and agree with their counts", async ({ page, request }, info) => {
  await overdueTask(request, `Filter probe ${info.project.name} ${Date.now()}`);
  await page.goto(`${command}/actions`);
  const filters = page.getByRole("navigation", { name: "Filter actions by type" });
  await expect(filters.getByRole("link", { name: /^All/ })).toHaveAttribute("aria-current", "page");
  const tasks = filters.getByRole("link", { name: /^Tasks/ });
  const expected = Number((await tasks.innerText()).replace(/\D/g, ""));
  expect(expected).toBeGreaterThan(0);
  await tasks.click();
  await expect(page).toHaveURL(/category=task/);
  await expect(filters.getByRole("link", { name: /^Tasks/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("list", { name: "Required actions" }).getByRole("listitem")).toHaveCount(expected);
  await page.goto(`${command}/actions?category=not-a-category`);
  await expect(filters.getByRole("link", { name: /^All/ })).toHaveAttribute("aria-current", "page");
});

test("every chart has the same values in an accessible table and a keyboard-reachable detail", async ({ page }) => {
  await page.goto(command);
  const pipeline = page.getByRole("figure").filter({ hasText: "Leads currently in each open stage" });
  const rows = pipeline.getByRole("listitem");
  await expect(rows).toHaveCount(7);
  const first = rows.first();
  await first.focus();
  await expect(first).toBeFocused();
  expect(await first.getAttribute("data-tip")).toMatch(/^New: \d+/);
  await pipeline.getByText("View as table").click();
  const table = pipeline.getByRole("table");
  await expect(table.getByRole("row")).toHaveCount(8);
  await expect(table.getByRole("rowheader", { name: "Negotiation" })).toBeVisible();
  const age = page.getByRole("figure").filter({ hasText: "Unsold vehicles per age band" });
  await age.getByText("View as table").click();
  await expect(age.getByRole("table").getByRole("rowheader")).toHaveText(["0–30 days", "31–60 days", "61–90 days", "Over 90 days"]);
  // Regression: the app's global table min-width once made an opened table push the page wider than a phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("plan meters expose their value to assistive technology", async ({ page }) => {
  await page.goto(command);
  const meter = page.getByRole("meter", { name: "Unsold vehicles" });
  await expect(meter).toBeVisible();
  expect(Number(await meter.getAttribute("aria-valuemax"))).toBeGreaterThan(0);
  await expect(meter).toHaveAttribute("aria-valuetext", /of \d+/);
});

for (const path of ["", "/actions"]) {
  test(`WCAG 2.1 A/AA automated checks pass on ${path || "/overview"}`, async ({ page }) => {
    await page.goto(`${command}${path}`);
    await page.getByRole("heading", { level: 1 }).waitFor();
    expect(await violations(page)).toEqual([]);
  });
}

test("the cockpit stays within the viewport and keeps controls reachable", async ({ page }) => {
  await page.goto(command);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const targets = page.getByRole("list", { name: "Required actions" }).getByRole("link", { name: /^Open:/ });
  const count = await targets.count();
  for (let i = 0; i < Math.min(count, 4); i++) {
    const box = await targets.nth(i).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(36);
  }
});
