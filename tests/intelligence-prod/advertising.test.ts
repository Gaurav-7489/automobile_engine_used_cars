import { test } from "node:test";
import assert from "node:assert/strict";
import { harness, runFull } from "./harness";
import { provisionWorkspace } from "../../apps/intelligence/lib/server/provision";
import { issueInvite, redeemToken, resolvePrincipal, type Principal } from "../../apps/intelligence/lib/server/identity";
import { runCommands } from "../../apps/intelligence/lib/server/workspace";
import { redactFor } from "../../apps/intelligence/lib/server/redact";
import { principalSession } from "../../apps/intelligence/lib/server/auth";
import { buildShell } from "../../apps/intelligence/lib/server/shell";
import { readPublicListing } from "../../apps/intelligence/lib/server/public-listing";

const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const now = () => Math.floor(Date.now() / 1000);

test("a new campaign survives the server's response and the workspace shell, for the right branches only", async () => {
  const h = await harness();
  try {
    const admin = await h.admin.connect();
    const p = await provisionWorkspace(admin, { organization: "Gamma", dealership: "Gamma Motors", locations: [{ name: "Main", city: "Kochi", state: "Kerala", phone: "98470 12345" }, { name: "North", city: "Kozhikode", state: "Kerala", phone: "1" }], owner: { email: "o@gamma.example", name: "Owner" } });
    const r = await redeemToken(p.ownerToken, "correct horse battery 7");
    assert.ok(r.ok);
    const owner = (await resolvePrincipal((r as { userId: string }).userId, p.tenantId, now()))!;
    const [main, north] = p.locationIds;
    const add = await runFull(owner, [{ name: "addVehicle", args: [{ make: "Toyota", model: "Innova Crysta", variant: "2.4 GX", year: "2020", fuel: "Diesel", transmission: "Manual", km: "50000", owners: "1", registration: "KL 01 AA 0001", acquiredOn: today(), branchId: main, status: "preparation", asking: "1800000", costs: { acquisition: "1500000", transport: "0", inspection: "0", refurbishment: "50000", fees: "0" }, photos: "0" }] }], false);
    assert.ok(add.ok, JSON.stringify(add));
    assert.ok((await runFull(owner, [{ name: "transitionVehicle", args: ["V-1001", 1, { to: "available" }] }], false)).ok);

    // The production response is the shell (no vehicle records). The campaign must still be in it.
    const created = await runCommands(owner, [{ name: "createCampaign", args: ["V-1001"] }], false);
    assert.ok(created.ok, JSON.stringify(created));
    const session = principalSession(owner, now(), now() + 3600);
    const response = redactFor(created.state, session);
    assert.equal(response.vehicles.length, 0);
    assert.equal(response.campaigns.length, 1, "the campaign the member just created is returned");
    assert.equal(response.campaigns[0].vehicleId, "V-1001");
    // And on the next page load.
    assert.equal((await buildShell(owner, session)).campaigns.length, 1);

    // A member of another branch never receives it.
    const inv = await issueInvite(owner, { email: "north@gamma.example", name: "North", role: "manager", locationIds: [north], dealershipIds: [p.dealershipId] });
    assert.ok(inv.ok);
    const joined = await redeemToken((inv as { token: string }).token, "manager long password 5");
    assert.ok(joined.ok);
    const northManager: Principal = (await resolvePrincipal((joined as { userId: string }).userId, p.tenantId, now()))!;
    const northView = await buildShell(northManager, principalSession(northManager, now(), now() + 3600));
    assert.equal(northView.campaigns.length, 0);
    assert.equal(Object.keys(northView.recordBranches ?? {}).length, 0, "no stock ids from other branches leak through the branch map");

    // Public listing: hidden until published, then only public fields.
    assert.equal(await readPublicListing(p.tenantId, "V-1001"), null);
    await admin.query("UPDATE vehicles SET publish_status = 'published', payload = payload || $2::jsonb WHERE tenant_id = $1", [p.tenantId, JSON.stringify({ media: [{ url: "https://x.public.blob.vercel-storage.com/a.jpg" }, { url: "javascript:alert(1)" }] })]);
    const listing = await readPublicListing(p.tenantId, "v-1001");
    assert.ok(listing);
    assert.equal(listing.stockId, "V-1001");
    assert.equal(listing.price, 1800000);
    assert.deepEqual(listing.photos, ["https://x.public.blob.vercel-storage.com/a.jpg"]);
    assert.equal(listing.branch.city, "Kochi");
    assert.equal(listing.dealer, "Gamma");
    assert.ok(!JSON.stringify(listing).includes("KL 01 AA 0001"), "registration is never public");
    // Another tenant id, a malformed id or sold stock: nothing.
    assert.equal(await readPublicListing("00000000-0000-4000-8000-000000000000", "V-1001"), null);
    assert.equal(await readPublicListing("not-a-tenant", "V-1001"), null);
    await admin.query("UPDATE vehicles SET availability_status = 'sold' WHERE tenant_id = $1", [p.tenantId]);
    assert.equal(await readPublicListing(p.tenantId, "V-1001"), null);
  } finally {
    await h.close();
  }
});
