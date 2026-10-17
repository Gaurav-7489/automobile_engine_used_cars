import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPrivateKey } from "node:crypto";
import { SignJWT } from "jose";
async function authorization(role: string) {
  const key = createPrivateKey(readFileSync(join(process.env.VANDLABS_ROLE_FIXTURE_DIR!, "jwt.pem")));
  const token = await new SignJWT({ token_use: "access" }).setProtectedHeader({ alg: "RS256", kid: "isolated-role-test" }).setSubject(role).setIssuer("https://127.0.0.1:3443").setAudience("isolated-dealer-api").setIssuedAt().setExpirationTime("5m").sign(key);
  return { authorization: `Bearer ${token}` };
}
for (const role of ["acquisition", "marketing"] as const) {
  test(`${role} gets inventory navigation without CRM or commercial privileges`, async ({ page }, info) => {
    const headers = await authorization(role);
    await page.setExtraHTTPHeaders(headers);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/command/inventory");
    await expect(page.getByRole("table", { name: "Dealership inventory" })).toBeVisible();
    const navigation = page.getByRole("navigation", { name: "Command Center", exact: true });
    await expect(navigation.getByRole("link", { name: "Market", exact: true })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "Leads", exact: true })).toHaveCount(0);
    await expect(navigation.getByRole("link", { name: "Business API", exact: true })).toHaveCount(0);
    await expect(navigation.getByRole("link", { name: "Acquisition", exact: true })).toHaveCount(role === "acquisition" ? 1 : 0);
    await page.screenshot({ path: info.outputPath(`${role}-navigation.png`), fullPage: true });
  });
  test(`${role} signed HTTP access excludes CRM records and rejects escalation`, async ({ request }) => {
    const headers = await authorization(role);
    for (const path of ["leads", "customers", "tasks", "capital", "developer", "%6ceads"]) {
      const denied = await request.get(`/command/${path}`, { headers: { ...headers, "x-vandlabs-capabilities": "platform:admin,lead:read,capital:write,commerce:manage" } });
      expect(denied.status(), path).toBe(403);
      expect(denied.headers()["cache-control"]).toContain("no-store");
    }
    const snapshot = await request.get("/command/api/snapshot", { headers });
    expect(snapshot.status()).toBe(200);
    const body = await snapshot.json();
    expect(body.data.vehicles.length).toBeGreaterThan(0);
    for (const key of ["leads", "tasks", "activities", "appointments", "runs", "rules", "sales"]) expect(body.data[key]).toHaveLength(0);
    if (role === "marketing") expect(body.data.costs).toBeUndefined();
    expect((await request.patch("/command/api/leads/lead-1", { headers, data: { notes: "denied", expectedVersion: 0 } })).status()).toBe(403);
  });
}
test("unprovisioned signed identity remains forbidden", async ({ request }) => {
  const denied = await request.get("/command/api/snapshot", { headers: await authorization("unprovisioned") });
  expect(denied.status()).toBe(403);
});
