import Link from "next/link";
import { activeDealership, tenantConfig } from "../../lib/config";
import { pageMetadata } from "../../lib/seo";

export const metadata = pageMetadata("Privacy", "What VandLabs Auto collects when you browse, save cars or enquire, why, and the choices you have.", "/privacy");

export default function Page() {
  return <main className="shell section legal-page">
    <p className="eyebrow">Last updated 17 October 2026</p>
    <h1 className="page-title">Privacy</h1>
    <p className="lede">This website is run by VandLabs for {activeDealership.name}, the dealership whose cars are listed here. This page describes what the site actually collects and why.</p>
    <h2>When you enquire</h2>
    <p>If you send an enquiry or test-drive request we collect your name and phone number, and optionally your email address and message, together with the car you asked about and your choices about WhatsApp contact and marketing updates. This goes to the dealership so its staff can reply. A test-drive request is not a booking until the dealership confirms it.</p>
    <p>If you leave “Share my search with the dealer” ticked, the words you searched with and the requirements we understood from them are attached to your enquiry. Untick it and they are not sent.</p>
    <h2>While you browse</h2>
    <p>The site keeps a random session identifier in your browser for the current visit and records page views, vehicle views and taps on WhatsApp or call buttons, with the page address and any campaign source. This helps the dealership understand which cars people look at. The words you type into search are not stored in that activity record; they appear in the page address so the back button and shared links work, and phone numbers or email addresses typed into search are removed automatically.</p>
    <h2>Saved and compared cars</h2>
    <p>Cars you save or add to a comparison are stored only in your browser. They are not sent to us unless you include them in an enquiry, and clearing your browser data removes them.</p>
    <h2>AI explanations</h2>
    <p>Searches are interpreted by our own rule-based software. Where AI summaries are switched on, the requirements we understood and the listed facts of the top matching cars — never your contact details — may be processed by our AI service provider to write a short explanation. AI never decides which cars you see.</p>
    <h2>Who can see your information</h2>
    <p>Your enquiry is visible to authorised staff of the dealership. Access by VandLabs staff is restricted to operating and supporting the service and is logged. Each dealership&apos;s records are kept separate from every other dealership&apos;s.</p>
    <h2>Keeping and deleting information</h2>
    <p>Enquiries are kept while the dealership needs them to handle your request and meet its legal obligations. You can ask for a copy of your information, a correction, or deletion, and you can withdraw WhatsApp or marketing consent at any time.</p>
    <h2>Contact</h2>
    <p>Write to <a href={`mailto:${tenantConfig.contact.email}`}>{tenantConfig.contact.email}</a> or call <a href={`tel:${tenantConfig.contact.phone}`}>{tenantConfig.contact.phone}</a>. You can also use the <Link href="/contact">contact page</Link>. See also our <Link href="/terms">terms</Link>.</p>
  </main>;
}
