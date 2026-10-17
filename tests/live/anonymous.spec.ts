import { test, expect } from "@playwright/test";

// Identity headers an attacker might try to inject through the public gateway.
const spoofed = {
  "x-vandlabs-user-id": "live-probe", "x-vandlabs-tenant-id": "00000000-0000-4000-a000-000000000000",
  "x-vandlabs-capabilities": "lead:read,lead:write,analytics:read,capital:read,platform:admin,commerce:manage",
  authorization: "Bearer not-a-real-token",
};

test("the public gateway is live, persistent and writable", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.status).toBe("ok");
  expect(body.persistence).toBe("postgresql");
  expect(body.operationalWrites).toBe(true);
});

test("public pages render and staff surfaces are excluded from crawling", async ({ request }) => {
  const home = await request.get("/");
  expect(home.status()).toBe(200);
  const robots = await (await request.get("/robots.txt")).text();
  for (const path of ["/command", "/platform", "/api/"]) expect(robots).toContain(`Disallow: ${path}`);
});

for (const path of ["/command/api/snapshot", "/command/api/readiness", "/command/api/dealer/summary", "/platform/api/snapshot", "/platform/api/readiness", "/platform/api/staff"]) {
  test(`staff API ${path} rejects anonymous and forged identity`, async ({ request }) => {
    for (const headers of [{}, spoofed]) {
      const response = await request.get(path, { headers });
      expect(response.status(), JSON.stringify(Object.keys(headers))).toBe(401);
      expect(response.headers()["cache-control"]).toContain("no-store");
    }
  });
}

for (const app of ["command", "platform"]) {
  test(`${app} pages send browsers to sign-in, never render staff data`, async ({ request }) => {
    const response = await request.get(`/${app}`, { headers: { ...spoofed, accept: "text/html" }, maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(new URL(response.headers().location, "https://gateway.invalid").pathname).toMatch(new RegExp(`^/${app}/(login|auth/refresh)$`));
    const login = await request.get(`/${app}/login`);
    expect(login.status()).toBe(200);
  });
}

test("staff mutations reject forged identity", async ({ request }) => {
  for (const response of [
    await request.post("/command/api/dealer/recommendations", { headers: spoofed, data: {} }),
    await request.post("/platform/api/staff", { headers: spoofed, data: {} }),
    await request.patch("/command/api/leads/live-probe", { headers: spoofed, data: { stage: "won" } }),
  ]) expect(response.status()).toBe(401);
});

test("Dealer AI public edge answers a service client with 401, not a 403/1010 block", async ({ request }) => {
  const url = process.env.LIVE_DEALER_AI_URL;
  test.skip(!url, "LIVE_DEALER_AI_URL not set; Command Center uses the service binding.");
  const response = await request.post(url!, { headers: { "user-agent": "VandLabs-CommandCenter/1.0 (+dealer-ai)", "content-type": "application/json" }, data: { options: [] } });
  const body = await response.text();
  expect(body).not.toContain("1010");
  expect(response.status()).toBe(401);
});
