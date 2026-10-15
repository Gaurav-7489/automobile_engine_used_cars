import { test, expect } from "@playwright/test";
const command = "http://127.0.0.1:3001/command";
test("dealer can acquire by budget and manage server-enforced subscription tiers", async ({ page }, info) => {
  await page.goto(`${command}/subscriptions`);
  await page.getByRole("button", { name: "Use growth in local demo" }).click();
  await expect(page.getByText("Demo subscription updated")).toBeVisible();
  await page.goto(`${command}/acquisition`);
  await expect(page.getByRole("heading", { name: "Put your capital into the right cars." })).toBeVisible();
  await page.getByLabel("Buying strategy").selectOption("2");
  await page.getByRole("button", { name: "Find budget-fit acquisitions" }).click();
  await expect(page.locator(".acquisition-option").first()).toContainText("2021 Maruti Swift + 2020 Hyundai i20");
  await expect(page.locator(".acquisition-option").first()).toContainText("₹9,11,000");
  await page.screenshot({path:info.outputPath("dealer-acquisition.png"),fullPage:true});
  await page.getByLabel("Available capital (INR)").fill("50000");
  await page.getByRole("button", { name: "Find budget-fit acquisitions" }).click();
  await expect(page.getByText("No acquisitions fit these constraints", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Manage subscription →" }).click();
  await expect(page.locator(".dealer-plan-grid > section")).toHaveCount(3);
  await page.getByRole("button", { name: "Use starter in local demo" }).click();
  await expect(page.getByText("Demo subscription updated")).toBeVisible();
  await page.goto(`${command}/acquisition`);
  await expect(page.getByRole("option", { name: "Two cars · Growth / Scale" })).toHaveAttribute("disabled", "");
  const denied = await page.request.post(`${command}/api/dealer/recommendations`, { data: { budget:1000000,reserve:50000,city:"Kochi",latitude:9.9312,longitude:76.2673,radiusKm:600,count:2,goal:"margin",transportPerKm:20,dailyHoldingCost:100,holdingDays:30,fuel:"any",annualKm:12000,plan:"scale" } });
  expect(denied.status()).toBe(403);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test("dealer issues a scoped key, calls the business API and revokes access", async ({ page }, info) => {
  await page.goto(`${command}/subscriptions`);
  await page.getByRole("button", { name: "Use growth in local demo" }).click();
  await expect(page.getByText("Demo subscription updated")).toBeVisible();
  await page.goto(`${command}/developer`);
  await page.getByLabel("Business / integration name").fill("E2E business integration");
  await page.getByLabel("Expiry date").fill(new Date(Date.now()+30*86400000).toISOString().slice(0,10));
  await page.getByRole("button", { name: "Create API key", exact: true }).click();
  const field = page.getByLabel("New API key"); await expect(field).toBeVisible();
  const token = await field.inputValue();
  const response = await page.request.get(`${command}/api/v1/vehicles?city=Kochi`, { headers: { authorization: `Bearer ${token}` } });
  expect(response.status()).toBe(200); expect((await response.json()).data.total).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Revoke E2E business integration", exact: true }).last().click();
  await expect(page.getByText("Key revoked", { exact: true })).toBeVisible();
  const revoked = await page.request.get(`${command}/api/v1/vehicles`, { headers: { authorization: `Bearer ${token}` } });
  expect(revoked.status()).toBe(401);
  await page.getByRole("button", {name:"Hide key",exact:true}).click();
  await expect(field).toBeHidden();
  await page.screenshot({path:info.outputPath("dealer-business-api.png"),fullPage:true});
});

test("source configuration failure is visible, retained and paced without a provider request", async ({page,request},info) => {
  const sourceId=`fixture-unconfigured-${info.project.name}`;
  const name=`Fixture feed ${info.project.name}`;
  const approved=await request.post("http://127.0.0.1:3002/platform/api/commerce",{data:{
    action:"source",tenantId:"tenant-apex",source:{id:sourceId,name,kind:"licensed_api",
      agreement:"Isolated browser-test fixture; no live provider contract",dealerUse:true,redistribute:false,enabled:true,
      expiresAt:new Date(Date.now()+86400000).toISOString()},
  }});
  expect(approved.status()).toBe(200);
  await page.goto(`${command}/data-sources`);
  const card=page.locator("article").filter({has:page.getByRole("heading",{name,exact:true})});
  await expect(card).toContainText("No provider sync attempted yet.");
  await expect(card).toContainText("No vehicle observations imported");
  const response=page.waitForResponse(r=>r.url().endsWith("/api/dealer/sync")&&r.request().method()==="POST");
  await page.getByRole("button",{name:`Sync ${name}`,exact:true}).click();
  expect((await response).status()).toBe(503);
  await expect(card).toContainText("Provider configuration needs attention.");
  await expect(card).toContainText("Last successful provider sync: None yet");
  await expect(card).toContainText("Next sync available:");
  await expect(page.getByRole("button",{name:`Sync ${name}`,exact:true})).toBeDisabled();
  const retry=await request.post(`${command}/api/dealer/sync`,{data:{sourceId}});
  expect(retry.status()).toBe(429);
  await page.getByRole("button",{name:"Refresh source status",exact:true}).click();
  await expect(card).toContainText("Last sync failed");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath("source-sync-failure.png"),fullPage:true});
});


test("market intelligence keeps supplier quotes separate and filters explicit asking evidence", async ({ page, request }, info) => {
  const sourceId = `fixture-market-${info.project.name}`;
  const observedAt = new Date().toISOString(), expiresAt = new Date(Date.now() + 86400000).toISOString();
  expect((await request.post(`${command}/api/dealer/demo-plan`, { data: { plan: "growth" } })).status()).toBe(200);
  expect((await request.post("http://127.0.0.1:3002/platform/api/commerce", { data: { action: "source", tenantId: "tenant-apex", source: { id: sourceId, name: "Fictional market fixture", kind: "demo", agreement: "Isolated browser-test fixture only", dealerUse: true, redistribute: false, enabled: true, expiresAt } } })).status()).toBe(200);
  const vehicle = { sourceRecordId: "one", make: "Fixture", model: "Evidence", year: 2021, city: "Kochi", state: "Kerala", latitude: 9, longitude: 76, fuel: "petrol", transmission: "manual", odometerKm: 40000, purchasePrice: 300000, preparationCost: 10000, transferFees: 5000, resaleLow: null, resaleHigh: null, demandScore: null, mileageKmpl: null, evidence: "Fictional asking-price evidence for browser acceptance", observedAt, expiresAt, available: true };
  expect((await request.post(`${command}/api/dealer/import`, { data: { sourceId, vehicles: [vehicle] } })).status()).toBe(200);
  await page.goto(`${command}/market?sourceId=${sourceId}`);
  await expect(page.getByRole("heading", { name: "0 comparable asking-price records", exact: true })).toBeVisible();
  expect((await request.post(`${command}/api/dealer/import`, { data: { sourceId, vehicles: [{ ...vehicle, askingPrice: { amount: 500000, currency: "INR", observedAt } }, { ...vehicle, sourceRecordId: "two", askingPrice: { amount: 600000, currency: "INR", observedAt } }] } })).status()).toBe(200);
  await page.reload();
  await expect(page.getByRole("heading", { name: "2 comparable asking-price records", exact: true })).toBeVisible();
  await expect(page.getByLabel("Asking-price summary")).toContainText("₹5,50,000");
  await expect(page.getByRole("status")).toContainText("fictional examples");
  await page.getByText("Filter comparable records", { exact: true }).click();
  await page.getByLabel("Maximum asking price (INR)", { exact: true }).fill("550000");
  await page.getByRole("button", { name: "Compare asking prices", exact: true }).click();
  await expect(page).toHaveURL(/maxPrice=550000/);
  await expect(page.getByRole("heading", { name: "1 comparable asking-price records", exact: true })).toBeVisible();
  await expect(page.getByLabel("Asking-price summary")).toContainText("₹5,00,000");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("market-evidence.png"), fullPage: true });
  const api = await request.get(`${command}/api/dealer/market?sourceId=${sourceId}`);
  expect(api.status()).toBe(200); expect((await api.json()).data.distribution.median).toBe(550000);
  expect((await request.get(`${command}/api/dealer/market?maxAgeDays=0`)).status()).toBe(400);
});
