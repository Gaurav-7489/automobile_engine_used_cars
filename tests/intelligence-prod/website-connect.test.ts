import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { harness } from "./harness";
import { provisionWorkspace } from "../../apps/intelligence/lib/server/provision";
import { redeemToken, resolvePrincipal } from "../../apps/intelligence/lib/server/identity";
import { authenticateApiKey } from "../../apps/intelligence/lib/server/api-keys";
import { connectWebsite, disconnectWebsite, siteHost, websiteInfo } from "../../apps/intelligence/lib/server/website-connect";
import { loadVluceDemoCollection } from "../../apps/intelligence/lib/server/demo-collection";
import { readPublicInventory } from "../../apps/intelligence/lib/server/public-listing";
import { VLUCE_DEMO_CARS } from "../../packages/demo-data/src/vluce";

const key = () => `vl_${randomBytes(9).toString("base64url")}_${randomBytes(32).toString("base64url")}`;
const PASSWORD = "correct horse battery 7";

test("site host accepts plain web origins only", () => {
  assert.equal(siteHost("https://www.dealer.example/collection"), "www.dealer.example");
  assert.equal(siteHost("javascript:alert(1)"), null);
  assert.equal(siteHost("https://user:pw@dealer.example"), null);
});

test("an owner connects a website with their email; the link reads stock and can be renewed and ended", async () => {
  const h = await harness();
  try {
    const admin = await h.admin.connect();
    const p = await provisionWorkspace(admin, { organization: "VLuce Motor House Pvt Ltd", dealership: "VLuce Motor House", locations: [{ name: "Showroom", city: "Bengaluru", state: "Karnataka", phone: "1" }], owner: { email: "owner@vluce.example", name: "Owner" } });
    assert.ok((await redeemToken(p.ownerToken, PASSWORD)).ok);
    const k = key();
    const site = "https://vluce.example";

    const wrong = await connectWebsite({ email: "owner@vluce.example", password: "wrong password 1", key: k, siteUrl: site });
    assert.equal(wrong.ok, false);
    assert.equal((wrong as { status: number }).status, 401);
    assert.equal(await authenticateApiKey(`Bearer ${k}`), null, "a failed sign-in creates nothing");

    const bad = await connectWebsite({ email: "owner@vluce.example", password: PASSWORD, key: "not-a-key", siteUrl: site });
    assert.equal((bad as { status: number }).status, 422);

    const ok = await connectWebsite({ email: "Owner@VLuce.example ", password: PASSWORD, key: k, siteUrl: site });
    assert.ok(ok.ok, JSON.stringify(ok));
    assert.equal(ok.tenantId, p.tenantId);
    assert.equal(ok.site, "vluce.example");
    const caller = await authenticateApiKey(`Bearer ${k}`);
    assert.ok(caller);
    assert.equal(caller.scope, "inventory:read", "a website can only read stock");
    assert.equal(caller.tenantId, p.tenantId);
    const info = await websiteInfo(caller.tenantId, caller.keyId);
    assert.equal(info.site, "vluce.example");
    assert.equal(info.dealership, "VLuce Motor House Pvt Ltd");

    // Connecting again renews the same key rather than adding another.
    assert.ok((await connectWebsite({ email: "owner@vluce.example", password: PASSWORD, key: k, siteUrl: site })).ok);
    const rows = (await admin.query("SELECT name FROM intelligence_api_keys WHERE tenant_id=$1", [p.tenantId])).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, "Website: vluce.example");

    // The same key cannot be claimed by another workspace.
    const other = await provisionWorkspace(admin, { organization: "Other", dealership: "Other Motors", locations: [{ name: "Main", city: "Kochi", state: "Kerala", phone: "1" }], owner: { email: "o@other.example", name: "O" } });
    assert.ok((await redeemToken(other.ownerToken, PASSWORD)).ok);
    const stolen = await connectWebsite({ email: "o@other.example", password: PASSWORD, key: k, siteUrl: "https://other.example" });
    assert.equal(stolen.ok, false);
    assert.equal((stolen as { status: number }).status, 409);
    assert.equal((await authenticateApiKey(`Bearer ${k}`))?.tenantId, p.tenantId, "still the first workspace's");

    const ended = await disconnectWebsite({ email: "owner@vluce.example", password: PASSWORD, key: k });
    assert.ok(ended.ok && ended.disconnected);
    assert.equal(await authenticateApiKey(`Bearer ${k}`), null, "a disconnected website reads nothing");
    const audit = JSON.stringify((await admin.query("SELECT payload FROM intelligence_documents WHERE tenant_id=$1 AND collection='audit'", [p.tenantId])).rows);
    assert.ok(audit.includes("website.connected") && audit.includes("website.disconnected"));
  } finally {
    await h.close();
  }
});

test("the VLuce demo collection loads the website template's cars, published, once", async () => {
  const h = await harness();
  try {
    const admin = await h.admin.connect();
    const p = await provisionWorkspace(admin, { organization: "VLuce Motor House Pvt Ltd", dealership: "VLuce Motor House", locations: [{ name: "Showroom", city: "Bengaluru", state: "Karnataka", phone: "1" }], owner: { email: "owner@vluce.example", name: "Owner" } });
    const r = await redeemToken(p.ownerToken, PASSWORD);
    assert.ok(r.ok);
    const owner = (await resolvePrincipal((r as { userId: string }).userId, p.tenantId, Math.floor(Date.now() / 1000)))!;
    const first = await loadVluceDemoCollection(owner);
    assert.deepEqual(first.failed, []);
    assert.equal(first.added, VLUCE_DEMO_CARS.length);
    const live = VLUCE_DEMO_CARS.filter((c) => c.availability === "available" || c.availability === "reserved");
    assert.equal(first.published, live.length);

    const listed = await readPublicInventory(p.tenantId, { sort: "price-desc" });
    assert.equal(listed!.total, live.length, "arriving-soon cars stay unpublished");
    const top = [...live].sort((a, b) => (b.price ?? 0) - (a.price ?? 0))[0];
    assert.equal(listed!.cars[0].make, top.make);
    assert.equal(listed!.cars[0].price, top.price, "same price as on the website");
    const reserved = (await admin.query("SELECT count(*)::int AS n FROM vehicles WHERE tenant_id=$1 AND availability_status='reserved'", [p.tenantId])).rows[0].n;
    assert.equal(reserved, VLUCE_DEMO_CARS.filter((c) => c.availability === "reserved").length);
    const row = (await admin.query("SELECT payload FROM vehicles WHERE tenant_id=$1 AND payload->>'demoRef'=$2", [p.tenantId, top.ref])).rows[0].payload as Record<string, unknown>;
    assert.equal(row.description, top.description);
    assert.equal((row.media as unknown[]).length, top.photos.length);

    const again = await loadVluceDemoCollection(owner);
    assert.equal(again.added, 0);
    assert.equal(again.skipped, VLUCE_DEMO_CARS.length);
  } finally {
    await h.close();
  }
});
