import type { Metadata } from "next";
import { DiscoverExperience } from "../../components/discover/discover-experience";
import { discoveryPage, editorialMedia, turnsFrom } from "../../lib/discovery";
import { tenantConfig } from "../../lib/config";
import { pageMetadata } from "../../lib/seo";

type Props = { searchParams: Promise<{ q?: string | string[]; v?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const base = pageMetadata("Discover Used Cars with AI Search", "Describe the car you need in your own words. Browse matching cars one at a time, see why each one fits, and contact the dealer.", "/discover");
  // Individual searches are personal and unbounded, so only the canonical page is indexable.
  return turnsFrom((await searchParams).q).length ? { ...base, robots: { index: false, follow: true } } : base;
}

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  const turns = turnsFrom(params.q);
  const page = await discoveryPage(turns);
  return <main className="discover-main">
    <DiscoverExperience key={turns.join("\n")} page={page} turns={turns} initialVehicle={typeof params.v === "string" ? params.v.slice(0, 160) : undefined}
      editorial={editorialMedia()} whatsapp={tenantConfig.contact.whatsapp} />
  </main>;
}
