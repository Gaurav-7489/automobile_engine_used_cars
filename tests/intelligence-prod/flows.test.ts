import { test } from "node:test";
import assert from "node:assert/strict";
import { harness, runFull } from "./harness";
import { provisionWorkspace } from "../../apps/intelligence/lib/server/provision";
import { issueInvite, redeemToken, resolvePrincipal, type Principal } from "../../apps/intelligence/lib/server/identity";
import { loadWorkspace } from "../../apps/intelligence/lib/server/workspace";
import { tenantTx } from "../../apps/intelligence/lib/server/db";

const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

test("pricing approval, sales linkage, campaign safety and unconnected integrations behave honestly", async () => {
  const h = await harness();
  try {
    const admin = await h.admin.connect();
    const mk = async (name: string) => {
      const p = await provisionWorkspace(admin, { organization: name, dealership: name + " Motors", locations: [{ name: "Main", city: "Kochi", state: "Kerala", phone: "1" }], owner: { email: `o@${name}.example`, name: "Owner" } });
      const r = await redeemToken(p.ownerToken, "correct horse battery 7");
      assert.ok(r.ok);
      return { p, owner: (await resolvePrincipal((r as { userId: string }).userId, p.tenantId, Math.floor(Date.now() / 1000)))! };
    };
    const a = await mk("alpha");
    const b = await mk("beta");
    const branch = a.p.locationIds[0];

    // A manager joins through a real invitation.
    const inv = await issueInvite(a.owner, { email: "mgr@alpha.example", name: "Manager", role: "manager", locationIds: [branch], dealershipIds: [a.p.dealershipId] });
    assert.ok(inv.ok);
    const joined = await redeemToken((inv as { token: string }).token, "manager long password 5");
    assert.ok(joined.ok);
    const manager: Principal = (await resolvePrincipal((joined as { userId: string }).userId, a.p.tenantId, Math.floor(Date.now() / 1000)))!;
    assert.equal(manager.role, "manager");

    const add = await runFull(a.owner, [{ name: "addVehicle", args: [{ make: "Toyota", model: "Innova", variant: "GX", year: "2020", fuel: "Diesel", transmission: "Manual", km: "50000", owners: "1", registration: "KL 01 AA 0001", acquiredOn: today(), branchId: branch, status: "preparation", asking: "1800000", costs: { acquisition: "1500000", transport: "0", inspection: "0", refurbishment: "50000", fees: "0" }, photos: "0" }] }], false);
    assert.ok(add.ok);
    const id = "V-1001";
    const avail = await runFull(a.owner, [{ name: "transitionVehicle", args: [id, 1, { to: "available" }] }], false);
    assert.ok(avail.ok, JSON.stringify(avail));
    const v = avail.state.vehicles[0];

    // No market feed: nothing is estimated, so a price request is manual and needs a reason.
    const noReason = await runFull(manager, [{ name: "createPriceRequest", args: [{ vehicleId: id, proposedAsking: 175000000, reason: "", submit: true }] }], false);
    assert.equal(noReason.ok, false);
    const req = await runFull(manager, [{ name: "createPriceRequest", args: [{ vehicleId: id, proposedAsking: 175000000, reason: "Aged stock, price to move", submit: true }] }], false);
    assert.ok(req.ok, JSON.stringify(req));
    const request = req.state.priceRequests[0];
    assert.equal(request.evidenceTier, "Insufficient");
    assert.equal(request.estimate, null);
    // Distinct approver: the requester cannot approve their own request.
    const self = await runFull(manager, [{ name: "approvePriceRequest", args: [request.id] }], false);
    assert.equal(self.ok, false);
    assert.equal((self as { status: number }).status, 403);
    // The owner approves; the shared vehicle row carries the new price and only the owned site is marked synced.
    const approved = await runFull(a.owner, [{ name: "approvePriceRequest", args: [request.id] }], false);
    assert.ok(approved.ok, JSON.stringify(approved));
    assert.deepEqual(approved.state.priceRequests[0].syncs.map((s) => s.channel), ["Owned site"]);
    const price = await tenantTx(a.p.tenantId, async (c) => (await c.query("SELECT payload->>'price' AS price FROM vehicles WHERE stock_id = 'V-1001'")).rows[0].price);
    assert.equal(price, "1750000");
    // Approving twice is idempotent in effect: the second attempt is refused.
    assert.equal((await runFull(a.owner, [{ name: "approvePriceRequest", args: [request.id] }], false)).ok, false);

    // Campaigns can be drafted and approved but never published without a connected advertising account.
    const camp = await runFull(manager, [{ name: "createCampaign", args: [id] }], false);
    assert.ok(camp.ok, JSON.stringify(camp));
    const campaignId = camp.state.campaigns[0].id;
    const publish = await runFull(a.owner, [{ name: "publishCampaign", args: [campaignId] }], false);
    assert.equal(publish.ok, false);
    assert.equal(publish.state.campaigns[0].status, "Draft");
    // Integrations cannot be "connected" without provider credentials, and messaging is refused.
    const connect = await runFull(a.owner, [{ name: "connectIntegration", args: ["ads", true] }], false);
    assert.equal(connect.ok, false);
    assert.match((connect as { message: string }).message, /Setup required/);
    const stateNow = await loadWorkspace(a.owner);
    assert.equal(stateNow.integrations.find((i) => i.id === "ads")?.state, "Not configured");
    assert.deepEqual((await loadWorkspace(a.owner)).alerts.filter((x) => x.type === "Integration"), []);

    // Leads, sale and Won: the append-only shared sales ledger receives the sale once a lead is linked.
    const lead = await runFull(a.owner, [{ name: "addLead", args: [{ name: "Ravi", contact: "+91 90000 33333", source: "Website", vehicleId: id, owner: "Owner", branchId: branch, consentEvidence: "Website form", marketingConsent: true }] }], false);
    assert.ok(lead.ok, JSON.stringify(lead));
    const msg = await runFull(a.owner, [{ name: "sendMessage", args: ["L-1001", "Hello", false] }], false);
    assert.equal(msg.ok, false);
    assert.match((msg as { message: string }).message, /not connected/i);
    const priceNow = (await loadWorkspace(a.owner)).vehicles[0];
    const sold = await runFull(a.owner, [{ name: "transitionVehicle", args: [id, priceNow.version, { to: "sold", sale: { salePrice: "1700000", directCosts: "5000", closedOn: today() } }] }], false);
    assert.ok(sold.ok, JSON.stringify(sold));
    const saleId = sold.state.sales[0].id;
    const won = await runFull(a.owner, [{ name: "changeStage", args: ["L-1001", 1, "Won", { saleId }] }], false);
    assert.ok(won.ok, JSON.stringify(won));
    const shared = await tenantTx(a.p.tenantId, async (c) => ({ sales: (await c.query("SELECT amount::text AS amount FROM sales")).rows, stage: (await c.query("SELECT stage FROM leads")).rows[0].stage }));
    assert.deepEqual(shared.sales, [{ amount: "1700000.00" }]);
    assert.equal(shared.stage, "won");
    // Realized profit is arithmetic on recorded numbers: 17,00,000 - 15,50,000 landed - 5,000 direct = 1,45,000.
    const finalState = await loadWorkspace(a.owner);
    const s = finalState.sales[0];
    assert.equal(s.salePrice - s.landed - s.directCosts, 14_500_000);

    // Another tenant cannot see or act on these records, even by guessing ids.
    const probe = await runFull(b.owner, [{ name: "transitionVehicle", args: [id, 1, { to: "archived" }] }], false);
    assert.equal(probe.ok, false);
    assert.equal((probe as { status: number }).status, 404);
    assert.equal((await loadWorkspace(b.owner)).sales.length, 0);
    assert.equal(v.id, id);
  } finally { await h.close(); }
});
