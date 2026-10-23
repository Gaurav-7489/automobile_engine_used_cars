import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const inventory = "http://127.0.0.1:3001/command/inventory", api = "http://127.0.0.1:3001/command/api";
const axeSource = readFileSync(createRequire(process.cwd() + "/package.json").resolve("axe-core"), "utf8");
async function violations(page: Page) {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const r = await (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return r.violations.map(v => ({ id: v.id, targets: v.nodes.slice(0, 4).map(n => n.target.join(" ")) }));
  });
}

test("the page leads with stock figures, labels demo data and keeps the operations table", async ({ page }) => {
  await page.goto(inventory);
  await expect(page.getByRole("heading", { level: 1, name: "Stock that needs a decision." })).toBeVisible();
  const band = page.getByRole("region", { name: "Inventory headline figures" });
  for (const label of ["Unsold stock", "Needs review", "Aged 90+ days", "Price approvals"]) await expect(band).toContainText(label, { ignoreCase: true });
  await expect(page.getByText("Demonstration data — fictional records").first()).toBeVisible();
  await expect(page.getByRole("table", { name: "Inventory intelligence" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Dealership inventory" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Enter a vehicle" }).or(page.getByText("Enter a vehicle", { exact: true })).first()).toBeAttached();
});

test("filters mark the current view, survive reload and fall back safely", async ({ page }) => {
  await page.goto(inventory);
  const nav = page.getByRole("navigation", { name: "Show inventory" });
  await expect(nav.getByRole("link", { name: "All unsold" })).toHaveAttribute("aria-current", "page");
  const all = await page.getByRole("table", { name: "Inventory intelligence" }).locator("tbody tr").count();
  expect(all).toBeGreaterThan(0);
  await nav.getByRole("link", { name: "Aged 90+ days" }).click();
  await expect(page).toHaveURL(/view=aged/);
  await expect(nav.getByRole("link", { name: "Aged 90+ days" })).toHaveAttribute("aria-current", "page");
  expect(await page.getByRole("table", { name: "Inventory intelligence" }).locator("tbody tr").count()).toBeLessThanOrEqual(all);
  await page.reload();
  await expect(nav.getByRole("link", { name: "Aged 90+ days" })).toHaveAttribute("aria-current", "page");
  await page.goto(`${inventory}?view=nonsense`);
  await expect(nav.getByRole("link", { name: "All unsold" })).toHaveAttribute("aria-current", "page");
});

test("every row states its age basis and margin without inventing a cost", async ({ page }) => {
  await page.goto(inventory);
  const row = page.getByRole("table", { name: "Inventory intelligence" }).locator("tbody tr").first();
  await expect(row).toContainText(/from (acquisition|listing date)|no usable date/);
  await expect(row.getByRole("cell").nth(2)).toContainText(/No cost record|[+−]₹/);
});

test("a request raised in the interface appears as pending and its author cannot decide it", async ({ page, request }) => {
  // Other specs share this demo state, so use an unsold vehicle with no request yet.
  const data = (await (await request.get(`${api}/snapshot`)).json()).data;
  const v = data.vehicles.find((x: { id: string; availabilityStatus: string }) => x.availabilityStatus === "available" && !(data.priceRequests ?? []).some((r: { vehicleId: string }) => r.vehicleId === x.id));
  const id = v.id;
  await page.goto(`${inventory}?all=1`);
  const row = page.locator(`#insight-${id}`);
  await row.getByText("Request price change").click();
  await row.getByLabel(`Proposed price ${v.stockId}`).fill(String(Math.round(v.price * 0.7)));
  await row.getByLabel(`Reason ${v.stockId}`).fill("Aged stock, clearing for the next intake");
  await row.getByRole("button", { name: "Send for approval" }).click();
  // The row swaps its form for the pending note as soon as the page refreshes, so wait for that outcome.
  await expect(row).toContainText("Request pending");
  const pending = page.getByRole("list", { name: "Pending price requests" }).getByRole("listitem").filter({ hasText: v.stockId });
  await expect(pending).toContainText("Aged stock, clearing for the next intake");
  await expect(pending).toContainText("You raised this request, so someone else must decide it.");
  await expect(pending.getByRole("button", { name: /Approve/ })).toHaveCount(0);
  const snapshot = (await (await request.get(`${api}/snapshot`)).json()).data;
  expect(snapshot.priceRequests.find((r: { vehicleId: string }) => r.vehicleId === id).status).toBe("pending");
  expect(snapshot.vehicles.find((x: { id: string }) => x.id === id).price).toBe(v.price);
  // A second request for the same vehicle is refused while one is pending.
  const again = await request.post(`${api}/inventory/price-requests`, { data: { vehicleId: id, proposedPrice: Math.round(v.price * 0.6), note: "Again", expectedVersion: v.version ?? 0 } });
  expect(again.status()).toBe(409);
  const own = await request.patch(`${api}/inventory/price-requests/${snapshot.priceRequests.find((r: { vehicleId: string }) => r.vehicleId === id).id}`, { data: { decision: "approved" } });
  expect(own.status()).toBe(403);
});

test("price requests validate input and the server refuses requests that need no approval", async ({ request }) => {
  const data = (await (await request.get(`${api}/snapshot`)).json()).data;
  const v = data.vehicles.find((x: { availabilityStatus: string }) => x.availabilityStatus === "available"), id = v.id;
  const call = (data: object) => request.post(`${api}/inventory/price-requests`, { data: { vehicleId: id, expectedVersion: v.version ?? 0, ...data } });
  expect((await call({ proposedPrice: -5, note: "x" })).status()).toBe(400);
  expect((await call({ proposedPrice: 100000, note: "" })).status()).toBe(400);
  expect((await call({ proposedPrice: Math.round(v.price * 0.99), note: "Tiny change" })).status()).toBe(400);
  expect((await request.post(`${api}/inventory/price-requests`, { data: { proposedPrice: 1, note: "x" } })).status()).toBe(400);
  expect((await request.patch(`${api}/inventory/price-requests/not-a-request`, { data: { decision: "approved" } })).status()).toBeGreaterThanOrEqual(400);
});

test("WCAG 2.1 A/AA automated checks pass on inventory intelligence", async ({ page }) => {
  await page.goto(inventory);
  await page.getByRole("heading", { level: 1 }).waitFor();
  expect(await violations(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
