import Link from "next/link";
import type { Vehicle } from "@vandlabs/contracts";
import { CarImage } from "./car-image";
import { km, money, sampleLocation } from "@/lib/showroom";

export function ShowroomCard({ vehicle }: { vehicle: Vehicle }) {
  const image = vehicle.media[0];
  return (
    <Link href={`/showroom/vehicles/${vehicle.slug}`} className="sr-card" data-lift>
      <div className="sr-card-media">
        <CarImage src={image?.url} alt="" />
        <span className={`sr-badge sr-${vehicle.availabilityStatus}`}>{vehicle.availabilityStatus}</span>
      </div>
      <div className="sr-card-body">
        <span className="meta">{vehicle.year} / {km(vehicle.mileage)} / {sampleLocation(vehicle.locationId)}</span>
        <h3>{vehicle.make} {vehicle.model}</h3>
        <p className="meta">{vehicle.variant}</p>
        <strong>{money(vehicle.price)}</strong>
      </div>
    </Link>
  );
}
