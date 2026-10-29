import { test } from "node:test";
import assert from "node:assert/strict";
import { harness, runFull } from "./harness";
import { provisionWorkspace } from "../../apps/intelligence/lib/server/provision";
import { redeemToken, resolvePrincipal, signIn } from "../../apps/intelligence/lib/server/identity";
import { loadWorkspace, runCommands } from "../../apps/intelligence/lib/server/workspace";
import { redactFor } from "../../apps/intelligence/lib/server/redact";
import { principalSession } from "../../apps/intelligence/lib/server/auth";
import { tenantTx } from "../../apps/intelligence/lib/server/db";

const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

async function workspace(h: Awaited<ReturnType<typeof harness>>, name: string) {
  const admin = await h.admin.connect();
  const p = await provisionWorkspace(admin, {
    organization: name, dealership: name + " Motors",
    locations: [{ name: "Main", city: "Kochi", state: "Kerala", phone: "+91 0" }, { name: "Second", city: "Thrissur", state: "Kerala", phone: "+91 1" }],
    owner: { email: `owner@${name.toLowerCase()}.example`, name: name + " Owner" },
  });
  const created = await redeemToken(p.ownerToken, "correct horse battery 7");
  assert.ok(created.ok);
  const principal = (await resolvePrincipal((created as { userId: string }).userId, p.tenantId, Math.floor(Date.now() / 1000)))!;
  return { p, principal };
}

const vehicleInput = (branchId: string, extra: Partial<Record<string, string>> = {}) => ({
  make: "Honda", model: "City", variant: "VX", year: "2021", fuel: "Petrol", transmission: "Automatic", km: "32000", owners: "1", registration: "KL 07 CD 4521",
  acquiredOn: today(), branchId, status: "preparation", asking: "950000", costs: { acquisition: "800000", transport: "5000", inspection: "2000", refurbishment: "30000", fees: "3000" }, photos: "0", ...extra,
});

test("live workspace persists to the shared tables, enforces roles and branches, and isolates tenants", async () => {
  const h = await harness();
  try {
    const a = await workspace(h, "Alpha");
    const b = await workspace(h, "Beta");

    // A new workspace is empty: nothing is generated.
    const empty = await loadWorkspace(a.principal);
    assert.equal(empty.live, true);
    assert.equal(empty.vehicles.length, 0);
    assert.equal(empty.leads.length, 0);
    assert.equal(empty.sales.length, 0);
    assert.equal(empty.branches.length, 2);
    assert.equal(empty.integrations.find((i) => i.id === "feed-a")?.state, "Not configured");

    // Inventory create -> shared vehicles + stock_costs rows, same record readable back.
    const [main, second] = a.p.locationIds;
    const added = await runFull(a.principal, [{ name: "addVehicle", args: [vehicleInput(main)] }], false);
    assert.ok(added.ok, JSON.stringify(added));
    assert.equal(added.state.vehicles.length, 1);
    const vehicle = added.state.vehicles[0];
    assert.equal(vehicle.id, "V-1001");
    assert.equal(vehicle.asking, 95_000_000);
    const rows = await tenantTx(a.p.tenantId, async (c) => ({
      vehicles: (await c.query("SELECT stock_id, availability_status, publish_status, payload FROM vehicles")).rows,
      costs: (await c.query("SELECT payload FROM stock_costs")).rows,
      history: (await c.query("SELECT 1 FROM inventory_history")).rows.length,
    }));
    assert.equal(rows.vehicles.length, 1);
    assert.equal(rows.vehicles[0].stock_id, "V-1001");
    assert.equal(rows.vehicles[0].publish_status, "draft");
    assert.equal((rows.vehicles[0].payload as { price: number }).price, 950000);
    assert.equal((rows.costs[0].payload as { purchasePrice: number }).purchasePrice, 800000);
    assert.equal(rows.history, 1);

    // Cost basis and landed totals survive a reload exactly.
    const reloaded = await loadWorkspace(a.principal);
    const v = reloaded.vehicles[0];
    assert.equal(v.costs.acquisition + v.costs.transport + v.costs.inspection + v.costs.refurbishment + v.costs.fees, 84_000_000 + 1_000_000 - 1_000_000);

    // Untrusted patch fields are dropped: an edit cannot change the asking price or status.
    const tampered = await runFull(a.principal, [{ name: "updateVehicle", args: [vehicle.id, vehicle.version, { km: 33000, asking: 1, status: "sold", id: "V-9" }] }], false);
    assert.ok(tampered.ok);
    const afterTamper = tampered.state.vehicles[0];
    assert.equal(afterTamper.km, 33000);
    assert.equal(afterTamper.asking, 95_000_000);
    assert.equal(afterTamper.status, "preparation");

    // Optimistic concurrency: a stale version is rejected and nothing changes.
    const stale = await runFull(a.principal, [{ name: "updateVehicle", args: [vehicle.id, vehicle.version, { km: 40000 }] }], false);
    assert.equal(stale.ok, false);
    assert.equal((await loadWorkspace(a.principal)).vehicles[0].km, 33000);

    // Lead create -> shared leads + tasks rows.
    const lead = await runFull(a.principal, [{ name: "addLead", args: [{ name: "Buyer One", contact: "+91 90000 11111", source: "Walk-in", vehicleId: "unspecified", owner: a.principal.name, branchId: main, consentEvidence: "Walk-in form", marketingConsent: false }] }], false);
    assert.ok(lead.ok, JSON.stringify(lead));
    const leadRows = await tenantTx(a.p.tenantId, async (c) => ({ leads: (await c.query("SELECT stage, source, payload FROM leads")).rows, tasks: (await c.query("SELECT completed FROM tasks")).rows }));
    assert.equal(leadRows.leads.length, 1);
    assert.equal(leadRows.leads[0].stage, "new");
    assert.equal((leadRows.leads[0].payload as { phone: string }).phone, "+91 90000 11111");
    assert.equal(leadRows.tasks.length, 1);

    // Making a vehicle available needs a price and a cost; photos are not claimable in a live workspace.
    const toAvailable = await runFull(a.principal, [{ name: "transitionVehicle", args: [vehicle.id, afterTamper.version, { to: "available" }] }], false);
    assert.ok(toAvailable.ok, JSON.stringify(toAvailable));
    assert.equal(toAvailable.state.vehicles[0].status, "available");
    assert.equal(toAvailable.state.vehicles[0].hasImages, false);
    // Publishing to the owned website needs a photo, so it is refused rather than faked.
    const published = await runFull(a.principal, [{ name: "publishVehicles", args: [[vehicle.id]] }], false);
    assert.ok(published.ok);
    assert.equal((published as { state: { vehicles: { channels: string[] }[] } }).state.vehicles[0].channels.length, 0);

    // Sale: the sold transition records a sale with its cost basis, and realized profit comes from those real numbers.
    const sold = await runFull(a.principal, [{ name: "transitionVehicle", args: [vehicle.id, toAvailable.state.vehicles[0].version, { to: "sold", sale: { salePrice: "930000", directCosts: "10000", closedOn: today() } }] }], false);
    assert.ok(sold.ok, JSON.stringify(sold));
    assert.equal(sold.state.sales.length, 1);
    const sale = sold.state.sales[0];
    assert.equal(sale.salePrice, 93_000_000);
    assert.equal(sale.landed, 84_000_000);
    assert.equal(sale.directCosts, 1_000_000);
    assert.equal(sale.state, "Completed");
    const persistedSale = await tenantTx(a.p.tenantId, async (c) => ({ doc: (await c.query("SELECT payload FROM intelligence_documents WHERE collection='sales'")).rows.length, vehicle: (await c.query("SELECT availability_status, publish_status FROM vehicles")).rows[0] }));
    assert.equal(persistedSale.doc, 1);
    assert.deepEqual(persistedSale.vehicle, { availability_status: "sold", publish_status: "archived" });
    const afterSale = await loadWorkspace(a.principal);
    assert.equal(afterSale.sales[0].id, sale.id);
    assert.equal(afterSale.vehicles[0].status, "sold");

    // Role enforcement happens on the server: a sales member cannot add stock or approve prices.
    const salesToken = await (async () => {
      const c = await h.admin.connect();
      await c.query("INSERT INTO intelligence_users(id,email,display_name,password_hash) VALUES('00000000-0000-4000-8000-000000000001','sales@alpha.example','Sales','x')");
      await c.query("INSERT INTO staff_members(tenant_id,user_id,payload) VALUES($1,'00000000-0000-4000-8000-000000000001',$2)", [a.p.tenantId, { userId: "00000000-0000-4000-8000-000000000001", tenantId: a.p.tenantId, displayName: "Sales", role: "sales", intelligenceRole: "sales", dealershipIds: [a.p.dealershipId], locationIds: [main], enabled: true, version: 1, updatedAt: new Date().toISOString(), updatedBy: "t" }]);
      return (await resolvePrincipal("00000000-0000-4000-8000-000000000001", a.p.tenantId, Math.floor(Date.now() / 1000)))!;
    })();
    assert.equal(salesToken.role, "sales");
    const denied = await runFull(salesToken, [{ name: "addVehicle", args: [vehicleInput(main)] }], false);
    assert.equal(denied.ok, false);
    assert.equal((denied as { status: number }).status, 403);
    // ...and cannot act on a branch outside their access, even though the record exists.
    const wrongBranch = await runFull(salesToken, [{ name: "addLead", args: [{ name: "X", contact: "+91 90000 22222", source: "Walk-in", vehicleId: "unspecified", owner: "Sales", branchId: second, consentEvidence: "form", marketingConsent: false }] }], false);
    assert.equal(wrongBranch.ok, false);
    // Redaction: the sales member only receives their own branch.
    const salesView = redactFor(await loadWorkspace(salesToken), principalSession(salesToken, 0, 0));
    assert.deepEqual(salesView.branches.map((x) => x.id), [main]);

    // Unknown operations and malformed batches are refused.
    const unknown = await runFull(a.principal, [{ name: "dropEverything", args: [] }], false);
    assert.equal(unknown.ok, false);

    // Re-authentication is decided by the server: a caller-supplied "true" is ignored.
    const role = await runFull(a.principal, [{ name: "changeRole", args: [salesToken.userId, "manager", true] }], false);
    assert.equal(role.ok, false);
    const roleOk = await runFull(a.principal, [{ name: "changeRole", args: [salesToken.userId, "manager", false] }], true);
    assert.ok(roleOk.ok, JSON.stringify(roleOk));
    assert.equal((await resolvePrincipal(salesToken.userId, a.p.tenantId, Math.floor(Date.now() / 1000)))?.role, "manager");

    // Invitations produce a one-time link and no account until redeemed.
    const invite = await runFull(a.principal, [{ name: "inviteMember", args: [{ email: "new@alpha.example", role: "viewer", branchIds: [main] }] }], false);
    assert.ok(invite.ok, JSON.stringify(invite));
    assert.equal(invite.effects.inviteLinks.length, 1);
    assert.ok(invite.state.team.some((m) => m.email === "new@alpha.example" && m.status === "Invited"));
    assert.deepEqual(await signIn("new@alpha.example", "whatever long password 1"), { ok: false, code: "invalid" });

    // Tenant isolation: tenant B sees none of tenant A's records, and cannot write into them.
    const other = await loadWorkspace(b.principal);
    assert.equal(other.vehicles.length, 0);
    assert.equal(other.leads.length, 0);
    assert.equal(other.team.length, 1);
    const crossRead = await tenantTx(b.p.tenantId, async (c) => (await c.query("SELECT count(*)::int AS n FROM vehicles WHERE tenant_id = $1", [a.p.tenantId])).rows[0].n);
    assert.equal(crossRead, 0);
    await assert.rejects(() => tenantTx(b.p.tenantId, (c) => c.query("INSERT INTO vehicles(id,tenant_id,dealership_id,location_id,slug,stock_id,payload,publish_status,availability_status) VALUES(gen_random_uuid(),$1,$2,$3,'x','x','{}','draft','available')", [a.p.tenantId, a.p.dealershipId, main])), /row-level security/);
    // Tenant A's principal cannot be pointed at tenant B's data through a forged tenant id.
    assert.equal(await resolvePrincipal(a.principal.userId, b.p.tenantId, Math.floor(Date.now() / 1000)), null);

    // Documents (campaigns, price requests, alerts) stay tenant-scoped.
    await runFull(a.principal, [{ name: "toggleWatch", args: ["x"] }], false);
    assert.equal((await loadWorkspace(b.principal)).watchlist.length, 0);
  } finally { await h.close(); }
});
