import { test, expect } from "@playwright/test";

test("inventory filters round-trip and shortlist persists with a three-car limit", async ({ page }) => {
  await page.goto("/inventory?q=BMW&sort=price-low");
  await expect(page.getByPlaceholder("BMW, SUV, automatic...")).toHaveValue("BMW");
  await expect(page.getByLabel("Sort", { exact: true })).toHaveValue("price-low");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator(".inventory-list")).toBeVisible();
  await page.reload();
  await expect(page.locator(".inventory-list")).toBeVisible();
  await page.getByRole("button", { name: "Reset all" }).click();
  const cards = page.locator(".vehicle-card");
  for (let i = 0; i < 3; i++) await cards.nth(i).getByRole("button", { name: "Add to compare", exact: true }).click();
  await cards.nth(3).getByRole("button", { name: "Add to compare", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Your comparison has three cars" })).toHaveCount(1);
  await expect(page.locator(".vehicle-card button[aria-pressed=true]")).toHaveCount(3);
  await page.reload();
  await expect(page.locator(".vehicle-card button[aria-pressed=true]")).toHaveCount(3);
  await page.getByRole("button", { name: "My shortlist (3)" }).click();
  await expect(cards).toHaveCount(3);
  await page.getByRole("link", { name: "Compare 3 selected" }).click();
  await expect(page.locator(".compare-product")).toHaveCount(3);
  await page.locator(".compare-product").first().getByRole("button", { name: /^Remove / }).click();
  await expect(page.locator(".compare-product")).toHaveCount(2);
  await page.getByRole("link", { name: "Inventory", exact: true }).click();
  await expect(page.locator(".vehicle-card button[aria-pressed=true]")).toHaveCount(2);
});

test("comparison passes the complete shortlist and intent into a persisted lead", async ({ page, request }) => {
  await page.goto("/compare?ids=veh-2,veh-4");
  await expect(page.locator(".compare-product")).toHaveCount(2);
  await page.getByLabel("Show differences only").check();
  await expect(page.getByRole("rowheader", { name: "Availability", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: /^Talk through the shortlist/ }).click();
  await expect(page.locator(".contact-context a")).toHaveCount(2);
  await page.getByRole("button", { name: /Discuss an exchange/ }).click();
  await expect(page.getByLabel("I want to")).toHaveValue("exchange");
  await page.getByLabel("Name", { exact: true }).fill("Connected shortlist QA");
  await page.getByLabel("Phone", { exact: true }).fill("+91 90000 00777");
  const responsePromise = page.waitForResponse(response => response.url().endsWith("/api/leads") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Send request", exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const submitted = response.request().postDataJSON();
  expect(submitted.intent).toBe("exchange");
  expect(submitted.vehicleIds).toEqual(["veh-2", "veh-4"]);
  expect(submitted.notes).toContain("Compared shortlist:");
  const lead = await response.json();
  expect(lead.vehicleIds).toEqual(["veh-2", "veh-4"]);
  const snapshot = await (await request.get("http://127.0.0.1:3001/command/api/snapshot")).json();
  const stored = snapshot.data.leads.find((item: { id: string }) => item.id === lead.leadId);
  expect(stored.vehicleIds).toEqual(["veh-2", "veh-4"]);
  expect(stored.journey.vehicleInterestHistory).toEqual(["veh-2", "veh-4"]);
  await expect(page.getByRole("heading", { name: "We have the context." })).toBeVisible();
  for (const vehicleIds of [["veh-2", "not-published"], ["veh-1", "veh-2", "veh-3", "veh-4"]]) {
    const invalid = await request.post("/api/leads", { data: { name: "Invalid shortlist", phone: "123", vehicleIds } });
    expect(invalid.status()).toBe(400);
  }
});

test("desktop tour is keyboard navigable and vehicle photography opens accessibly", async ({ page }) => {
  await page.goto("/download");
  const inventoryTab = page.getByRole("tab", { name: "Inventory", exact: true });
  await inventoryTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Lead journey" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("ILLUSTRATIVE WORKFLOW");
  await page.keyboard.press("ArrowRight");
  await page.getByLabel("Workspace URL", { exact: true }).fill("http://dealer.example/command");
  await page.getByRole("button", { name: "Check URL format" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Use a complete HTTPS" })).toBeVisible();
  await page.getByLabel("Workspace URL", { exact: true }).fill("https://dealer.example/command");
  await page.getByRole("button", { name: "Check URL format" }).click();
  await expect(page.getByRole("status").filter({ hasText: "no connection was attempted" })).toBeVisible();
  await page.goto("/vehicles/bmw-330li-2024");
  await page.getByRole("button", { name: "Expand image" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Expand image" })).toBeFocused();
  await page.getByRole("link", { name: "Request a test drive" }).click();
  await expect(page.getByLabel("I want to")).toHaveValue("test_drive");
  await expect(page.getByLabel("Vehicle of interest")).toHaveValue("veh-1");
});

test("connected pages remain responsive and usable with reduced motion", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [name, path] of [["inventory", "/inventory"], ["compare", "/compare?ids=veh-2,veh-4"], ["contact", "/contact?ids=veh-2,veh-4"], ["desktop-app", "/download"], ["vehicle", "/vehicles/bmw-330li-2024"]]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Load viewport-triggered vehicle photos before collecting a full-page visual reference.
    const cards = page.locator(".vehicle-card");
    for (let i = 0; i < await cards.count(); i++) await cards.nth(i).scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(name + ".png"), fullPage: true });
    const duration = await page.locator(".button.primary").first().evaluate(button => getComputedStyle(button).transitionDuration);
    expect(duration).toBe("0s");
  }
});
