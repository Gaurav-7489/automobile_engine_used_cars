import { test } from "node:test";
import assert from "node:assert/strict";
import { adAuthUrl, isAdProvider, isConnectProvider, providerConfigured } from "../../apps/intelligence/lib/server/ad-accounts";

test("Advertising connects Google (with YouTube), Facebook and Instagram, and WhatsApp on each provider's own consent screen", () => {
  process.env.GOOGLE_CLIENT_ID = "client.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "s";
  process.env.META_APP_ID = "123";
  process.env.META_APP_SECRET = "s";
  const google = new URL(adAuthUrl("google", "https://app.example/cb", "st"));
  assert.equal(google.host, "accounts.google.com");
  assert.match(google.searchParams.get("scope")!, /auth\/adwords/);
  assert.match(google.searchParams.get("scope")!, /auth\/youtube\.readonly/);
  assert.equal(google.searchParams.get("access_type"), "offline");
  const meta = new URL(adAuthUrl("meta", "https://app.example/cb", "st"));
  assert.match(meta.searchParams.get("scope")!, /ads_management/);
  assert.match(meta.searchParams.get("scope")!, /instagram_basic/);
  const wa = new URL(adAuthUrl("whatsapp", "https://app.example/cb", "st"));
  assert.equal(wa.host, "www.facebook.com");
  assert.match(wa.searchParams.get("scope")!, /whatsapp_business_management/);
  assert.match(wa.searchParams.get("scope")!, /whatsapp_business_messaging/);
  assert.equal(wa.searchParams.get("state"), "st");
  assert.ok(!wa.searchParams.has("config_id"));
  process.env.META_WHATSAPP_CONFIG_ID = "999";
  assert.equal(new URL(adAuthUrl("whatsapp", "https://app.example/cb", "st")).searchParams.get("config_id"), "999");
  delete process.env.META_WHATSAPP_CONFIG_ID;
  assert.ok(providerConfigured("whatsapp"));
});

test("only the known providers are accepted, and WhatsApp is never treated as an ad account", () => {
  for (const p of ["google", "meta", "whatsapp"]) assert.ok(isConnectProvider(p));
  for (const p of ["youtube", "instagram", "", null, "WHATSAPP"]) assert.ok(!isConnectProvider(p));
  assert.ok(!isAdProvider("whatsapp"));
});

test("a campaign that never went live can be withdrawn; one that reached the platforms cannot", async () => {
  const { withdrawCampaign } = await import("../../apps/intelligence/lib/actions/campaigns");
  const actor = { sub: "u1", name: "Owner", role: "owner", branchIds: ["b1"] } as never;
  const vehicle = { id: "V-1", branchId: "b1", status: "available" };
  const base = (status: string, platform?: object) => ({ campaigns: [{ id: "CMP-1", vehicleId: "V-1", status, platform, history: [] }], vehicles: [vehicle], audit: [] }) as never;
  for (const status of ["Draft", "Pending", "Approved"]) {
    const r = withdrawCampaign(base(status), actor, "CMP-1");
    assert.ok(r.ok, status);
    if (r.ok) assert.equal((r.state as { campaigns: unknown[] }).campaigns.length, 0);
  }
  assert.ok(!withdrawCampaign(base("Active"), actor, "CMP-1").ok);
  assert.ok(!withdrawCampaign(base("Approved", { meta: { campaign: "1" } }), actor, "CMP-1").ok, "created on a platform once");
});
