import { test, expect } from "@playwright/test";

test("the root address leads to sign-in, and the install screen and manifest are served", async ({ page, request, baseURL }) => {
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  page.on("response", response => { if (response.url().startsWith(baseURL!) && response.url().includes("/_next/") && response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await page.goto("/");
  await expect(page).toHaveURL(`${baseURL}/login`);
  await expect(page.getByLabel(/business email/i)).toBeVisible();
  await page.goto("/install");
  await expect(page.getByRole("heading", { name: "Your whole workspace. One app." })).toBeVisible();
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.start_url).toBe("/login?source=installed");
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
  expect(failures).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("private routes and APIs keep their authentication boundary and nothing is public", async ({ request }) => {
  for (const path of ["/app/inventory", "/admin", "/desktop/authorize"]) {
    const result = await request.get(path, { maxRedirects: 0 });
    expect(result.status()).toBe(307);
    expect(new URL(result.headers().location).pathname).toBe("/login");
  }
  for (const path of ["/api/workspace", "/api/inventory", "/api/leads", "/api/overview", "/api/stock-intelligence", "/api/automations", "/api/acquisition", "/api/admin/workspaces", "/api/admin/audit", "/api/v1/leads"]) {
    const result = await request.get(path);
    expect(result.status(), path).toBe(401);
    expect(result.headers()["cache-control"]).toContain("no-store");
  }
  // No public showroom, listing, enquiry or discovery surface exists.
  for (const path of ["/inventory", "/vehicles/any", "/api/vehicles", "/api/discover/cards", "/contact", "/saved", "/compare"]) {
    expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(404);
  }
  expect((await request.post("/api/leads", { data: {} })).status()).toBe(405);
  // The desktop sign-in configuration holds no secret; the token endpoint rejects anything without a valid one-time code.
  expect((await request.post("/api/desktop/token", { data: { grant_type: "authorization_code", code: "x", code_verifier: "y" } })).status()).toBe(400);
});
