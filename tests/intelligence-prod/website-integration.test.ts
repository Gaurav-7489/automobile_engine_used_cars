import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { harness, runFull } from "./harness";
import { provisionWorkspace } from "../../apps/intelligence/lib/server/provision";
import { redeemToken, resolvePrincipal, type Principal } from "../../apps/intelligence/lib/server/identity";
import { authenticateApiKey, createApiKey, scopeAllows } from "../../apps/intelligence/lib/server/api-keys";
import { connectWebsite, disconnectWebsite } from "../../apps/intelligence/lib/server/website-connect";
import { loadWorkspace } from "../../apps/intelligence/lib/server/workspace";
import { recordWebsiteEnquiry, validateWebsiteEnquiry } from "../../apps/intelligence/lib/server/website-enquiries";
import { deliverWebhooks, verifySignature, websiteChanges } from "../../apps/intelligence/lib/server/website-webhooks";
import { parseEvents, recordEvents, websitePerformance } from "../../apps/intelligence/lib/server/website-analytics";
import { POST as enquiriesRoute } from "../../apps/intelligence/app/api/v1/website/enquiries/route";
import { POST as eventsRoute } from "../../apps/intelligence/app/api/v1/website/events/route";
import { POST as publicEnquiryRoute } from "../../apps/intelligence/app/api/public/enquiry/route";
import type { Vehicle } from "../../apps/intelligence/lib/domain";

const PASSWORD = "correct horse battery 7";
const key = () => `vl_${randomBytes(9).toString("base64url")}_${randomBytes(32).toString("base64url")}`;
const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const now = () => Math.floor(Date.now() / 1000);
const req = (path: string, k: string | null, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://intel.example${path}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...(k ? { authorization: `Bearer ${k}` } : {}), ...headers }, body: JSON.stringify(body) });

/** Two dealerships, each with a published car, an owner, and a connected website. */
async function setup() {
  const h = await harness();
  const admin = await h.admin.connect();
  const make = async (name: string, email: string, branches: string[]) => {
    const p = await provisionWorkspace(admin, { organization: name, dealership: name, locations: branches.map((b) => ({ name: b, city: "Kochi", state: "Kerala", phone: "98470 12345" })), owner: { email, name: "Owner" } });
    const r = await redeemToken(p.ownerToken, PASSWORD);
    assert.ok(r.ok);
    const owner = (await resolvePrincipal((r as { userId: string }).userId, p.tenantId, now()))!;
    return { ...p, owner };
  };
  const a = await make("Alpha Motors", "owner@alpha.example", ["Main", "North"]);
  const b = await make("Beta Cars", "owner@beta.example", ["Main"]);
  let plate = 1000;
  const addCar = async (owner: Principal, branchId: string) => {
    const known = new Set((await loadWorkspace(owner)).vehicles.map((x) => x.id));
    const out = await runFull(owner, [{ name: "addVehicle", args: [{ make: "Hyundai", model: "Creta", variant: "SX", year: "2022", fuel: "Petrol", transmission: "Automatic", km: "21000", owners: "1", registration: `KL 11 AB ${++plate}`, acquiredOn: today(), branchId, status: "preparation", asking: "1450000", costs: { acquisition: "1300000", transport: "0", inspection: "0", refurbishment: "0", fees: "0" }, photos: "0" }] }], false);
    assert.ok(out.ok, JSON.stringify(out).slice(0, 300));
    const id = out.state.vehicles.find((x) => !known.has(x.id))!.id;
    // Photos arrive through the shared vehicle record (the media upload path); a newer timestamp makes the workspace pick them up.
    await admin.query("UPDATE vehicles SET payload = payload || jsonb_build_object('media', jsonb_build_array(jsonb_build_object('id', 'p1', 'url', 'https://img.example/1.jpg', 'kind', 'image'))), updated_at = now() + interval '1 second' WHERE tenant_id = $1 AND stock_id = $2", [owner.tenantId, id]);
    const fresh = (await loadWorkspace(owner)).vehicles.find((x) => x.id === id)!;
    const avail = await runFull(owner, [{ name: "transitionVehicle", args: [id, fresh.version, { to: "available" }] }], false);
    assert.ok(avail.ok, JSON.stringify(avail).slice(0, 300));
    return id;
  };
  const carA = await addCar(a.owner, a.locationIds[0]);
  const carANorth = await addCar(a.owner, a.locationIds[1]);
  const carB = await addCar(b.owner, b.locationIds[0]);
  const keyA = key(), keyB = key();
  assert.ok((await connectWebsite({ email: "owner@alpha.example", password: PASSWORD, key: keyA, siteUrl: "https://alpha.example" })).ok);
  assert.ok((await connectWebsite({ email: "owner@beta.example", password: PASSWORD, key: keyB, siteUrl: "https://beta.example" })).ok);
  // Published the way a dealer does it, so the read model and the website events follow the real path.
  assert.ok((await runFull(a.owner, [{ name: "publishVehicles", args: [[carA, carANorth]] }], false)).ok);
  assert.ok((await runFull(b.owner, [{ name: "publishVehicles", args: [[carB]] }], false)).ok);
  assert.equal(Number((await admin.query("SELECT count(*)::int AS n FROM vehicles WHERE publish_status = 'published'")).rows[0].n), 3);
  const callerA = (await authenticateApiKey(`Bearer ${keyA}`))!;
  return { h, admin, a, b, carA, carANorth, carB, keyA, keyB, callerA };
}

const enquiry = (over: Record<string, unknown> = {}) => ({ type: "vehicle", name: "Anu Thomas", phone: "98470 55555", consent: true, consentAt: new Date().toISOString(), utmSource: "instagram", reference: "VL-ABCDE-12345", ...over });

test("scopes: a website key reads stock and records enquiries; a leads key cannot act as a website; legacy website keys keep working", () => {
  assert.ok(scopeAllows({ scope: "website", name: "Website: a" }, "inventory:read"));
  assert.ok(scopeAllows({ scope: "website", name: "Website: a" }, "website"));
  assert.ok(!scopeAllows({ scope: "website", name: "Website: a" }, "leads:read"), "a website can never read leads");
  assert.ok(!scopeAllows({ scope: "leads:read", name: "Website: a" }, "website"));
  assert.ok(!scopeAllows({ scope: "inventory:read", name: "Stock feed" }, "website"));
  assert.ok(scopeAllows({ scope: "inventory:read", name: "Website: old.example" }, "website"));
});

test("every enquiry type becomes the right lead, in the right branch, once", async () => {
  const s = await setup();
  try {
    const caller = { tenantId: s.callerA.tenantId, locationIds: s.callerA.locationIds, keyId: s.callerA.keyId, site: "alpha.example" };
    const v = (raw: Record<string, unknown>) => { const r = validateWebsiteEnquiry(raw); assert.ok(r.input, JSON.stringify(r.fields)); return r.input; };

    const car = await recordWebsiteEnquiry(caller, "idem-vehicle-0001", v(enquiry({ stockId: s.carANorth })));
    assert.ok(car.ok && !car.duplicate, JSON.stringify(car));
    const retried = await recordWebsiteEnquiry(caller, "idem-vehicle-0001", v(enquiry({ stockId: s.carANorth })));
    assert.ok(retried.ok && retried.duplicate && retried.reference === car.reference, "a retried delivery returns the first lead");
    const sameDay = await recordWebsiteEnquiry(caller, "idem-vehicle-0002", v(enquiry({ stockId: s.carANorth, type: "price" })));
    assert.ok(sameDay.ok && sameDay.duplicate && sameDay.reference === car.reference, "same phone, same car, same day joins the lead");

    const results: Record<string, string> = {};
    for (const [type, extra] of Object.entries({
      callback: { phone: "98470 11111" },
      test_drive: { phone: "98470 22222", stockId: s.carA, appointment: { date: "2099-05-01", time: "Morning" } },
      sell: { phone: "98470 33333", sell: { brand: "Honda", model: "City", year: 2019, km: 42000, expectedPrice: 650000 } },
      visit: { phone: "98470 44444", appointment: { date: "2099-05-02", time: "Evening" } },
      general: { phone: "98470 66666", message: "Do you take exchanges?" },
      whatsapp: { phone: "98470 77777" },
    })) {
      const r = await recordWebsiteEnquiry(caller, `idem-${type}-0001`, v(enquiry({ type, ...extra })));
      assert.ok(r.ok && !r.duplicate, `${type}: ${JSON.stringify(r)}`);
      results[type] = r.reference;
    }
    const state = await loadWorkspace(s.a.owner);
    const lead = (id: string) => state.leads.find((l) => l.id === id)!;
    const north = lead(car.reference);
    assert.equal(north.vehicleId, s.carANorth);
    assert.equal(north.branchId, s.a.locationIds[1], "a car enquiry belongs to the car's branch");
    assert.equal(north.source, "Website");
    assert.equal(north.enquiry?.type, "vehicle");
    assert.equal(north.enquiry?.attribution?.utmSource, "instagram");
    assert.equal(lead(results.callback).tasks[0].title, "Call the customer back");
    assert.equal(lead(results.callback).vehicleId, null);
    assert.deepEqual(lead(results.test_drive).enquiry?.requested, { date: "2099-05-01", time: "Morning" });
    assert.equal(lead(results.test_drive).appointment, undefined, "a requested slot is not a confirmed appointment");
    assert.equal(lead(results.test_drive).tasks[0].title, "Confirm the test drive");
    assert.equal(lead(results.sell).enquiry?.sell?.make, "Honda");
    assert.match(lead(results.sell).interactions.at(-1)!.detail, /Sell-your-car enquiry.*2019 Honda City.*42,000 km.*expects ₹6,50,000/);
    assert.equal(lead(results.sell).tasks[0].title, "Arrange an appraisal");
    assert.equal(lead(results.visit).tasks[0].title, "Confirm the showroom visit");
    assert.equal(lead(results.whatsapp).source, "WhatsApp");
    assert.match(lead(results.general).interactions.at(-1)!.detail, /exchanges/);
    assert.equal(state.leads.length, 7);

    // Sold, unpublished or unknown cars are refused and nothing is created.
    await s.admin.query("UPDATE vehicles SET availability_status = 'sold' WHERE stock_id = $1 AND tenant_id = $2", [s.carA, s.a.tenantId]);
    const sold = await recordWebsiteEnquiry(caller, "idem-sold-0001", v(enquiry({ stockId: s.carA, phone: "98470 88888" })));
    assert.equal(sold.ok, false);
    assert.equal((sold as { status: number }).status, 404);
    assert.equal((await loadWorkspace(s.a.owner)).leads.length, 7);
  } finally { await s.h.close(); }
});

test("tenant isolation: one dealership's website key can never record into, or read, another dealership", async () => {
  const s = await setup();
  try {
    // Beta's car (given a stock id Alpha does not use) through Alpha's key: not found, whatever the body says.
    await s.admin.query("UPDATE vehicles SET stock_id = 'B-2001' WHERE tenant_id = $1", [s.b.tenantId]);
    const cross = await enquiriesRoute(req("/api/v1/website/enquiries", s.keyA, enquiry({ stockId: "B-2001", tenant: s.b.tenantId }), { "idempotency-key": "idem-cross-0001" }));
    assert.equal(cross.status, 404);
    assert.equal((await loadWorkspace(s.b.owner)).leads.length, 0, "nothing reached Beta");
    // A body tenant is ignored: the lead lands in the key's workspace.
    const general = await enquiriesRoute(req("/api/v1/website/enquiries", s.keyA, enquiry({ type: "general", tenant: s.b.tenantId }), { "idempotency-key": "idem-cross-0002" }));
    assert.equal(general.status, 201);
    assert.equal((await loadWorkspace(s.a.owner)).leads.length, 1);
    assert.equal((await loadWorkspace(s.b.owner)).leads.length, 0);
    // Alpha's analytics never show Beta's events.
    await eventsRoute(req("/api/v1/website/events", s.keyB, { events: [{ type: "visit", sid: "sid-beta-0000000001" }] }));
    assert.equal((await websitePerformance(s.a.tenantId, 7)).totals.visits, 0);
    assert.equal((await websitePerformance(s.b.tenantId, 7)).totals.visits, 1);
  } finally { await s.h.close(); }
});

test("branch-limited key only records enquiries for its own branch's cars", async () => {
  const s = await setup();
  try {
    await s.admin.query("UPDATE intelligence_api_keys SET location_ids = $1 WHERE tenant_id = $2", [JSON.stringify([s.a.locationIds[0]]), s.a.tenantId]);
    const caller = (await authenticateApiKey(`Bearer ${s.keyA}`))!;
    const c = { tenantId: caller.tenantId, locationIds: caller.locationIds, keyId: caller.keyId, site: "alpha.example" };
    const other = await recordWebsiteEnquiry(c, "idem-branch-0001", validateWebsiteEnquiry(enquiry({ stockId: s.carANorth })).input!);
    assert.equal((other as { status: number }).status, 404);
    const own = await recordWebsiteEnquiry(c, "idem-branch-0002", validateWebsiteEnquiry(enquiry({ stockId: s.carA })).input!);
    assert.ok(own.ok);
    const general = await recordWebsiteEnquiry(c, "idem-branch-0003", validateWebsiteEnquiry(enquiry({ type: "general", phone: "98470 99999" })).input!);
    assert.ok(general.ok);
    assert.equal((await loadWorkspace(s.a.owner)).leads.find((l) => l.id === (general as { reference: string }).reference)?.branchId, s.a.locationIds[0]);
  } finally { await s.h.close(); }
});

test("endpoint security: no key, wrong scope, revoked, expired, missing idempotency key, bad payloads, oversized bodies", async () => {
  const s = await setup();
  try {
    const body = enquiry({ type: "general" });
    const hdr = { "idempotency-key": "idem-sec-00000001" };
    assert.equal((await enquiriesRoute(req("/api/v1/website/enquiries", null, body, hdr))).status, 401);
    assert.equal((await enquiriesRoute(req("/api/v1/website/enquiries", key(), body, hdr))).status, 401, "an unknown key");
    const leadsKey = await createApiKey(s.a.owner, "CRM export", "leads:read", 30);
    assert.equal((await enquiriesRoute(req("/api/v1/website/enquiries", leadsKey.key, body, hdr))).status, 403, "a leads key is not a website");
    assert.equal((await enquiriesRoute(req("/api/v1/website/enquiries", s.keyA, body))).status, 422, "Idempotency-Key is required");
    const invalid = await enquiriesRoute(req("/api/v1/website/enquiries", s.keyA, { type: "vehicle", name: "A", phone: "1" }, hdr));
    assert.equal(invalid.status, 422);
    const fields = ((await invalid.json()) as { error?: { fields?: Record<string, string> }; fields?: Record<string, string> });
    assert.ok(JSON.stringify(fields).includes("consent"));
    assert.equal((await enquiriesRoute(req("/api/v1/website/enquiries", s.keyA, { ...body, message: "x".repeat(7000) }, hdr))).status, 413);
    assert.equal((await enquiriesRoute(req("/api/v1/website/enquiries", s.keyA, [1, 2], hdr))).status, 422);

    await s.admin.query("UPDATE intelligence_api_keys SET expires_at = now() - interval '1 second' WHERE tenant_id = $1", [s.a.tenantId]);
    assert.equal((await enquiriesRoute(req("/api/v1/website/enquiries", s.keyA, body, hdr))).status, 401, "an expired key");
    await s.admin.query("UPDATE intelligence_api_keys SET expires_at = now() + interval '1 day' WHERE tenant_id = $1", [s.a.tenantId]);
    assert.ok((await disconnectWebsite({ email: "owner@alpha.example", password: PASSWORD, key: s.keyA })).ok);
    assert.equal((await enquiriesRoute(req("/api/v1/website/enquiries", s.keyA, body, hdr))).status, 401, "a disconnected website");

    // The older public route: a presented key must be valid and for that dealership.
    const legacy = { tenant: s.b.tenantId, stock: s.carB, name: "Anu Thomas", phone: "98470 55555", consent: true };
    assert.equal((await publicEnquiryRoute(req("/api/public/enquiry", key(), legacy))).status, 401);
    assert.equal((await publicEnquiryRoute(req("/api/public/enquiry", s.keyB.replace(/.$/, "A"), legacy))).status, 401);
    const leadsKeyB = await createApiKey(s.b.owner, "x", "leads:read", 30);
    const keyAgain = key();
    assert.ok((await connectWebsite({ email: "owner@alpha.example", password: PASSWORD, key: keyAgain, siteUrl: "https://alpha2.example" })).ok);
    assert.equal((await publicEnquiryRoute(req("/api/public/enquiry", keyAgain, legacy))).status, 403, "Alpha's key cannot post for Beta");
    void leadsKeyB;
  } finally { await s.h.close(); }
});

test("inventory webhooks: queued only when a change commits, signed, no costs, retried, stopped on disconnect", async () => {
  const s = await setup();
  try {
    // A price change on a published car queues one event for the connected website.
    const before = (await loadWorkspace(s.a.owner)).vehicles.find((x) => x.id === s.carA)!;
    const published = (await s.admin.query("SELECT payload FROM intelligence_webhook_outbox WHERE tenant_id = $1", [s.a.tenantId])).rows as { payload: { vehicles: { stockId: string; changes: string[] }[] } }[];
    assert.deepEqual(published.map((r) => r.payload.vehicles), [[{ stockId: s.carA, changes: ["published"] }, { stockId: s.carANorth, changes: ["published"] }]], "publishing queues a 'published' event");
    await s.admin.query("DELETE FROM intelligence_webhook_outbox");
    const reserved = await runFull(s.a.owner, [{ name: "transitionVehicle", args: [s.carA, before.version, { to: "reserved", note: "Booking B-17" }] }], false);
    assert.ok(reserved.ok, JSON.stringify(reserved).slice(0, 300));
    const rows = (await s.admin.query("SELECT payload, status FROM intelligence_webhook_outbox WHERE tenant_id = $1", [s.a.tenantId])).rows as { payload: { vehicles: { stockId: string; changes: string[] }[] }; status: string }[];
    assert.equal(rows.length, 1, "one event per committed batch per website");
    assert.deepEqual(rows[0].payload.vehicles, [{ stockId: s.carA, changes: ["unpublished", "reserved"] }], "a reserved car leaves the website, as it is saved");
    const text = JSON.stringify(rows[0].payload);
    assert.ok(text.includes(s.carA));
    assert.ok(!/1300000|1400000|1450000|cost|margin|phone/i.test(text), "no prices, costs or customer data in the event");
    assert.equal((await s.admin.query("SELECT count(*)::int AS n FROM intelligence_webhook_outbox WHERE tenant_id = $1", [s.b.tenantId])).rows[0].n, 0, "the other dealership's website hears nothing");

    // A failed command queues nothing.
    const failed = await runFull(s.a.owner, [{ name: "transitionVehicle", args: [s.carA, 999, { to: "available" }] }], false);
    assert.equal(failed.ok, false);
    assert.equal((await s.admin.query("SELECT count(*)::int AS n FROM intelligence_webhook_outbox WHERE tenant_id = $1", [s.a.tenantId])).rows[0].n, 1);

    // Delivery: first the site is down (retried later), then it accepts a correctly signed request.
    const secret = createHash("sha256").update(s.keyA).digest("hex");
    const seen: { url: string; headers: Record<string, string>; body: string }[] = [];
    let up = false;
    const fetcher = (async (url: URL | string, init: RequestInit) => { seen.push({ url: String(url), headers: init.headers as Record<string, string>, body: String(init.body) }); return new Response(null, { status: up ? 204 : 503 }); }) as typeof fetch;
    assert.deepEqual(await deliverWebhooks(s.a.tenantId, 20, fetcher), { attempted: 1, delivered: 0 });
    assert.deepEqual(await deliverWebhooks(s.a.tenantId, 20, fetcher), { attempted: 0, delivered: 0 }, "backoff: not retried immediately");
    await s.admin.query("UPDATE intelligence_webhook_outbox SET next_attempt_at = now() - interval '1 second'");
    up = true;
    assert.deepEqual(await deliverWebhooks(s.a.tenantId, 20, fetcher), { attempted: 1, delivered: 1 });
    const last = seen.at(-1)!;
    assert.equal(last.url, "https://alpha.example/api/webhooks/inventory");
    assert.ok(verifySignature(secret, last.headers["X-VandLabs-Timestamp"], last.body, last.headers["X-VandLabs-Signature"]), "signed with the key's SHA-256");
    assert.ok(!verifySignature(secret, last.headers["X-VandLabs-Timestamp"], last.body.replace("inventory", "inventorx"), last.headers["X-VandLabs-Signature"]), "a tampered body fails");
    assert.ok(!verifySignature(secret, String(Number(last.headers["X-VandLabs-Timestamp"]) - 600), last.body, last.headers["X-VandLabs-Signature"]), "an old timestamp fails (replay)");
    assert.ok(!verifySignature("other", last.headers["X-VandLabs-Timestamp"], last.body, last.headers["X-VandLabs-Signature"]), "another website's secret fails");

    // After disconnecting, queued events are dropped rather than sent.
    await s.admin.query("INSERT INTO intelligence_webhook_outbox (tenant_id, key_id, event_type, payload) VALUES ($1, $2, 'inventory.changed', '{}')", [s.a.tenantId, s.callerA.keyId]);
    assert.ok((await disconnectWebsite({ email: "owner@alpha.example", password: PASSWORD, key: s.keyA })).ok);
    const sentBefore = seen.length;
    assert.deepEqual(await deliverWebhooks(s.a.tenantId, 20, fetcher), { attempted: 1, delivered: 0 });
    assert.equal(seen.length, sentBefore, "nothing is sent to a disconnected website");
  } finally { await s.h.close(); }
});

test("websiteChanges ignores internal edits and names public ones", () => {
  const base = { id: "V-1", branchId: "b", make: "Hyundai", model: "Creta", variant: "SX", year: 2022, fuel: "Petrol", transmission: "Automatic", km: 1, owners: 1, registration: "", status: "available", acquiredAt: "", asking: 100, costs: {}, costComplete: true, hasImages: true, enquiries14d: 0, cohortMedianEnquiries: 0, version: 1, channels: ["Owned site"], documents: [] } as unknown as Vehicle;
  assert.deepEqual(websiteChanges(base, { ...base, costs: { acquisition: 5 } as never, version: 2 }), []);
  assert.deepEqual(websiteChanges(base, { ...base, asking: 90 }), ["price"]);
  assert.deepEqual(websiteChanges(base, { ...base, status: "sold" }), ["unpublished", "sold"]);
  assert.deepEqual(websiteChanges({ ...base, channels: [] }, base), ["published"]);
  assert.deepEqual(websiteChanges({ ...base, channels: [] }, { ...base, channels: [], asking: 1 }), [], "a car not on the website does not concern it");
});

test("analytics: cookieless events, deduplicated, unknown cars ignored, enquiries counted from real enquiries only", async () => {
  const s = await setup();
  try {
    assert.equal(parseEvents({ events: [{ type: "visit", sid: "short" }, { type: "lead", sid: "sid-aaaaaaaaaaaaaaaa" }, { type: "vehicle_view", sid: "sid-aaaaaaaaaaaaaaaa" }] }).length, 0);
    const events = [
      { type: "visit", sid: "sid-aaaaaaaaaaaaaaaa", source: "google", device: "mobile" },
      { type: "visit", sid: "sid-aaaaaaaaaaaaaaaa", source: "google", device: "mobile" },
      { type: "visit", sid: "sid-bbbbbbbbbbbbbbbb", device: "desktop", campaign: "diwali" },
      { type: "vehicle_view", sid: "sid-aaaaaaaaaaaaaaaa", stockId: s.carA },
      { type: "vehicle_view", sid: "sid-aaaaaaaaaaaaaaaa", stockId: "FAKE-1" },
      { type: "vehicle_view", sid: "sid-aaaaaaaaaaaaaaaa", stockId: s.carB },
      { type: "whatsapp_click", sid: "sid-aaaaaaaaaaaaaaaa", stockId: s.carA },
    ];
    const res = await eventsRoute(req("/api/v1/website/events", s.keyA, { events }));
    assert.equal(res.status, 202);
    assert.equal(((await res.json()) as { counted: number }).counted, 4);
    assert.equal(await recordEvents(s.a.tenantId, parseEvents({ events })), 0, "replayed batch counts nothing");
    const report0 = await websitePerformance(s.a.tenantId, 30);
    assert.equal(report0.totals.visits, 2);
    assert.equal(report0.totals.vehicleViews, 1);
    assert.equal(report0.totals.whatsappClicks, 1);
    assert.equal(report0.totals.enquiries, 0, "a WhatsApp click is not an enquiry");
    assert.deepEqual(report0.topVehicles.map((v) => v.stockId), [s.carA.toUpperCase()]);
    assert.deepEqual(report0.sources.map((x) => x.source).sort(), ["direct", "google"]);
    assert.equal(report0.connected[0].site, "alpha.example");

    const r = await enquiriesRoute(req("/api/v1/website/enquiries", s.keyA, enquiry({ stockId: s.carA }), { "idempotency-key": "idem-an-000001" }));
    assert.equal(r.status, 201);
    const report = await websitePerformance(s.a.tenantId, 30);
    assert.equal(report.totals.enquiries, 1);
    assert.equal(report.totals.conversionRate, 50);
    assert.equal(report.topVehicles[0].enquiries, 1);
    assert.ok(!JSON.stringify(report).includes("98470"), "no contact details in the report");
    assert.equal((await s.admin.query("SELECT count(*)::int AS n FROM intelligence_website_metrics WHERE dimension LIKE '%sid%'")).rows[0].n, 0);
  } finally { await s.h.close(); }
});
