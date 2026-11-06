import { test } from "node:test";
import assert from "node:assert/strict";
import { harness, runFull } from "./harness";
import { provisionWorkspace } from "../../apps/intelligence/lib/server/provision";
import { issueInvite, redeemToken, resolvePrincipal } from "../../apps/intelligence/lib/server/identity";
import { readMarketplace } from "../../apps/intelligence/lib/server/marketplace";
import { tenantTx } from "../../apps/intelligence/lib/server/db";

const secs = () => Math.floor(Date.now() / 1000);

test("the marketplace lists every dealership's published, unsold cars, public fields only, and respects opt-out", async () => {
  const h = await harness();
  try {
    const admin = await h.admin.connect();
    const echo = await provisionWorkspace(admin, { organization: "Echo Motors Pvt Ltd", dealership: "Echo Motors", locations: [{ name: "Main", city: "Kochi", state: "Kerala", phone: "1" }], owner: { email: "o@echo.example", name: "Owner" } });
    const fox = await provisionWorkspace(admin, { organization: "Foxtrot Cars", dealership: "Foxtrot", locations: [{ name: "Main", city: "Thrissur", state: "Kerala", phone: "2" }], owner: { email: "o@fox.example", name: "Owner F" } });
    const insert = async (p: typeof echo, stock: string, make: string, model: string, price: number, km: number, fuel: string, publish: string, availability: string, media = true) =>
      admin.query("INSERT INTO vehicles(tenant_id,dealership_id,location_id,slug,stock_id,payload,publish_status,availability_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [p.tenantId, p.dealershipId, p.locationIds[0], stock.toLowerCase(), stock, JSON.stringify({ make, model, variant: "SX", year: 2022, price, mileage: km, fuelType: fuel, transmission: "manual", registration: "KL 01 SECRET", media: media ? [{ url: `https://x.public.blob.vercel-storage.com/${stock}.jpg` }, { url: "http://insecure.example/x.jpg" }] : [], specifications: { registration: "KL 01 SECRET" }, costs: { acquisition: 99999999 } }), publish, availability]);
    await insert(echo, "V-1", "Hyundai", "Creta", 1450000, 21000, "petrol", "published", "available");
    await insert(echo, "V-2", "Toyota", "Innova", 1800000, 50000, "diesel", "published", "reserved", false);
    await insert(echo, "V-3", "Kia", "Seltos", 1300000, 10000, "petrol", "draft", "available");
    await insert(echo, "V-4", "Honda", "City", 900000, 30000, "petrol", "published", "sold");
    await insert(fox, "F-1", "Tata", "Nexon", 800000, 9000, "petrol", "published", "available");
    await insert(fox, "F-2", "Maruti", "Swift", 550000, 40000, "petrol", "archived", "archived");

    const all = await readMarketplace({});
    assert.deepEqual(all.cars.map((c) => c.stockId).sort(), ["F-1", "V-1", "V-2"], "drafts, sold and archived cars never appear");
    assert.equal(all.dealers, 2);
    assert.equal(all.total, 3);
    const creta = all.cars.find((c) => c.stockId === "V-1")!;
    assert.equal(creta.tenantId, echo.tenantId, "each card links back to the right dealership");
    assert.equal(creta.dealer, "Echo Motors Pvt Ltd");
    assert.equal(creta.city, "Kochi");
    assert.equal(creta.price, 1450000);
    assert.equal(creta.photo, "https://x.public.blob.vercel-storage.com/V-1.jpg", "first https photo only");
    assert.equal(all.cars.find((c) => c.stockId === "V-2")!.photo, null);
    assert.equal(all.cars.find((c) => c.stockId === "V-2")!.availability, "reserved");
    const text = JSON.stringify(all);
    assert.ok(!text.includes("SECRET") && !text.includes("99999999"), "registration and costs are never exposed");

    // Filters, sort, budget and paging.
    assert.deepEqual((await readMarketplace({ sort: "price-asc" })).cars.map((c) => c.stockId), ["F-1", "V-1", "V-2"]);
    assert.deepEqual((await readMarketplace({ q: "foxtrot" })).cars.map((c) => c.stockId), ["F-1"], "search covers the dealer name");
    assert.deepEqual((await readMarketplace({ city: "thrissur" })).cars.map((c) => c.stockId), ["F-1"]);
    assert.deepEqual((await readMarketplace({ fuel: "Diesel" })).cars.map((c) => c.stockId), ["V-2"]);
    assert.deepEqual((await readMarketplace({ maxPrice: 1000000 })).cars.map((c) => c.stockId), ["F-1"]);
    assert.equal((await readMarketplace({ page: 99 })).page, 1);
    // Text and sort values are data, never SQL.
    assert.equal((await readMarketplace({ q: "%' OR 1=1 --" })).total, 0);
    assert.equal((await readMarketplace({ q: "%" })).total, 0);
    assert.equal((await readMarketplace({ sort: "price; DROP TABLE vehicles" })).total, 3);

    // The app's own role still cannot read another dealership's rows directly: only through the narrow function.
    assert.equal((await tenantTx(fox.tenantId, (c) => c.query("SELECT 1 FROM vehicles WHERE tenant_id = $1", [echo.tenantId]))).rows.length, 0);

    // Opting out: only the owner can, it is audited, and the dealership's cars leave the marketplace at once.
    const r = await redeemToken(echo.ownerToken, "correct horse battery 7");
    assert.ok(r.ok);
    const owner = (await resolvePrincipal((r as { userId: string }).userId, echo.tenantId, secs()))!;
    const inv = await issueInvite(owner, { email: "sales@echo.example", name: "Sales", role: "sales", locationIds: echo.locationIds, dealershipIds: owner.dealershipIds });
    assert.ok(inv.ok);
    const s = await redeemToken((inv as { token: string }).token, "another horse battery 8");
    const sales = (await resolvePrincipal((s as { userId: string }).userId, echo.tenantId, secs()))!;
    assert.equal((await runFull(sales, [{ name: "setMarketplaceListing", args: [false] }])).ok, false, "sales staff cannot change it");
    const off = await runFull(owner, [{ name: "setMarketplaceListing", args: [false] }]);
    assert.ok(off.ok, JSON.stringify(off));
    assert.equal(off.state.marketplace.listed, false);
    assert.ok(off.state.audit.some((a) => a.action === "marketplace.unlisted"));
    assert.deepEqual((await readMarketplace({})).cars.map((c) => c.stockId), ["F-1"]);
    const on = await runFull(owner, [{ name: "setMarketplaceListing", args: [true] }]);
    assert.ok(on.ok);
    assert.equal((await readMarketplace({})).total, 3);
  } finally {
    await h.close();
  }
});
