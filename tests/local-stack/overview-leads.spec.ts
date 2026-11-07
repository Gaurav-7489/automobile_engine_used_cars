import { test, expect, type Page } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Overview and Leads redesign: readable priority actions, the List / Pipeline switch beside the filters, no sideways page scroll. Needs LOCAL_SCALE_USER / LOCAL_SCALE_PASSWORD. */
const user = process.env.LOCAL_SCALE_USER, password = process.env.LOCAL_SCALE_PASSWORD ?? "";
test.skip(!user, "LOCAL_SCALE_USER is not set");

// Sign in once and share the session: a fresh sign-in per test would trip the login rate limit.
const STATE = join(tmpdir(), `vl-overview-leads-${process.pid}.json`);
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: { cookies: [], origins: [] } });
  await page.goto("/login");
  await page.getByLabel(/business email/i).fill(user!);
  await page.getByLabel(/^password/i).fill(password);
  await page.getByRole("button", { name: /^sign in/i }).click();
  await page.waitForURL(/\/app\//);
  await page.context().storageState({ path: STATE });
  await page.close();
});
test.use({ storageState: STATE });
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const [name, size] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }], ["narrow", { width: 320, height: 700 }]] as const) {
  test(`overview and leads fit the screen (${name})`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/app/overview");
    await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
    expect(await sideways(page)).toBe(0);
    await page.goto("/app/leads?created=all&view=pipeline");
    await expect(page.getByRole("list", { name: "Pipeline by canonical stage" })).toBeVisible();
    expect(await sideways(page)).toBe(0);
  });
}

test("priority actions are a list with a clear action per item", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/overview");
  const list = page.getByRole("list", { name: "Priority actions" });
  const empty = page.getByRole("heading", { name: "All caught up" });
  await expect(list.or(empty)).toBeVisible({ timeout: 15_000 });
  if (await list.isVisible()) {
    const first = list.getByRole("listitem").first();
    await expect(first.getByRole("link")).toHaveAccessibleName(/^(Review|Open lead|Inspect|View): /);
  }
});

test("the view switch beside the filters moves between list and pipeline, and the overdue chip toggles", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/leads?created=all");
  const filters = page.getByRole("group", { name: "Filters" });
  await filters.getByRole("group", { name: "View" }).getByRole("button", { name: "Pipeline" }).click();
  await expect(page).toHaveURL(/view=pipeline/);
  await expect(page.getByRole("list", { name: "Pipeline by canonical stage" })).toBeVisible();
  await filters.getByRole("group", { name: "View" }).getByRole("button", { name: "List" }).click();
  await expect(page).not.toHaveURL(/view=pipeline/);
  const overdue = filters.getByRole("button", { name: "Overdue only" });
  await expect(overdue).toHaveAttribute("aria-pressed", "false");
  await overdue.click();
  await expect(page).toHaveURL(/overdue=1/);
  await expect(overdue).toHaveAttribute("aria-pressed", "true");
});

test("tabs and view switches change the screen at once, without a server round trip", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/leads?created=all");
  await expect(page.getByRole("table", { name: "Leads" })).toBeVisible({ timeout: 15_000 });
  const rsc: string[] = [];
  // Only server renders of this page count (the menu prefetches other pages in the background, which is fine).
  page.on("request", (r) => { const u = new URL(r.url()); if (u.pathname === "/app/leads" && (r.headers()["rsc"] || u.searchParams.has("_rsc"))) rsc.push(r.url()); });
  const started = Date.now();
  await page.getByRole("group", { name: "Filters" }).getByRole("group", { name: "View" }).getByRole("button", { name: "Pipeline" }).click();
  await expect(page).toHaveURL(/view=pipeline/, { timeout: 1000 });
  expect(Date.now() - started).toBeLessThan(1000);
  await page.getByRole("tab", { name: "New" }).click();
  await expect(page).toHaveURL(/stage=New/, { timeout: 1000 });
  expect(rsc, "no server render request for query-string changes").toEqual([]);
  // Back returns to the previous filter state in the browser.
  await page.goBack();
  await expect(page).not.toHaveURL(/stage=New/);
});

test("a followed link shows it is loading until the next page arrives", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/overview");
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  // Record the moment the link is marked (the next page may already be prefetched and arrive almost at once).
  await page.evaluate(() => {
    (window as unknown as { marked: string[] }).marked = [];
    new MutationObserver((list) => { for (const m of list) if ((m.target as Element).getAttribute("data-pending") === "true") (window as unknown as { marked: string[] }).marked.push((m.target as Element).textContent ?? ""); })
      .observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-pending"] });
  });
  const link = page.locator("nav").getByRole("link", { name: /^Leads/ }).first();
  await link.click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { marked: string[] }).marked.length)).toBeGreaterThan(0);
  await page.waitForURL(/\/app\/leads/);
  await expect(page.locator("[data-pending]")).toHaveCount(0, { timeout: 8000 });
});
