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

test("platform control center loads", async ({ page }) => {
  await page.goto("http://127.0.0.1:3002/platform");
  await expect(
    page.getByRole("heading", { name: "The network, clearly." }),
  ).toBeVisible();
  await page.goto("http://127.0.0.1:3002/platform/onboarding");
  await expect(page.getByRole("heading", { name: "Onboarding" })).toBeVisible();
});
