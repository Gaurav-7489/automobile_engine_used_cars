import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Contact" };

export default function Contact() {
  return (
    <section className="sr-section">
      <h1>Contact</h1>
      <p>This showroom is a sample catalogue and does not take enquiries or test-drive requests. Real enquiries are handled by each dealership inside its private workspace.</p>
      <div className="sr-actions">
        <Link href="/login" className="btn btn-primary">Dealer sign in</Link>
        <Link href="/info/support" className="btn">Platform support</Link>
      </div>
    </section>
  );
}
