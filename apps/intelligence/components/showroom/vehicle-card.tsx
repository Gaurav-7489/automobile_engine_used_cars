import Link from "next/link";
import type { ReactNode } from "react";
import type { Vehicle } from "@vandlabs/contracts";
import { CarImage } from "./car-image";
import { cap, km, money, sampleLocation } from "../../lib/showroom";

/**
 * A sample car, laid out exactly like a dealership's public car card (/l/{tenant}): photo, title, variant, price, then
 * kilometres, fuel, gearbox and city. Only non-available stock carries a badge, as on the real pages.
 */
export function ShowroomCard({ vehicle, children }: { vehicle: Vehicle; children?: ReactNode }) {
  const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  return (
    <Link href={`/showroom/vehicles/${vehicle.slug}`} className="pl-card">
      <div className="pl-card-media">
        <CarImage src={vehicle.media[0]?.url} alt={title} />
        {vehicle.availabilityStatus !== "available" ? <span className="sr-badge pl-card-badge">{vehicle.availabilityStatus}</span> : null}
      </div>
      <div className="pl-card-body">
        <strong className="pl-card-title">{title}</strong>
        {vehicle.variant ? <span className="meta">{vehicle.variant}</span> : null}
        <span className="pl-card-price">{money(vehicle.price)}</span>
        <span className="meta">{[km(vehicle.mileage), cap(vehicle.fuelType), cap(vehicle.transmission), sampleLocation(vehicle.locationId)].filter(Boolean).join(" · ")}</span>
        {children}
      </div>
    </Link>
  );
}

/** The same grid the dealership pages use. */
export function ShowroomGrid({ vehicles, extra }: { vehicles: Vehicle[]; extra?: (v: Vehicle) => ReactNode }) {
  return <ul className="pl-grid">{vehicles.map((v) => <li key={v.id}><ShowroomCard vehicle={v}>{extra?.(v)}</ShowroomCard></li>)}</ul>;
}
