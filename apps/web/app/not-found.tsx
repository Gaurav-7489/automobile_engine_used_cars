import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell section">
      <p className="eyebrow">404 · unavailable</p>
      <h1 className="page-title">That vehicle isn&apos;t available.</h1>
      <p className="lede">
        It may have been removed, unpublished, or the address may be incorrect.
      </p>
      <Link className="button primary" href="/inventory">
        Browse current inventory
      </Link>
    </main>
  );
}
