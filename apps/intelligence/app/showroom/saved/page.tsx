import type { Metadata } from "next";
import { SavedList } from "@/components/showroom/saved-list";
import { km, money, sampleLocation, sampleVehicles } from "@/lib/showroom";

export const metadata: Metadata = { title: "Saved cars" };

export default function Saved() {
  const cars = sampleVehicles().map(v => ({ slug: v.slug, title: `${v.year} ${v.make} ${v.model}`, variant: v.variant, price: money(v.price), meta: `${km(v.mileage)} / ${sampleLocation(v.locationId)}` }));
  return <section className="sr-section"><h1>Saved cars</h1><SavedList cars={cars} /></section>;
}
