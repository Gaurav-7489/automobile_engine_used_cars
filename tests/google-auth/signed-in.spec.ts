import { test, expect, type BrowserContext } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";

/**
 * Signed-in checks against the running build. COOKIES_FILE holds sessions minted with the server's SESSION_SECRET for accounts
 * that were activated through intelligence_google_signin (the database step of the Google callback). The Google round trip
 * itself is not exercised here.
 */
const file = process.env.COOKIES_FILE ?? "";
const sessions = file && existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, string>) : null;
const as = async (context: BrowserContext, baseURL: string, token: string) => context.addCookies([{ name: "__Host-vl_session", value: token, url: baseURL.replace(/^http:/, "https:"), secure: true, httpOnly: true, sameSite: "Lax" }]);

test.skip(!sessions, "set COOKIES_FILE");

test("the Super Admin (Google session) opens /admin with dealership data, and changes ask Google to confirm", async ({ page, context, baseURL }) => {
  await as(context, baseURL!, sessions!.admin);
  await page.goto("/admin");
  await expect(page.getByText("Signed in with Google")).toBeVisible();
  await page.getByRole("button", { name: "Hide demo data" }).click().catch(() => undefined);
  await expect(page.getByText("Delta Motors").first()).toBeVisible();
  await expect(page.getByText(/delta\.owner@gmail\.com \(not signed in yet\)|Owner:/).first()).toBeVisible();
  const r = await page.evaluate(async () => (await fetch("/api/admin/workspaces", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organization: "No Confirm Ltd", dealership: "No Confirm", ownerName: "N", ownerEmail: "n@gmail.com", locations: [{ name: "Main", city: "Kochi", state: "Kerala", phone: "" }] }) })).json());
  expect(r.error.code).toBe("reauth_required");
  await page.getByRole("button", { name: /Add dealership/ }).first().click();
  await expect(page.getByText("Google will ask you to confirm it's you")).toBeVisible();
  await expect(page.getByLabel("Owner's Google email")).toBeVisible();
  await expect(page.getByLabel("Confirm your password")).toHaveCount(0);
});

test("a legacy password session of the same administrator sees no dealership data", async ({ page, context, baseURL }) => {
  await as(context, baseURL!, sessions!.adminPassword);
  await page.goto("/admin");
  await expect(page.getByText("Google sign-in needed")).toBeVisible();
  const r = await page.evaluate(async () => (await fetch("/api/admin/workspaces")).status);
  expect(r).toBe(403);
});

test("the dealership owner opens only their own workspace and cannot reach the admin console", async ({ page, context, baseURL }) => {
  await as(context, baseURL!, sessions!.owner);
  await page.goto("/app/overview");
  await expect(page).toHaveURL(/\/app\/overview/);
  const ws = await page.evaluate(async () => (await fetch("/api/workspace")).json());
  expect(JSON.stringify(ws)).toContain("Delta Motors");
  expect(JSON.stringify(ws)).not.toContain("VandLabs HQ");
  expect((await page.goto("/admin"))?.status()).toBe(404);
  await page.goto("/app/overview");
  expect((await page.evaluate(async () => (await fetch("/api/admin/workspaces")).status))).toBe(404);
  await page.goto("/app/settings/security");
  await expect(page.getByText(/Google account\. Keep 2-Step Verification on/)).toBeVisible();
  await expect(page.getByRole("button", { name: /two-factor/i })).toHaveCount(0);
});

test("signing out ends the session", async ({ page, context, baseURL }) => {
  await as(context, baseURL!, sessions!.owner);
  await page.goto("/app/overview");
  await page.evaluate(async () => { await fetch("/api/auth/logout", { method: "POST" }); });
  await page.goto("/app/overview");
  await expect(page).toHaveURL(/\/login/);
});
