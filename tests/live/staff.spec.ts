import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { existsSync } from "node:fs";

// Sessions come from a real hosted-UI sign-in with TOTP, saved by the operator, e.g.
//   npx playwright codegen --save-storage=/secure/command.json "$LIVE_BASE_URL/command/login"
// Files hold live session cookies: keep them outside the repository and delete them after the run.
const sessions = { command: process.env.LIVE_COMMAND_STATE, platform: process.env.LIVE_PLATFORM_STATE };
const tenant = process.env.LIVE_TENANT_ID;
// Access cookies last 15 minutes and staff APIs never refresh them; loading a page does.
async function signedIn(page: Page, app: string) {
  const response = await page.goto(`/${app}`);
  expect(response?.status()).toBe(200);
  await expect(page).not.toHaveURL(/\/login(\?|$)/);
  return page.request;
}

for (const [app, state] of Object.entries(sessions)) {
  test.describe(`${app} staff session`, () => {
    test.skip(!state || !existsSync(state), `Set LIVE_${app.toUpperCase()}_STATE to a saved MFA session file.`);
    test.use({ storageState: state });

    test("readiness proves configuration and tenant-isolated database reads", async ({ page }) => {
      const request = await signedIn(page, app);
      const response = await request.get(`/${app}/api/readiness`);
      const body = await response.json();
      expect(response.status(), JSON.stringify({ ready: body.ready, database: body.database })).toBe(200);
      expect(body.ready).toBe(true);
      expect(body.database.ready).toBe(true);
      expect(response.headers()["cache-control"]).toContain("no-store");
    });

    test("snapshot stays inside the signed-in tenant, even with forged tenant headers", async ({ page }) => {
      const request = await signedIn(page, app);
      const tenantsIn = async (ctx: APIRequestContext, headers: Record<string, string> = {}) => {
        const response = await ctx.get(`/${app}/api/snapshot`, { headers });
        expect(response.status()).toBe(200);
        const ids = new Set<string>();
        JSON.stringify(await response.json(), (key, value) => { if (key === "tenantId" && typeof value === "string") ids.add(value); return value; });
        return ids;
      };
      const own = await tenantsIn(request);
      if (app === "command") { expect(own.size).toBeLessThanOrEqual(1); if (tenant && own.size) expect([...own]).toEqual([tenant]); }
      const forged = await tenantsIn(request, { "x-vandlabs-tenant-id": "00000000-0000-4000-a000-000000000000" });
      expect([...forged].sort()).toEqual([...own].sort());
    });

    test("staff pages render for the signed-in member", async ({ page }) => { await signedIn(page, app); });
  });
}
