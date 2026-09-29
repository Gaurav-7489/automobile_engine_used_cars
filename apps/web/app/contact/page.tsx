import { LeadForm } from "../../components/lead-form";
import { activeDealership, tenantConfig } from "../../lib/config";

export const metadata = {
  title: "Contact",
  description:
    "Ask about a vehicle, finance interest, exchange interest or a test drive.",
};

export default function Page() {
  return (
    <main className="shell section">
      <div className="contact-layout">
        <div>
          <p className="eyebrow">Human handoff is first-class</p>
          <h1 className="page-title">Start with what you need.</h1>
          <p className="lede">
            Ask about availability, finance interest, exchange interest or a
            test drive. No account required.
          </p>
          <div className="contact-cards">
            <a href={"tel:" + tenantConfig.contact.phone}>
              <span>Call</span>
              <strong>{tenantConfig.contact.phone}</strong>
            </a>
            <a
              href={
                "https://wa.me/" +
                tenantConfig.contact.whatsapp.replace(/[^0-9]/g, "")
              }
            >
              <span>WhatsApp</span>
              <strong>Open conversation</strong>
            </a>
            {activeDealership.locations.map((location) => (
              <div key={location.id}>
                <span>{location.city}</span>
                <strong>{location.name}</strong>
              </div>
            ))}
          </div>
        </div>
        <section className="form-panel">
          <p className="eyebrow">Structured enquiry</p>
          <h2>Give the sales team the right context.</h2>
          <LeadForm />
        </section>
      </div>
    </main>
  );
}
