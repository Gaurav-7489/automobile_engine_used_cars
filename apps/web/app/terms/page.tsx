import Link from "next/link";
import { activeDealership, tenantConfig } from "../../lib/config";
import { pageMetadata } from "../../lib/seo";

export const metadata = pageMetadata("Terms of Use", "How to use VandLabs Auto: listings, prices, AI explanations, enquiries and acceptable use.", "/terms");

export default function Page() {
  const editorial = !["aurora", "neon"].includes(process.env.DATA_MODE ?? "");
  return <main className="shell section legal-page">
    <p className="eyebrow">Last updated 17 October 2026</p>
    <h1 className="page-title">Terms of use</h1>
    <p className="lede">VandLabs Auto helps you find cars listed by {activeDealership.name}. By using the site you agree to these terms.</p>
    <h2>Listings and prices</h2>
    <p>Cars, prices, specifications and availability are supplied by the dealership and can change at any time. Always confirm the price, condition, documents and availability with the dealership before you decide. No sale is made on this website.</p>
    {editorial && <p>This is a reference showroom: listings are samples and photos are editorial images that may not show the exact car.</p>}
    <h2>AI search and explanations</h2>
    <p>Search results are filtered from the dealership&apos;s published stock using the requirements you give. Explanations describe how a car meets those requirements using recorded facts only. They are guidance, not advice: they do not guarantee condition, reliability, fuel economy, safety or future value. Where something isn&apos;t recorded, we say so. An independent inspection and a test drive are recommended before buying any used car.</p>
    <h2>Enquiries and test drives</h2>
    <p>An enquiry passes your request to the dealership. A test-drive request is a request, not a confirmed booking. The dealership is responsible for its replies, offers and any sale.</p>
    <h2>Acceptable use</h2>
    <p>Please use the site for genuine car shopping. Don&apos;t scrape it, overload it with automated requests, try to access other people&apos;s information or the dealership&apos;s internal systems, or submit false enquiries. Requests may be rate limited to keep the service available.</p>
    <h2>Contact</h2>
    <p>Questions about these terms: <a href={`mailto:${tenantConfig.contact.email}`}>{tenantConfig.contact.email}</a>. Read how we handle information in our <Link href="/privacy">privacy notice</Link>.</p>
  </main>;
}
