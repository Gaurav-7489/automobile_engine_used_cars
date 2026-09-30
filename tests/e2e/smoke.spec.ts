import { test, expect } from "@playwright/test";

test("public homepage loads", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Cars worth arriving in." }),
  ).toBeVisible();
});

test("inventory discovery loads and filters", async ({ page }) => {
  await page.goto("/inventory");
  await expect(
    page.getByRole("heading", { name: "Available now." }),
  ).toBeVisible();

  const search = page.getByPlaceholder("BMW, SUV, automatic...");
  await expect(search).toBeVisible();
  await search.fill("IONIQ");
  await expect(
    page.getByRole("heading", { name: "Hyundai IONIQ 5" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "BMW 330Li" })).toHaveCount(0);
});

test("inventory can build a compare selection", async ({ page }) => {
  await page.goto("/inventory");
  const compareButtons = page.getByRole("button", { name: "Add to compare" });
  await compareButtons.nth(0).click();
  await compareButtons.nth(1).click();

  const compareLink = page.getByRole("link", { name: /Compare 2 selected/i });
  await expect(compareLink).toBeVisible();
  await compareLink.click();

  await expect(
    page.getByRole("heading", { name: "Make the differences obvious." }),
  ).toBeVisible();
});

test("vehicle detail resolves", async ({ page }) => {
  await page.goto("/vehicles/bmw-330li-2024");
  await expect(page.getByRole("heading", { name: "BMW 330Li" })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Move from interest to a real conversation.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "WhatsApp about this car" }),
  ).toBeVisible();
});

test("compare workspace accepts selected ids", async ({ page }) => {
  await page.goto("/compare?ids=veh-1,veh-2");
  await expect(
    page.getByRole("heading", { name: "Make the differences obvious." }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: /BMW 330Li/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: /Mercedes-Benz GLC/i }),
  ).toBeVisible();
});

test("contact conversion form loads", async ({ page }) => {
  await page.goto("/contact");
  await expect(
    page.getByRole("heading", { name: "Start with what you need." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send request" }),
  ).toBeVisible();
});

test("health and vehicle BFF contracts respond", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  const healthBody = await health.json();
  expect(healthBody.status).toBe("ok");
  expect(healthBody.persistence).toBe("demo-adapter");

  const inventory = await request.get("/api/vehicles?q=bmw");
  expect(inventory.ok()).toBeTruthy();
  const body = await inventory.json();
  expect(body.meta.count).toBeGreaterThan(0);
});

test("unknown vehicle API returns 404", async ({ request }) => {
  const response = await request.get("/api/vehicles/not-a-real-car");
  expect(response.status()).toBe(404);
});

test("journey event contract rejects invalid events", async ({ request }) => {
  const response = await request.post("/api/events", {
    data: {
      type: "not_allowed",
      sessionId: "playwright-invalid-event",
      path: "/",
    },
  });
  expect(response.status()).toBe(400);
});

test("public lead becomes visible in Command Center", async ({ request, page }) => {
  const marker = "Playwright " + Date.now();
  const response = await request.post("/api/leads", {
    data: {
      name: marker,
      phone: "+91 90000 00001",
      email: "qa@example.com",
      intent: "test_drive",
      vehicleId: "veh-1",
      whatsappConsent: true,
      marketingConsent: false,
      attribution: {
        firstTouch: {
          source: "google",
          medium: "cpc",
          campaign: "proof-engine-qa",
          landingPath: "/inventory",
          capturedAt: new Date().toISOString(),
        },
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
  expect(body.vehicleId).toBe("veh-1");

  await page.goto(
    "http://127.0.0.1:3001/command/leads/" + body.leadId,
  );
  await expect(page.getByRole("heading", { name: marker })).toBeVisible();
  await expect(page.getByText("BMW 330Li")).toBeVisible();
  await expect(page.getByText("playwright")).toBeVisible();
});

test("invalid vehicle page is a real 404", async ({ page }) => {
  const response = await page.goto("/vehicles/not-a-real-car");
  expect(response?.status()).toBe(404);
});

test("public routes avoid horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const path of ["/", "/inventory", "/contact"]) {
    await page.goto(path);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      ),
    ).toBeFalsy();
  }
});

test("command center CRM and intelligence load", async ({ page }) => {
  await page.goto("http://127.0.0.1:3001/command");
  await expect(
    page.getByRole("heading", { name: "Today, at a glance." }),
  ).toBeVisible();

  await page.goto("http://127.0.0.1:3001/command/leads");
  await expect(page.getByRole("heading", { name: "Lead inbox" })).toBeVisible();

  await page.goto("http://127.0.0.1:3001/command/analytics");
  await expect(
    page.getByRole("heading", { name: "Evidence, not invented certainty" }),
  ).toBeVisible();
});

test("command center avoids mobile overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3001/command/leads");
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBeFalsy();
});

test("platform control center routes load", async ({ page }) => {
  await page.goto("http://127.0.0.1:3002/platform");
  await expect(
    page.getByRole("heading", { name: "The network, clearly." }),
  ).toBeVisible();

  await page.goto("http://127.0.0.1:3002/platform/onboarding");
  await expect(page.getByRole("heading", { name: "Onboarding" })).toBeVisible();

  await page.goto("http://127.0.0.1:3002/platform/health");
  await expect(
    page.getByRole("heading", { name: "Platform health" }),
  ).toBeVisible();
});

test("platform control avoids mobile overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3002/platform");
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBeFalsy();
});

test("SEO endpoints are reachable", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBeTruthy();

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBeTruthy();
  const xml = await sitemap.text();
  expect(xml).toContain("/vehicles/bmw-330li-2024");
});
