import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./harness";
import { provisionWorkspace } from "../../apps/intelligence/lib/server/provision";
import { readPublicInventory } from "../../apps/intelligence/lib/server/public-listing";

test("public showroom lists only published, unsold cars, with search, filters, sorting and paging", async () => {
  const h = await harness();
  try {
    const admin = await h.admin.connect();
    const p = await provisionWorkspace(admin, { organization: "Echo", dealership: "Echo Motors", locations: [{ name: "Main", city: "Kochi", state: "Kerala", phone: "1" }, { name: "North", city: "Kozhikode", state: "Kerala", phone: "2" }], owner: { email: "o@echo.example", name: "Owner" } });
    const other = await provisionWorkspace(admin, { organization: "Foxtrot", dealership: "Foxtrot Motors", locations: [{ name: "Main", city: "Kochi", state: "Kerala", phone: "1" }], owner: { email: "o@fox.example", name: "Owner" } });
    const [main, north] = p.locationIds;
    const insert = async (tenant: string, dealership: string, location: string, stock: string, make: string, model: string, price: number, km: number, fuel: string, publish: string, availability: string) =>
      admin.query("INSERT INTO vehicles(tenant_id,dealership_id,location_id,slug,stock_id,payload,publish_status,availability_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [tenant, dealership, location, stock.toLowerCase(), stock, JSON.stringify({ make, model, variant: "X", year: 2021, price, mileage: km, fuelType: fuel, transmission: "manual", media: [{ url: `https://x.public.blob.vercel-storage.com/${stock}.jpg` }], specifications: { registration: "KL 01 SECRET" } }), publish, availability]);
    await insert(p.tenantId, p.dealershipId, main, "V-1", "Hyundai", "Creta", 1450000, 21000, "petrol", "published", "available");
    await insert(p.tenantId, p.dealershipId, north, "V-2", "Toyota", "Innova", 1800000, 50000, "diesel", "published", "reserved");
    await insert(p.tenantId, p.dealershipId, main, "V-3", "Maruti", "Swift", 550000, 40000, "petrol", "published", "available");
    await insert(p.tenantId, p.dealershipId, main, "V-4", "Kia", "Seltos", 1300000, 10000, "petrol", "draft", "available");
    await insert(p.tenantId, p.dealershipId, main, "V-5", "Honda", "City", 900000, 30000, "petrol", "published", "sold");
    await insert(other.tenantId, other.dealershipId, other.locationIds[0], "V-9", "Tata", "Nexon", 800000, 9000, "petrol", "published", "available");

    const all = await readPublicInventory(p.tenantId, {});
    assert.ok(all);
    assert.equal(all.dealer, "Echo");
    assert.deepEqual(all.cars.map((c) => c.stockId).sort(), ["V-1", "V-2", "V-3"], "drafts, sold cars and other dealerships are never shown");
    assert.deepEqual(all.makes, ["Hyundai", "Maruti", "Toyota"]);
    assert.deepEqual(all.cities, ["Kochi", "Kozhikode"]);
    assert.ok(!JSON.stringify(all).includes("SECRET"), "registration is never public");
    assert.equal(all.cars.find((c) => c.stockId === "V-2")?.availability, "reserved");

    assert.deepEqual((await readPublicInventory(p.tenantId, { sort: "price-asc" }))!.cars.map((c) => c.stockId), ["V-3", "V-1", "V-2"]);
    assert.deepEqual((await readPublicInventory(p.tenantId, { sort: "price-desc" }))!.cars.map((c) => c.stockId), ["V-2", "V-1", "V-3"]);
    assert.deepEqual((await readPublicInventory(p.tenantId, { q: "cre" }))!.cars.map((c) => c.stockId), ["V-1"]);
    assert.deepEqual((await readPublicInventory(p.tenantId, { fuel: "Diesel" }))!.cars.map((c) => c.stockId), ["V-2"]);
    assert.deepEqual((await readPublicInventory(p.tenantId, { city: "kozhikode" }))!.cars.map((c) => c.stockId), ["V-2"]);
    assert.equal((await readPublicInventory(p.tenantId, { make: "Maruti" }))!.total, 1);
    // Search text and sort values are data, never SQL.
    assert.equal((await readPublicInventory(p.tenantId, { q: "%' OR 1=1 --" }))!.total, 0);
    assert.equal((await readPublicInventory(p.tenantId, { q: "%" }))!.total, 0);
    assert.equal((await readPublicInventory(p.tenantId, { sort: "v.stock_id; DROP TABLE vehicles" }))!.total, 3);
    // Paging clamps to what exists.
    const far = await readPublicInventory(p.tenantId, { page: 99 });
    assert.equal(far!.page, 1);
    assert.equal(far!.pages, 1);
    // Unknown or malformed dealership.
    assert.equal(await readPublicInventory("00000000-0000-4000-8000-000000000000", {}), null);
    assert.equal(await readPublicInventory("not-a-uuid", {}), null);
  } finally {
    await h.close();
  }
});
