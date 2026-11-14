import { VLUCE_DEMO_CARS, type VluceDemoCar } from "@vandlabs/demo-data/vluce";
import { tenantTx } from "./db";
import type { Principal } from "./identity";
import { runCommands } from "./workspace";

/**
 * Loads the VLuce website template's demo collection into a workspace, so a demonstration of Intelligence and a
 * demonstration of the website show the same 25 cars: same names, prices, kilometres and photos.
 *
 * Each car is added through the normal command pipeline (so stock IDs, the audit trail and the read model behave as for
 * any car a member adds), then its listing details and photos are attached and it is published to the website. Cars the
 * template marks "arriving soon" stay in preparation, unpublished. Running it again adds only what is missing.
 *
 * Sample records, not offers: costs are illustrative (90% of the asking price) and photos are stock images.
 */
export type DemoLoadResult = { added: number; skipped: number; published: number; failed: { ref: string; message: string }[] };

const today = () => new Date(Date.now() + 330 * 60_000);
const dayBefore = (days: number) => new Date(today().getTime() - days * 86_400_000).toISOString().slice(0, 10);
type Row = Record<string, unknown>;

export async function loadVluceDemoCollection(owner: Principal, cars: VluceDemoCar[] = VLUCE_DEMO_CARS): Promise<DemoLoadResult> {
  const branchId = owner.locationIds[0];
  if (!branchId) throw new Error("The workspace has no branch to hold the cars.");
  const result: DemoLoadResult = { added: 0, skipped: 0, published: 0, failed: [] };
  const present = await tenantTx(owner.tenantId, async (c) => new Set((await c.query("SELECT payload->>'demoRef' AS ref FROM vehicles WHERE tenant_id=$1 AND payload ? 'demoRef'", [owner.tenantId])).rows.map((r) => String((r as Row).ref))));

  for (const [index, car] of cars.entries()) {
    if (car.availability === "sold" || !car.price) continue;
    if (present.has(car.ref)) { result.skipped += 1; continue; }
    const acquisition = Math.round((car.price * 0.9) / 1000) * 1000;
    const added = await runCommands(owner, [{ name: "addVehicle", args: [{
      make: car.make, model: car.model, variant: car.variant, year: String(car.year), fuel: car.fuel, transmission: car.transmission, km: String(car.km), owners: String(car.owners), registration: "",
      acquiredOn: dayBefore(4 + ((index * 7) % 52)), branchId, status: "preparation", asking: String(car.price),
      costs: { acquisition: String(acquisition), transport: "0", inspection: "0", refurbishment: String(Math.round(car.price * 0.01)), fees: "0" }, photos: String(car.photos.length), acknowledged: true,
    }] }], false);
    if (!added.ok) { result.failed.push({ ref: car.ref, message: added.message }); continue; }
    const stockId = added.changes.vehicles.find((v) => v.make === car.make && v.model === car.model && v.status === "preparation")?.id;
    if (!stockId) { result.failed.push({ ref: car.ref, message: "The car was saved but its stock ID was not returned." }); continue; }
    result.added += 1;

    // Listing details and photos live on the shared vehicle record the website reads.
    const details = {
      demoRef: car.ref, bodyType: car.bodyType, exteriorColor: car.exterior, interiorColor: car.interior, description: car.description, features: car.highlights, categories: car.lifestyle, featured: car.featured,
      media: car.photos.map((url, i) => ({ id: `${car.ref}-${i + 1}`, url, kind: "image", alt: `${car.year} ${car.make} ${car.model}` })),
    };
    const specifications = { ...car.specs, registrationState: car.registrationState };
    await tenantTx(owner.tenantId, (c) => c.query(
      "UPDATE vehicles SET payload = payload || $3::jsonb || jsonb_build_object('specifications', coalesce(payload->'specifications', '{}'::jsonb) || $4::jsonb) WHERE tenant_id=$1 AND stock_id=$2",
      [owner.tenantId, stockId, JSON.stringify(details), JSON.stringify(specifications)],
    ));
    if (car.availability === "coming-soon") continue;

    const live = await runCommands(owner, [{ name: "transitionVehicle", args: [stockId, 1, { to: "available" }] }], false);
    if (!live.ok) { result.failed.push({ ref: car.ref, message: live.message }); continue; }
    if (car.availability === "reserved") {
      const held = await runCommands(owner, [{ name: "transitionVehicle", args: [stockId, 2, { to: "reserved", note: "Demo: reserved for a customer" }] }], false);
      if (!held.ok) result.failed.push({ ref: car.ref, message: held.message });
    }
    await tenantTx(owner.tenantId, (c) => c.query(
      "UPDATE vehicles SET publish_status = 'published', payload = payload || '{\"publishStatus\":\"published\"}'::jsonb WHERE tenant_id=$1 AND stock_id=$2 AND availability_status IN ('available','reserved')",
      [owner.tenantId, stockId],
    ));
    result.published += 1;
  }
  return result;
}
