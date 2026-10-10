import Link from "next/link";
import { tenantConfig } from "../../lib/config";
import { dealershipService } from "../../lib/services";
import { InventoryBrowser } from "../../components/inventory-browser";

export const metadata = { title: "Inventory", description: "Discover your next drive with shareable filters, a personal shortlist and side-by-side comparison." };
export default async function Page() {
  const vehicles = await dealershipService.inventory();
  const available = vehicles.filter(v => v.availabilityStatus === "available").length;
  return <main className="shell section connected-page">
    <div className="page-intro" data-reveal><div><p className="eyebrow">The collection · {available} available</p><h1 className="page-title">Available now.</h1><p className="lede">Different cars. One feeling.<br />Find the drive that fits your life.</p></div><div className="intro-side"><span className="orbit-mark" aria-hidden="true">↗</span><p>Explore. Shortlist. Compare.<br />Your next chapter starts here.</p><Link href="/compare" className="rolling-link">Open your comparison ↗</Link></div></div>
    <InventoryBrowser vehicles={vehicles} locationNames={Object.fromEntries(tenantConfig.organization.dealerships.flatMap(d => d.locations).map(l => [l.id, l.name]))} />
  </main>;
}
