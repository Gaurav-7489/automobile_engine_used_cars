import { test } from "node:test";
import assert from "node:assert/strict";
import { harness, runFull } from "./harness";
import { provisionWorkspace } from "../../apps/intelligence/lib/server/provision";
import { redeemToken, resolvePrincipal } from "../../apps/intelligence/lib/server/identity";
import { loadWorkspace } from "../../apps/intelligence/lib/server/workspace";
import { submitWebsiteEnquiry, validateEnquiry } from "../../apps/intelligence/lib/server/website-enquiry";

const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const now = () => Math.floor(Date.now() / 1000);

test("validation rejects bad input in the customer's words", () => {
  const bad = validateEnquiry({ name: "A", phone: "123", consent: false });
  assert.equal(bad.input, null);
  assert.deepEqual(Object.keys(bad.fields).sort(), ["consent", "name", "phone"]);
  const good = validateEnquiry({ name: "  Anu  Thomas ", phone: "98470 12345", consent: true, intent: "test-drive", message: "Is it\u0000 available?", utmSource: "Instagram" });
  assert.ok(good.input);
  assert.equal(good.input.phone, "+91 98470 12345");
  assert.equal(good.input.name, "Anu Thomas");
  assert.equal(good.input.intent, "test-drive");
  assert.equal(good.input.utmSource, "instagram");
  assert.ok(!good.input.message.includes("\u0000"));
  assert.equal(validateEnquiry({ name: "Anu", phone: "98470 12345", consent: true, intent: "hack" }).input?.intent, "call");
});

test("a website enquiry becomes a lead on the car, in its branch, attributed to the campaign, once per day", async () => {
  const h = await harness();
  try {
    const admin = await h.admin.connect();
    const p = await provisionWorkspace(admin, { organization: "Delta", dealership: "Delta Motors", locations: [{ name: "Main", city: "Kochi", state: "Kerala", phone: "98470 12345" }, { name: "North", city: "Kozhikode", state: "Kerala", phone: "1" }], owner: { email: "o@delta.example", name: "Owner" } });
    const r = await redeemToken(p.ownerToken, "correct horse battery 7");
    assert.ok(r.ok);
    const owner = (await resolvePrincipal((r as { userId: string }).userId, p.tenantId, now()))!;
    const north = p.locationIds[1];
    assert.ok((await runFull(owner, [{ name: "addVehicle", args: [{ make: "Hyundai", model: "Creta", variant: "SX", year: "2022", fuel: "Petrol", transmission: "Automatic", km: "21000", owners: "1", registration: "KL 11 AB 1234", acquiredOn: today(), branchId: north, status: "preparation", asking: "1450000", costs: { acquisition: "1300000", transport: "0", inspection: "0", refurbishment: "0", fees: "0" }, photos: "0" }] }], false)).ok);
    assert.ok((await runFull(owner, [{ name: "transitionVehicle", args: ["V-1001", 1, { to: "available" }] }], false)).ok);
    const camp = await runFull(owner, [{ name: "createCampaign", args: ["V-1001"] }], false);
    assert.ok(camp.ok);
    const campaign = camp.state.campaigns[0];
    const input = validateEnquiry({ name: "Anu Thomas", phone: "98470 55555", consent: true, intent: "test-drive", message: "Weekend test drive?", utmSource: "instagram", utmCampaign: campaign.utm }).input!;

    // Not published yet: refused, nothing created.
    const hidden = await submitWebsiteEnquiry(p.tenantId, "V-1001", input);
    assert.equal(hidden.ok, false);
    assert.equal((hidden as { status: number }).status, 404);
    await admin.query("UPDATE vehicles SET publish_status = 'published' WHERE tenant_id = $1", [p.tenantId]);

    const first = await submitWebsiteEnquiry(p.tenantId, "v-1001", input);
    assert.ok(first.ok, JSON.stringify(first));
    assert.equal(first.duplicate, false);
    const state = await loadWorkspace(owner);
    const lead = state.leads.find((l) => l.id === first.reference)!;
    assert.ok(lead, "the lead is in the workspace");
    assert.equal(lead.vehicleId, "V-1001");
    assert.equal(lead.branchId, north, "the lead belongs to the car's branch");
    assert.equal(lead.source, "Website");
    assert.equal(lead.campaignId, campaign.id, "attributed to the campaign from the link's utm_campaign");
    assert.equal(lead.stage, "New");
    assert.equal(lead.owner, "Unassigned");
    assert.match(lead.interactions.at(-1)!.detail, /via instagram.*test drive.*Weekend test drive/);
    assert.ok(state.audit.some((a) => a.action === "lead.created" && a.actor === "Website"));

    // Same phone, same car, same day: the existing lead, not another one.
    const again = await submitWebsiteEnquiry(p.tenantId, "V-1001", input);
    assert.ok(again.ok);
    assert.equal(again.reference, first.reference);
    assert.equal(again.duplicate, true);
    assert.equal((await loadWorkspace(owner)).leads.length, 1);

    // A tracking tag from another dealership's campaign, or a forged one, is ignored.
    const other = await submitWebsiteEnquiry(p.tenantId, "V-1001", { ...input, phone: "+91 98470 66666", utmCampaign: "vl_cmp-9999_v-9" });
    assert.ok(other.ok);
    assert.equal((await loadWorkspace(owner)).leads.find((l) => l.id === other.reference)?.campaignId, undefined);

    // Sold, unknown dealership or malformed ids: refused.
    assert.equal((await submitWebsiteEnquiry("00000000-0000-4000-8000-000000000000", "V-1001", input)).ok, false);
    assert.equal((await submitWebsiteEnquiry(p.tenantId, "V-1001'; drop table leads;--", input)).ok, false);
    await admin.query("UPDATE vehicles SET availability_status = 'sold' WHERE tenant_id = $1", [p.tenantId]);
    assert.equal((await submitWebsiteEnquiry(p.tenantId, "V-1001", { ...input, phone: "+91 98470 77777" })).ok, false);
  } finally {
    await h.close();
  }
});
