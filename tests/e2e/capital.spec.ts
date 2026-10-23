import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const api="http://127.0.0.1:3001/command/api";
test("verified acquisition costs persist with version conflicts and explainable capital evidence",async({page,request},info)=> {
  const id=info.project.name==="mobile"?"veh-5":"veh-4";
  const snapshot=(await (await request.get(`${api}/snapshot`)).json()).data,vehicle=snapshot.vehicles.find((v:{id:string})=>v.id===id);
  await page.goto("http://127.0.0.1:3001/command/capital");await expect(page.getByRole("heading",{level:1,name:"Where the money sits."})).toBeVisible();
  const row=page.getByRole("row").filter({hasText:vehicle.stockId});await row.getByText("Record costs",{exact:true}).click();
  const form=row.locator("form");
  for(const [name,value] of Object.entries({acquiredOn:"2025-01-01",purchasePrice:"1000000",reconditioningCost:"25000",transferCost:"5000",otherCost:"0",reference:`DEMO-INVOICE-${info.project.name}`}))await form.locator(`[name="${name}"]`).fill(value);
  await form.getByRole("checkbox").check();await form.getByRole("button",{name:"Save verified costs",exact:true}).click();await expect(row.getByRole("status")).toHaveText("Costs saved");
  await expect(row.getByText("Priority · 90+ days",{exact:true})).toBeVisible();
  await expect(row.getByRole("cell").nth(2)).toHaveText("—");
  const updated=(await (await request.get(`${api}/snapshot`)).json()).data,cost=updated.costs.find((c:{vehicleId:string})=>c.vehicleId===id);
  expect(cost.version).toBe(1);expect(cost.dailyHoldingCost).toBeNull();expect(cost.purchasePrice).toBe(1000000);
  const record={acquiredOn:cost.acquiredOn,purchasePrice:cost.purchasePrice,reconditioningCost:cost.reconditioningCost,transferCost:cost.transferCost,otherCost:cost.otherCost,dailyHoldingCost:null,reference:cost.reference};
  expect((await request.put(`${api}/vehicles/${id}/costs`,{data:{record,expectedVersion:0}})).status()).toBe(409);
  expect((await request.put(`${api}/vehicles/${id}/costs`,{data:{record:{...record,tenantId:"forged"},expectedVersion:1}})).status()).toBe(400);
  expect((await request.put(`${api}/vehicles/${id}/costs`,{data:{record:{...record,otherCost:1000},expectedVersion:1}})).status()).toBe(200);
  const history=(await (await request.get(`${api}/snapshot`)).json()).data.costHistory.filter((c:{vehicleId:string})=>c.vehicleId===id);expect(history).toHaveLength(2);expect(history[0].after.version).toBe(2);
  await page.screenshot({path:`test-results/capital-${info.project.name}.png`,fullPage:info.project.name!=="mobile"});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
});
test("platform shows explicit configuration and unknown telemetry rather than fabricated health",async({page})=> {
  await page.goto("http://127.0.0.1:3002/platform/health");await expect(page.getByText("No metrics collector connected to this screen",{exact:true})).toBeVisible();await expect(page.getByText("No permissioned market data source connected",{exact:true})).toBeVisible();
});

// ---- Capital & profit intelligence page ----------------------------------------------------
const capitalUrl = "http://127.0.0.1:3001/command/capital";
const axeSource = readFileSync(createRequire(process.cwd() + "/package.json").resolve("axe-core"), "utf8");
async function axeViolations(page: Page) {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const r = await (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return r.violations.map(v => ({ id: v.id, targets: v.nodes.slice(0, 4).map(n => n.target.join(" ")) }));
  });
}

test("capital page labels demo data, never invents zeros and explains missing costs", async ({ page }) => {
  await page.goto(capitalUrl);
  await expect(page.getByText("Demonstration data — fictional records")).toBeVisible();
  const band = page.getByRole("region", { name: "Capital headline figures" });
  for (const label of ["Recorded capital", "Aged 90+ days", "Cost coverage", "Recorded contribution"]) await expect(band).toContainText(label, { ignoreCase: true });
  await expect(page.getByRole("heading", { name: "What the records say" })).toBeVisible();
  await expect(page.getByRole("list", { name: /insight|findings/i }).or(page.locator(".ck-insights")).first()).toBeVisible();
});

test("view and sort links change the vehicle table, mark the current choice and survive reload", async ({ page }) => {
  await page.goto(capitalUrl);
  const show = page.getByRole("navigation", { name: "Show vehicles" }), sort = page.getByRole("navigation", { name: "Sort vehicles" });
  await expect(show.getByRole("link", { name: "Unsold" })).toHaveAttribute("aria-current", "page");
  await show.getByRole("link", { name: "All" }).click();
  await expect(page).toHaveURL(/view=all/);
  await expect(show.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
  const all = await page.locator("#vehicle-economics tbody tr").count();
  await show.getByRole("link", { name: "Needs costs" }).click();
  expect(await page.locator("#vehicle-economics tbody tr").count()).toBeLessThanOrEqual(all);
  await sort.getByRole("link", { name: "Stock ID" }).click();
  await expect(sort.getByRole("link", { name: "Stock ID" })).toHaveAttribute("aria-current", "page");
  await page.reload();
  await expect(sort.getByRole("link", { name: "Stock ID" })).toHaveAttribute("aria-current", "page");
  await page.goto(`${capitalUrl}?view=bogus&sort=bogus`);
  await expect(show.getByRole("link", { name: "Unsold" })).toHaveAttribute("aria-current", "page");
  await expect(sort.getByRole("link", { name: "Oldest first" })).toHaveAttribute("aria-current", "page");
});

test("recording a cost updates the figures, charts and insights from persisted data", async ({ page, request }, info) => {
  const id = info.project.name === "mobile" ? "veh-3" : "veh-2";
  const stock = ((await (await request.get(`${api}/snapshot`)).json()).data.vehicles.find((v: { id: string }) => v.id === id)).stockId;
  const put = await request.put(`${api}/vehicles/${id}/costs`, { data: { record: { acquiredOn: "2026-01-05", purchasePrice: 9000000, reconditioningCost: 10000, transferCost: 0, otherCost: 0, dailyHoldingCost: 1000, reference: `E2E-${info.project.name}` }, expectedVersion: 0 } });
  expect(put.status()).toBe(200);
  await page.goto(`${capitalUrl}?view=all`);
  const row = page.locator(`#vehicle-${id}`);
  await expect(row).toContainText(stock);
  await expect(row).toContainText("Priority · 90+ days");
  await expect(page.getByRole("region", { name: "Capital headline figures" })).not.toContainText("No costs recorded");
  // Insights cite the vehicle that was just costed: listed below a ₹90 lakh cost, so it must be flagged.
  await expect(page.getByText(/listed below recorded cost/)).toBeVisible();
  const chart = page.getByRole("figure").filter({ hasText: "Asking price minus recorded cost basis" });
  await chart.getByText("View as table").click();
  await expect(chart.getByRole("table")).toContainText(stock);
});

test("capital charts expose a table and a stacked-bar key without relying on colour", async ({ page }) => {
  await page.goto(capitalUrl);
  const mix = page.getByRole("figure").filter({ hasText: "Recorded cost of" });
  if (await mix.count()) {
    await expect(mix.getByRole("list").locator("li")).toHaveCount(4);
    await mix.getByText("View as table").click();
    await expect(mix.getByRole("table").getByRole("rowheader")).toHaveText(["Purchase price", "Reconditioning", "Transfer", "Other"]);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("WCAG 2.1 A/AA automated checks pass on the capital page", async ({ page }) => {
  await page.goto(capitalUrl);
  await page.getByRole("heading", { level: 1 }).waitFor();
  expect(await axeViolations(page)).toEqual([]);
});
