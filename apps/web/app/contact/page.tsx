import { isReadOnlyPreview } from "../../lib/hosting";
import type { LeadIntent } from "@vandlabs/contracts";
import { ContactWorkspace } from "../../components/contact-workspace";
import { TrackedAction } from "../../components/tracked-action";
import { activeDealership, tenantConfig } from "../../lib/config";
import { dealershipService } from "../../lib/services";

export const metadata = { title: "Contact", description: "Bring your shortlist into a personal conversation about a vehicle, a visit, finance or an exchange." };
export default async function Page({ searchParams }: { searchParams: Promise<{ vehicle?: string; ids?: string; intent?: string }> }) {
  const [params, inventory] = await Promise.all([searchParams, dealershipService.inventory()]);
  const vehicles = inventory.map(({ id, slug, make, model, year, price, availabilityStatus }) => ({ id, slug, make, model, year, price, availabilityStatus }));
  const context = typeof params.vehicle === "string" ? params.vehicle : typeof params.ids === "string" ? params.ids : "";
  const requestedIds = [...new Set(context.slice(0, 1000).split(",").filter(id => vehicles.some(v => v.id === id)))].slice(0, 3);
  const defaultIntent: LeadIntent = ["enquiry", "test_drive", "finance", "exchange"].includes(params.intent ?? "") ? params.intent as LeadIntent : "enquiry";
  const whatsapp = "https://wa.me/" + tenantConfig.contact.whatsapp.replace(/[^0-9]/g, "");
  return <main className="shell section connected-page">
    <div className="page-intro" data-reveal><div><p className="eyebrow">Good cars. Real conversations.</p><h1 className="page-title">Start with what you need.</h1><p className="lede">Your next car starts with a conversation.<br />Let’s make it a good one.</p></div><div className="intro-side"><span className="orbit-mark" aria-hidden="true">↗</span><p>A car you like. A question you have.<br />We’re here for both.</p></div></div>
    <ContactWorkspace vehicles={vehicles} requestedIds={requestedIds} defaultIntent={defaultIntent} />
    <section className="studio-section" data-reveal><div className="sectionhead"><div><p className="eyebrow">Closer than you think</p><h2>Meet us at the studio.</h2></div></div><div className="studio-grid">{activeDealership.locations.map(location => <article key={location.id}><span className="studio-city">{location.city}</span><p className="eyebrow">{location.state}</p><h3>{location.name}</h3><p>Contact the team to confirm a visit and vehicle availability.</p><TrackedAction href={`tel:${location.phone}`} eventType="call_click" className="rolling-link">Call this studio ↗</TrackedAction></article>)}<article className="studio-conversation"><p className="eyebrow">Prefer a conversation?</p><h3>Pick your channel.</h3><TrackedAction href={`tel:${tenantConfig.contact.phone}`} eventType="call_click" className="rolling-link">Call {tenantConfig.contact.phone} ↗</TrackedAction><TrackedAction href={whatsapp} eventType="whatsapp_click" className="rolling-link">Open WhatsApp ↗</TrackedAction>{isReadOnlyPreview() && <p className="meta">Reference contact channels are disabled in the hosted demo.</p>}</article></div></section>
    <section className="faq-section" data-reveal><p className="eyebrow">Before you ask</p><h2>A few helpful answers.</h2><div className="faq-list"><details><summary>Can I enquire about more than one car?</summary><p>Yes. Add up to three cars to your comparison and choose “Talk through the shortlist”. The form carries their names into your request and lets you choose the primary car.</p></details><details><summary>Does a test-drive request confirm a booking?</summary><p>No. The dealership confirms the car’s availability and your visit details directly. A request is a starting point.</p></details><details><summary>Can I discuss finance or an exchange?</summary><p>Choose the relevant conversation above. Finance terms, eligibility and exchange details must be confirmed by the dealership; the website does not approve an application or value a car.</p></details></div></section>
  </main>;
}
