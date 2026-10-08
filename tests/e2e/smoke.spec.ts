import { test, expect } from "@playwright/test";

test("public homepage loads", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Cars worth arriving in." }),
  ).toBeVisible();
});

test("inventory discovery loads", async ({ page }) => {
  await page.goto("/inventory");
  await expect(
    page.getByRole("heading", { name: "Available now." }),
  ).toBeVisible();
  await expect(page.getByPlaceholder("BMW, SUV, automatic...")).toBeVisible();
});

test("vehicle detail resolves", async ({ page }) => {
  await page.goto("/vehicles/bmw-330li-2024");
  await expect(page.getByRole("heading", { name: "BMW 330Li" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Move from interest to a real conversation." }),
  ).toBeVisible();
});

test("compare workspace loads", async ({ page }) => {
  await page.goto("/compare?ids=veh-1,veh-2");
  await expect(
    page.getByRole("heading", { name: "Make the differences obvious." }),
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /BMW 330Li/i })).toBeVisible();
});

test("contact conversion form loads", async ({ page }) => {
  await page.goto("/contact");
  await expect(
    page.getByRole("heading", { name: "Start with what you need." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Send request" })).toBeVisible();
});

test("health and vehicle BFF contracts respond", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  const inventory = await request.get("/api/vehicles?q=bmw");
  expect(inventory.ok()).toBeTruthy();
  const body = await inventory.json();
  expect(body.meta.count).toBeGreaterThan(0);
});

test("lead BFF accepts structured demo lead", async ({ request }) => {
  const response = await request.post("/api/leads", {
    data: {
      name: "Playwright Demo",
      phone: "+91 90000 00001",
      intent: "test_drive",
      vehicleId: "veh-1",
      whatsappConsent: true,
      marketingConsent: false,
      attribution: {
        lastTouch: {
          source: "playwright",
          campaign: "mvp-qa",
          landingPath: "/vehicles/bmw-330li-2024",
          capturedAt: new Date().toISOString(),
        },
      },
    },
  });
  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body.stage).toBe("new");
});

test("V2 lead creation evaluates deterministic follow-up automation", async ({ request }) => {
  const response = await request.post("/api/leads", {
    data: {
      name: "Automation Demo",
      phone: "+91 90000 00003",
      intent: "enquiry",
      vehicleId: "veh-2",
      whatsappConsent: false,
      marketingConsent: false,
    },
  });
  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body.automation.evaluated).toBeGreaterThan(0);
  expect(body.automation.tasksCreated).toBeGreaterThan(0);
});

test("invalid vehicle is 404", async ({ page }) => {
  const response = await page.goto("/vehicles/not-a-real-car");
  expect(response?.status()).toBe(404);
});

test("mobile homepage has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBeFalsy();
});

test("command center CRM loads", async ({ page }) => {
  await page.goto("http://127.0.0.1:3001/command");
  await expect(
    page.getByRole("heading", { name: "Today, at a glance." }),
  ).toBeVisible();
  await page.goto("http://127.0.0.1:3001/command/leads");
  await expect(page.getByRole("heading", { name: "Lead inbox" })).toBeVisible();
});

test("mobile command center keeps wide data inside its scroller", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3001/command/leads");
  await expect(page.getByRole("heading", { name: "Lead inbox" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBeFalsy();
});

test("command center persists lead operations and follow-up", async ({ page, request }) => {
  const created = await request.post("/api/leads", {
    data: {
      name: "Operational Demo",
      phone: "+91 90000 00002",
      intent: "finance",
      vehicleId: "veh-3",
      whatsappConsent: true,
      marketingConsent: false,
    },
  });
  expect(created.status()).toBe(201);
  const { leadId } = await created.json();

  await page.goto(`http://127.0.0.1:3001/command/leads/${leadId}`);
  await page.getByLabel("Pipeline stage").selectOption("qualified");
  await page.getByLabel("Lead owner").selectOption("Maya");
  await page.getByLabel("Internal note").fill("Budget confirmed; finance documents requested.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status", { name: "Lead update status" })).toHaveText("Saved");
  await expect(page.locator(".stage.large")).toHaveText("Qualified");

  await page.getByRole("textbox", { name: "Follow-up", exact: true }).fill("Review finance documents");
  await page.getByLabel("Due").fill("2030-01-15T10:30");
  await page.getByLabel("Priority").selectOption("high");
  await page.getByRole("button", { name: "Schedule follow-up" }).click();
  await expect(page.getByRole("status", { name: "Follow-up status" })).toHaveText("Scheduled");
  await expect(page.getByText("Review finance documents", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Complete Review finance documents" }).click();
  await expect(page.getByRole("button", { name: "Reopen Review finance documents" })).toBeVisible();
});

test("V2 stage changes evaluate follow-up automation", async ({ request }) => {
  const created = await request.post("/api/leads", {
    data: {
      name: "Stage Automation Demo",
      phone: "+91 90000 00004",
      intent: "finance",
      vehicleId: "veh-3",
      whatsappConsent: true,
      marketingConsent: false,
    },
  });
  expect(created.status()).toBe(201);
  const { leadId } = await created.json();

  const updated = await request.patch(`http://127.0.0.1:3001/command/api/leads/${leadId}`, {
    data: { stage: "qualified",expectedVersion:0 },
  });
  expect(updated.status()).toBe(200);
  const body = await updated.json();
  expect(body.automation.evaluated).toBeGreaterThan(0);
  expect(body.automation.tasksCreated).toBeGreaterThan(0);
});

test("V2 persists first-party journey events", async ({ request }) => {
  const response = await request.post("/api/events", {
    data: {
      type: "vehicle_view",
      sessionId: "v2-attribution-test",
      path: "/vehicles/bmw-330li-2024",
      vehicleId: "veh-1",
      source: "playwright",
      campaign: "v2-attribution",
    },
  });
  expect(response.status()).toBe(202);
  const body = await response.json();
  expect(body.accepted).toBeTruthy();
  expect(body.event.id).toBeTruthy();
});

test("command center analytics exposes V1.5 operational reporting", async ({ page }) => {
  await page.goto("http://127.0.0.1:3001/command/analytics");
  await expect(page.getByRole("heading", { name: "Evidence, not invented certainty" })).toBeVisible();
  await expect(page.getByText("Open follow-ups", { exact: true })).toBeVisible();
  await expect(page.getByText("Next-action coverage", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stage progression" })).toBeVisible();
  await expect(page.getByText("Automation tasks", { exact: true })).toBeVisible();
  await expect(page.getByText("Attributed events", { exact: true })).toBeVisible();
});

test("V2 automation workspace loads", async ({ page }) => {
  await page.goto("http://127.0.0.1:3001/command/automation");
  await expect(page.getByRole("heading", { name: "Rules, consent & attribution" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Current rule set" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reusable acquisition setup" })).toBeVisible();
});

test("platform control center loads", async ({ page }) => {
  await page.goto("http://127.0.0.1:3002/platform");
  await expect(
    page.getByRole("heading", { name: "The network, clearly." }),
  ).toBeVisible();
  await page.goto("http://127.0.0.1:3002/platform/onboarding");
  await expect(page.getByRole("heading", { name: "Onboarding" })).toBeVisible();
});


test("V2.5 analytics exposes campaign outcome reporting", async ({ page }) => {
  await page.goto("http://127.0.0.1:3001/command/analytics");
  await expect(page.getByRole("heading", { name: "Recorded lead progression" })).toBeVisible();
  await expect(page.getByText("Outcome counts are descriptive records, not modeled attribution or incremental lift.")).toBeVisible();
});

test("V2.5 platform exposes adapter authority and reconciliation evidence", async ({ page }) => {
  await page.goto("http://127.0.0.1:3002/platform/integrations");
  await expect(page.getByRole("heading", { name: "Field authority" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent runs" })).toBeVisible();
  await expect(page.getByText("Reference evidence does not claim a live external DMS or CRM connection.")).toBeVisible();
});
