import type { Metadata } from "next";
import { SavedCars } from "../../components/saved-cars";
import { editorialMedia } from "../../lib/discovery";
import { pageMetadata } from "../../lib/seo";

// A personal list kept in the browser: useful to the visitor, meaningless to search engines.
export const metadata: Metadata = { ...pageMetadata("Saved Cars", "Cars you saved while browsing, ready to compare or enquire about.", "/saved"), robots: { index: false, follow: true } };

export default function Page() {
  return <main className="shell section saved-page">
    <div className="saved-intro"><p className="eyebrow">Your shortlist</p><h1 className="page-title">Saved cars</h1><p className="lede">Everything you hearted, in one place. Compare up to three, or ask the dealer about any of them.</p></div>
    <SavedCars editorial={editorialMedia()} />
  </main>;
}
