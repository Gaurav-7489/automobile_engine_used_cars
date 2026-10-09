import Link from "next/link";
import Image from "next/image";
import type { Vehicle } from "@vandlabs/contracts";
import { money, number } from "../lib/format";


export function VehicleCard({ vehicle, locationLabel = "Dealership" }: { vehicle: Vehicle; locationLabel?: string }) {
  const image = vehicle.media[0];
  return (
    <article className="vehicle-card">
      <Link href={"/vehicles/" + vehicle.slug} className="vehicle-card-link">
        <div
          className="vehicle-card-media"
        >
          {image && <Image src={image.url} alt={image.alt || vehicle.make + " " + vehicle.model} fill sizes="(max-width: 640px) 100vw, (max-width: 1050px) 50vw, 33vw" unoptimized={!image.url.startsWith("https://images.unsplash.com/")} style={{objectFit:"cover"}} />}
          <span className={"availability " + vehicle.availabilityStatus}>
            {vehicle.availabilityStatus}
          </span>
        </div>
        <div className="vehicle-card-body">
          <span className="meta">
            {vehicle.year} · {number(vehicle.mileage)} km ·{" "}
            {locationLabel}
          </span>
          <h3>
            {vehicle.make} {vehicle.model}
          </h3>
          <p>{vehicle.variant}</p>
          <div className="vehicle-card-foot">
            <strong className="price">{money(vehicle.price)}</strong>
            <span>View vehicle →</span>
          </div>
        </div>
      </Link>
    </article>
  );
}
