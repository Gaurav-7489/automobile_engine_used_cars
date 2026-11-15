import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const axe = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

test("the sign-in page offers only Continue with Google", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByLabel("Password")).toHaveCount(0);
  await expect(page.getByText(/forgot password/i)).toHaveCount(0);
  await expect(page.getByLabel(/authenticator code/i)).toHaveCount(0);
  // The legacy break-glass form does not appear while LEGACY_PASSWORD_LOGIN is off.
  await page.goto("/login?legacy=1");
  await expect(page.getByLabel("Password")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.addScriptTag({ content: axe });
  const serious = await page.evaluate(async () => ((await (window as unknown as { axe: { run: () => Promise<{ violations: { id: string; impact: string }[] }> } }).axe.run()).violations).filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id));
  expect(serious).toEqual([]);
});

test("Continue with Google sends an OpenID Connect request with state, nonce and PKCE S256", async ({ page, baseURL }) => {
  await page.goto("/login");
  const href = await page.getByRole("link", { name: "Continue with Google" }).getAttribute("href");
  expect(href).toBe("/api/auth/sso/google");
  // Read the redirect (a browser would follow it to Google; this test never contacts Google).
  const r = await page.context().request.get(href!, { maxRedirects: 0 });
  expect(r.status()).toBe(307);
  const u = new URL(r.headers().location);
  expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
  expect(u.searchParams.get("response_type")).toBe("code");
  expect(u.searchParams.get("redirect_uri")).toBe(`${baseURL}/api/auth/sso/google/callback`);
  expect(u.searchParams.get("scope")).toBe("openid email profile");
  expect(u.searchParams.get("code_challenge_method")).toBe("S256");
  expect(u.searchParams.get("code_challenge")?.length).toBe(43);
  expect(u.searchParams.get("nonce")?.length).toBeGreaterThan(20);
  expect(u.searchParams.get("state")).toBeTruthy();
  const oauth = (await page.context().cookies()).find((c) => /vl_oauth$/.test(c.name));
  expect(oauth?.httpOnly).toBe(true);
  expect(oauth?.value).toContain("~");
  expect(u.toString()).not.toContain(oauth!.value.split("~")[1]);
  expect(r.headers()["cache-control"]).toContain("no-store");
});

test("a forged or replayed callback signs nobody in", async ({ page, context }) => {
  await page.goto("/api/auth/sso/google/callback?code=abc&state=forged.state");
  await expect(page).toHaveURL(/\/login\?notice=google_failed/);
  await expect(page.getByText("Google sign-in did not finish")).toBeVisible();
  expect((await context.cookies()).some((c) => /vl_session$/.test(c.name))).toBe(false);
});

test("legacy password endpoints are switched off; admin and step-up stay closed without a Google session", async ({ request }) => {
  const origin = { origin: "http://127.0.0.1:3003" };
  for (const [path, body] of [["/api/auth/login", { email: "owner@gmail.com", password: "x".repeat(12) }], ["/api/auth/redeem", { token: "t", password: "x".repeat(12) }], ["/api/auth/reauth", { password: "x" }], ["/api/public/website/connect", { email: "o@gmail.com", password: "x", key: "k", siteUrl: "https://a.example" }]] as const) {
    const r = await request.post(path, { data: body, headers: origin });
    expect(r.status(), path).toBe(410);
  }
  const twoFactor = await request.post("/api/auth/two-factor", { data: { action: "begin" }, headers: origin });
  expect(twoFactor.status()).toBe(410);
  for (const path of ["/api/admin/workspaces", "/api/admin/workspaces/00000000-0000-4000-8000-000000000001/websites"]) expect((await request.get(path)).status(), path).toBe(401);
  const admin = await request.get("/admin", { maxRedirects: 0 });
  expect(admin.status()).toBe(307);
  expect(admin.headers().location).toContain("/login?returnTo=%2Fadmin");
  const stepUp = await request.get("/api/auth/sso/google?intent=reauth", { maxRedirects: 0 });
  expect(stepUp.headers().location).toContain("/auth/confirmed?result=signed_out");
});
