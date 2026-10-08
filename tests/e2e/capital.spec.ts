import { test, expect } from "@playwright/test";
const api="http://127.0.0.1:3001/command/api";
test("verified acquisition costs persist with version conflicts and explainable capital evidence",async({page,request},info)=> {
  const id=info.project.name==="mobile"?"veh-5":"veh-4";
  const snapshot=(await (await request.get(`${api}/snapshot`)).json()).data,vehicle=snapshot.vehicles.find((v:{id:string})=>v.id===id);
  await page.goto("http://127.0.0.1:3001/command/capital");await expect(page.getByRole("heading",{name:"Capital & acquisition age",exact:true})).toBeVisible();
  const row=page.getByRole("row").filter({hasText:vehicle.stockId});await row.getByText("Record costs",{exact:true}).click();
  const form=row.locator("form");
  for(const [name,value] of Object.entries({acquiredOn:"2025-01-01",purchasePrice:"1000000",reconditioningCost:"25000",transferCost:"5000",otherCost:"0",reference:`DEMO-INVOICE-${info.project.name}`}))await form.locator(`[name="${name}"]`).fill(value);
  await form.getByRole("checkbox").check();await form.getByRole("button",{name:"Save verified costs",exact:true}).click();await expect(row.getByRole("status")).toHaveText("Costs saved");
  await expect(row.getByText("priority",{exact:true})).toBeVisible();
  await expect(row.getByRole("cell",{name:"Unknown",exact:true})).toHaveCount(1);
  const updated=(await (await request.get(`${api}/snapshot`)).json()).data,cost=updated.costs.find((c:{vehicleId:string})=>c.vehicleId===id);
  expect(cost.version).toBe(1);expect(cost.dailyHoldingCost).toBeNull();expect(cost.purchasePrice).toBe(1000000);
  const record={acquiredOn:cost.acquiredOn,purchasePrice:cost.purchasePrice,reconditioningCost:cost.reconditioningCost,transferCost:cost.transferCost,otherCost:cost.otherCost,dailyHoldingCost:null,reference:cost.reference};
  expect((await request.put(`${api}/vehicles/${id}/costs`,{data:{record,expectedVersion:0}})).status()).toBe(409);
  expect((await request.put(`${api}/vehicles/${id}/costs`,{data:{record:{...record,tenantId:"forged"},expectedVersion:1}})).status()).toBe(400);
  expect((await request.put(`${api}/vehicles/${id}/costs`,{data:{record:{...record,otherCost:1000},expectedVersion:1}})).status()).toBe(200);
  const history=(await (await request.get(`${api}/snapshot`)).json()).data.costHistory.filter((c:{vehicleId:string})=>c.vehicleId===id);expect(history).toHaveLength(2);expect(history[0].after.version).toBe(2);
  await page.screenshot({path:`test-results/capital-${info.project.name}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
});
test("platform shows explicit configuration and unknown telemetry rather than fabricated health",async({page})=> {
  await page.goto("http://127.0.0.1:3002/platform/health");await expect(page.getByText("No metrics collector connected to this screen",{exact:true})).toBeVisible();await expect(page.getByText("No permissioned market data source connected",{exact:true})).toBeVisible();
});
