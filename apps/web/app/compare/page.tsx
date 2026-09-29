import Link from "next/link";
import { dealershipService } from "../../lib/services";
import { locationName } from "../../lib/config";
import { money, number } from "../../lib/format";

export const metadata = {
  title: "Compare",
  description: "Compare up to three vehicles side by side.",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const params = await searchParams;
  const requested = (params.ids ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
  const ids = requested.length ? requested : ["veh-1", "veh-2", "veh-4"];
  const vehicles = await dealershipService.compare(ids);

  return (
    <main className="shell section">
      <p className="eyebrow">Compare workspace · up to 3 vehicles</p>
      <h1 className="page-title">Make the differences obvious.</h1>
      <p className="lede">
        Shareable, vehicle-record-backed comparison. No invented scores or
        AI-generated facts.
      </p>

      {vehicles.length ? (
        <div className="compare-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th scope="col">Attribute</th>
                {vehicles.map((vehicle) => (
                  <th scope="col" key={vehicle.id}>
                    <Link href={"/vehicles/" + vehicle.slug}>
                      {vehicle.make} {vehicle.model}
                    </Link>
                    <small>{vehicle.variant}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Price</th>
                {vehicles.map((vehicle) => (
                  <td key={vehicle.id}>{money(vehicle.price)}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">Year</th>
                {vehicles.map((vehicle) => (
                  <td key={vehicle.id}>{vehicle.year}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">Mileage</th>
                {vehicles.map((vehicle) => (
                  <td key={vehicle.id}>{number(vehicle.mileage)} km</td>
                ))}
              </tr>
              <tr>
                <th scope="row">Fuel</th>
                {vehicles.map((vehicle) => (
                  <td key={vehicle.id}>{vehicle.fuelType}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">Transmission</th>
                {vehicles.map((vehicle) => (
                  <td key={vehicle.id}>{vehicle.transmission}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">Ownership</th>
                {vehicles.map((vehicle) => (
                  <td key={vehicle.id}>
                    {vehicle.ownership === 1
                      ? "First owner"
                      : vehicle.ownership + " owners"}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Condition</th>
                {vehicles.map((vehicle) => (
                  <td key={vehicle.id}>{vehicle.condition}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">Location</th>
                {vehicles.map((vehicle) => (
                  <td key={vehicle.id}>{locationName(vehicle.locationId)}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">Availability</th>
                {vehicles.map((vehicle) => (
                  <td key={vehicle.id}>{vehicle.availabilityStatus}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <section className="empty-state">
          <h2>No vehicles selected.</h2>
          <Link className="button primary" href="/inventory">
            Choose vehicles
          </Link>
        </section>
      )}

      <div className="actions">
        <Link className="button" href="/inventory">
          Change selection
        </Link>
        <Link className="button primary" href="/contact">
          Talk through the shortlist
        </Link>
      </div>
    </main>
  );
}
