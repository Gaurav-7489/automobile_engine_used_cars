import { test, expect } from "@playwright/test";

const spoofed = {
  "x-vandlabs-user-id": "demo-staff", "x-vandlabs-tenant-id": "tenant-apex",
  "x-vandlabs-dealership-ids": "dealer-apex", "x-vandlabs-location-ids": "loc-kochi,loc-bengaluru",
  "x-vandlabs-capabilities": "lead:read,lead:write,task:write,analytics:read,platform:admin",
};
for (const path of ["/command", "/command/", "/command?__rsc=probe", "/command/leads", "/command/leads/lead-1", "/command/tasks", "/command/analytics", "/command/api/snapshot", "/command/api/readiness", "/command/api/vehicles/template?format=xlsx"]) {
  test(`staff page ${path} denies anonymous and forged headers`, async ({ request }) => {
    for (const headers of [{}, spoofed]) {
      const response = await request.get(`http://127.0.0.1:3001${path}`, { headers });
      expect(response.status()).toBe(401);
      expect(await response.text()).not.toContain("Today, at a glance.");
      expect(response.headers()["cache-control"]).toContain("no-store");
    }
  });
}
for (const path of ["/platform", "/platform/", "/platform?__rsc=probe", "/platform/integrations", "/platform/onboarding", "/platform/staff", "/platform/api/snapshot", "/platform/api/readiness"]) {
  test(`platform page ${path} denies forged administrator headers`, async ({ request }) => {
    const response = await request.get(`http://127.0.0.1:3002${path}`, { headers: spoofed });
    expect(response.status()).toBe(401);
  });
}
test("all staff mutations reject forged identity before touching records", async ({ request }) => {
  const responses = [
    await request.post("http://127.0.0.1:3002/platform/api/staff",{headers:spoofed,data:{}}),
    await request.put("http://127.0.0.1:3001/command/api/vehicles/veh-1/costs", {headers:spoofed,data:{}}),
    await request.put("http://127.0.0.1:3001/command/api/vehicles/veh-1", {headers:spoofed,data:{}}),
    await request.post("http://127.0.0.1:3001/command/api/vehicles", {headers:spoofed,data:{}}),
    await request.post("http://127.0.0.1:3001/command/api/vehicles/import", {headers:spoofed,data:{mode:"commit"}}),
    await request.patch("http://127.0.0.1:3001/command/api/leads/lead-1", { headers: spoofed, data: { stage: "won" } }),
    await request.post("http://127.0.0.1:3001/command/api/leads/lead-1/tasks", { headers: spoofed, data: {} }),
    await request.patch("http://127.0.0.1:3001/command/api/vehicles/veh-1", {headers:spoofed,data:{price:1}}),
    await request.patch("http://127.0.0.1:3001/command/api/tasks/task-1", { headers: spoofed, data: { completed: true } }),
    await request.post("http://127.0.0.1:3001/command/api/leads/lead-1/appointments", {headers:spoofed,data:{}}),
    await request.post("http://127.0.0.1:3001/command/api/leads/lead-1/sales", {headers:spoofed,data:{}}),
    await request.patch("http://127.0.0.1:3001/command/api/appointments/appt-1", {headers:spoofed,data:{status:"completed"}}),
  ];
  for (const response of responses) expect(response.status()).toBe(401);
});

for (const [port, basePath] of [[3001, "/command"], [3002, "/platform"]] as const) {
  test(`${basePath} login remains reachable without exposing staff data`, async ({ request }) => {
    const response = await request.get(`http://127.0.0.1:${port}${basePath}/login`);
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain("Staff sign-in is not connected yet");
  });
  test(`${basePath} browser redirect preserves the deployment base path`, async ({ request }) => {
    const response = await request.get(`http://127.0.0.1:${port}${basePath}`, {
      headers: { accept: "text/html" }, maxRedirects: 0,
    });
    expect(response.status()).toBe(307);
    const location = new URL(response.headers()["location"]);
    expect(location.pathname).toBe(`${basePath}/login`);
    expect(location.searchParams.get("returnTo")).toBe(basePath);
  });
}
