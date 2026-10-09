import { test, expect } from "@playwright/test";

test("desktop distribution has honest availability, safe routes and responsive product surfaces", async ({ page, request }, testInfo) => {
  await page.goto("/download");
  await expect(page.getByRole("heading", { name: "A workspace that moves with you." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Enter your workspace URL." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("desktop-downloads.png"), fullPage: true });
  const unavailable = await request.get("/api/downloads/linux");
  expect(unavailable.status()).toBe(404);
  expect(unavailable.headers()["x-content-type-options"]).toBe("nosniff");
  const desktopConfig = await request.get("http://127.0.0.1:3001/command/api/desktop-config");
  expect(desktopConfig.status()).toBe(503);
  expect((await desktopConfig.json()).clientId).toBeUndefined();

  for (const [name, url] of [["showroom", "/"], ["dealer-workspace", "http://127.0.0.1:3001/command"], ["platform", "http://127.0.0.1:3002/platform"]]) {
    await page.goto(url);
    await expect(page.locator("h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(name + ".png"), fullPage: true });
  }
  await expect(page.getByRole("navigation", {name:"Platform navigation"}).getByRole("link",{name:"Overview"})).toHaveAttribute("aria-current","page");
});

test("public writes reject foreign origins and oversized event bodies before persistence", async ({ request }) => {
  const foreign = await request.post("/api/leads", {headers:{origin:"https://foreign.example"},data:{name:"Foreign origin",phone:"123"}});
  expect(foreign.status()).toBe(403);
  const oversized = await request.post("/api/events", {data:{type:"page_view",sessionId:"bounded-test",path:"x".repeat(9000)}});
  expect(oversized.status()).toBe(400);
  const malformed = await request.post("/api/events", {data:"{broken",headers:{"Content-Type":"application/json"}});
  expect(malformed.status()).toBe(400);
});
