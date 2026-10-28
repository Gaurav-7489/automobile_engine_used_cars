import { test, expect } from "@playwright/test";

test("showroom, shared sign-in and install screen stay at one address", async ({ page, request, baseURL }) => {
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  page.on("response", response => {
    if (response.url().startsWith(baseURL!) && response.url().includes("/_next/") && response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  await page.goto("/");
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
  expect(await page.locator('script[src*="/showroom-assets/_next/"]').count()).toBeGreaterThan(0);
  await page.getByRole("banner").getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(`${baseURL}/login`);
  await expect(page.getByLabel(/business email/i)).toBeVisible();
  await page.goto("/install");
  await expect(page.getByRole("heading", { name: "Your whole workspace. One app." })).toBeVisible();
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.start_url).toBe("/login?source=installed");
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
  await page.getByRole("link", { name: "Browse showroom" }).click();
  await expect(page).toHaveURL(`${baseURL}/`);
  expect(failures).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("private routes and APIs keep their authentication boundary", async ({ request }) => {
  for (const path of ["/app/inventory", "/admin"]) {
    const result = await request.get(path, { maxRedirects: 0 });
    expect(result.status()).toBe(307);
    expect(new URL(result.headers().location).pathname).toBe("/login");
  }
  for (const path of ["/api/workspace", "/api/admin/workspaces", "/api/v1/leads"]) {
    const result = await request.get(path);
    expect(result.status()).toBe(401);
    expect(result.headers()["cache-control"]).toContain("no-store");
  }
  const publicStock = await request.get("/api/vehicles");
  expect(publicStock.status()).toBe(200);
  const enquiry = await request.post("/api/leads", { data: {} });
  expect(enquiry.status()).toBe(503); // Existing showroom remains explicitly read-only.
});
