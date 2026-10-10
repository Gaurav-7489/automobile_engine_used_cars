import { dealershipService } from "../../lib/services";
import { tenantConfig } from "../../lib/config";
import { CompareWorkspace } from "../../components/compare-workspace";

export const metadata = { title: "Compare", description: "Build, edit and share a comparison of up to three vehicles, then take your shortlist into a conversation." };
export default async function Page() {
  const inventory = await dealershipService.inventory();
  const vehicles = inventory.map(({ id, slug, make, model, variant, year, price, mileage, fuelType, transmission, ownership, condition, locationId, availabilityStatus, bodyType, features, media }) => ({ id, slug, make, model, variant, year, price, mileage, fuelType, transmission, ownership, condition, locationId, availabilityStatus, bodyType, features, media: media.slice(0, 1) }));
  return <main className="shell section connected-page"><div className="page-intro" data-reveal><div><p className="eyebrow">Your comparison workspace</p><h1 className="page-title">Make the differences obvious.</h1><p className="lede">Three possibilities.<br />One decision that feels like you.</p></div><div className="intro-side"><span className="orbit-mark" aria-hidden="true">⇄</span><p>The prices, specifications and features.<br />Together. Clearly.</p></div></div><CompareWorkspace vehicles={vehicles} locations={Object.fromEntries(tenantConfig.organization.dealerships.flatMap(d => d.locations).map(l => [l.id, l.name]))} /></main>;
}
