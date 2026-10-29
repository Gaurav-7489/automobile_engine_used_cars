import { test, expect, type Page } from "@playwright/test";

/**
 * Drives the workspace pages against a large synthetic dealership in a LOCAL test database (see scripts/perf). The account is
 * given by LOCAL_SCALE_USER / LOCAL_SCALE_PASSWORD; the spec is skipped when it is not set.
 */
const user = process.env.LOCAL_SCALE_USER;
const password = process.env.LOCAL_SCALE_PASSWORD ?? "";
test.skip(!user, "LOCAL_SCALE_USER is not set");

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/business email/i).fill(user!);
  await page.getByLabel(/^password/i).fill(password);
  await page.getByRole("button", { name: /^sign in/i }).click();
  await page.waitForURL(/\/app\//);
}

test("large dealership: every page loads only what it shows, and actions persist", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console ${m.text()}`); });
  page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 500) problems.push(`${r.status()} ${r.url()}`); });
  await signIn(page);

  // The document itself carries no records: its size does not depend on the dealership's size.
  // (Fetched from inside the page so the secure session cookie is sent.)
  const fetchText = (url: string) => page.evaluate(async (u) => (await fetch(u, { credentials: "include" })).text(), url);
  const html = await fetchText("/app/inventory");
  expect(html).toContain("Inventory management");
  expect(html.length).toBeLessThan(120_000);

  // Overview: figures arrive from the aggregate endpoint and are not zero for a stocked dealership.
  await page.goto("/app/overview");
  await expect(page.getByRole("heading", { name: /command centre/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Available stock/ })).toBeVisible();
  await expect(page.locator(".kpi-value").first()).not.toHaveText("0");

  // Inventory: server-side paging, filter, sort. Only one page of rows is in the DOM.
  await page.goto("/app/inventory");
  await expect(page.getByRole("table", { name: "Inventory" })).toBeVisible();
  const rows = page.getByRole("table", { name: "Inventory" }).locator("tbody tr");
  await expect(rows).toHaveCount(25);
  await expect(page.getByText(/1-25 of \d+/)).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText(/26-50 of \d+/)).toBeVisible();
  await page.goto("/app/inventory?q=kia&sort=asking&dir=desc");
  await expect(rows.first()).toBeVisible();
  const kia = await rows.allInnerTexts();
  expect(kia.every((t) => /kia/i.test(t))).toBe(true);

  // Detail page loads one record.
  await Promise.all([page.waitForURL(/\/app\/inventory\/SYN-/), rows.first().getByRole("link").first().click()]);
  await expect(page.getByRole("heading", { name: /Stock record/ })).toBeVisible();

  // Leads: paged list, stage tabs from server counts, open a lead.
  await page.goto("/app/leads?created=all");
  const leadRows = page.getByRole("table", { name: "Leads" }).locator("tbody tr");
  await expect(leadRows).toHaveCount(25);
  await leadRows.first().getByRole("button").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  // Reports, capital, alerts all render from aggregates without errors.
  for (const path of ["/app/reports", "/app/capital", "/app/alerts", "/app/pricing", "/app/advertising"]) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
    // Skeleton placeholders have been replaced by content.
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  }

  // A change made in the browser is saved by the server, shown with the server's id, and survives a reload.
  await page.goto("/app/leads?created=all&view=pipeline");
  await page.getByRole("button", { name: "Add lead" }).first().click();
  const dialog = page.getByRole("dialog");
  const marker = `Scale Test ${Date.now().toString(36)}`;
  await dialog.getByLabel("Name").fill(marker);
  await dialog.getByLabel("Phone").fill("+91 90000 11111");
  await dialog.getByLabel(/^Source/).selectOption({ index: 1 });
  await dialog.getByLabel(/^Vehicle/).selectOption("unspecified");
  await dialog.getByLabel(/^Consent provenance/).fill("Verbal at showroom");
  await dialog.getByRole("button", { name: "Add lead" }).click();
  await expect(dialog).toBeHidden();
  // The server confirmed and stored it: the lead list (a fresh server read) contains exactly one such lead with a real, sequential id.
  await expect.poll(async () => {
    const body = JSON.parse(await fetchText("/api/leads?created=all&order=recent&size=5")) as { leads: { id: string; name: string }[] };
    return body.leads.filter((l) => l.name === marker).map((l) => l.id);
  }, { timeout: 10_000 }).toHaveLength(1);
  const saved = (JSON.parse(await fetchText("/api/leads?created=all&order=recent&size=5")) as { leads: { id: string; name: string }[] }).leads.find((l) => l.name === marker)!;
  expect(saved.id).toMatch(/^L-\d{4,6}$/);
  await page.reload();
  await expect(page.getByText(marker).first()).toBeVisible();
  expect(problems).toEqual([]);
});
