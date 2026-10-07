import { tenantConfig } from "../../lib/config";
import { dealershipService } from "../../lib/services";
import { InventoryBrowser } from "../../components/inventory-browser";

export const metadata = {
  title: "Inventory",
  description:
    "Browse verified premium pre-owned vehicles with structured search, filters and compare.",
};

export default async function Page() {
  const vehicles = await dealershipService.inventory();

  return (
    <main className="shell section">
      <p className="eyebrow">Vehicle Inventory Hub · {vehicles.length} published</p>
      <h1 className="page-title">Available now.</h1>
      <p className="lede">
        Search by the facts that matter. The list below comes from the canonical
        VandLabs vehicle model for this dealership.
      </p>
      <InventoryBrowser vehicles={vehicles} locationNames={Object.fromEntries(tenantConfig.organization.dealerships.flatMap(d=>d.locations).map(l=>[l.id,l.name]))} />
    </main>
  );
}
