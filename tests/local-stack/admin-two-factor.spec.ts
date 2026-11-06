import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { totpCodeForTests } from "../../apps/intelligence/lib/server/totp";

/**
 * An administrator without two-factor login gets the console with real dealership data locked, turns two-factor on from the
 * console itself, and the live dealerships unlock in place.
 * Needs the local test database (scripts/local/pg-up.sh) and the seeded administrator; the account is restored afterwards.
 */
const ADMIN = { email: "admin@vandlabs.example", password: "steady orchard lantern 9", secret: process.env.LOCAL_ADMIN_TOTP ?? "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP" };
const sql = (statement: string) => execFileSync("su", ["postgres", "-c", `psql -h /tmp -p ${process.env.LOCAL_PG_PORT ?? 5544} -d vl -Atc "${statement}"`], { encoding: "utf8" });

test.afterAll(() => { sql(`UPDATE intelligence_users SET totp_enabled = true, totp_secret = '${ADMIN.secret}' WHERE email = '${ADMIN.email}'`); });

test("admin console: locked until two-factor, then unlocks in place", async ({ page }) => {
  try { sql("SELECT 1"); } catch { test.skip(true, "Local test database not reachable as the postgres user."); }
  sql(`DELETE FROM intelligence_rate_limits; UPDATE intelligence_users SET totp_enabled = false, totp_secret = NULL WHERE email = '${ADMIN.email}'`);
  await page.goto("/login?returnTo=/admin");
  await page.getByLabel(/business email/i).fill(ADMIN.email);
  await page.getByLabel(/^password/i).fill(ADMIN.password);
  await page.getByRole("button", { name: /^sign in/i }).click();
  await page.waitForURL(/\/admin/);
  await expect(page.getByText("Live dealerships are locked")).toBeVisible();
  await expect(page.getByText("DEMO DATA")).toBeVisible();
  await page.locator(".adm-sec").getByRole("button", { name: "Turn on" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Turn on two-factor login" }).click();
  await page.getByLabel("Confirm your password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Continue" }).click();
  const key = (await page.locator("code").first().innerText()).replace(/\s/g, "");
  expect(key.length).toBeGreaterThanOrEqual(16);
  await page.getByLabel("6-digit code from the app").fill(totpCodeForTests(key));
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText("Live dealerships are locked")).toBeHidden({ timeout: 15_000 });
  await expect(page.locator(".adm-sec")).toContainText("Two-factor on");
});
