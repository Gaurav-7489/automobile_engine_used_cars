"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Vehicle } from "@vandlabs/contracts";
import { VehicleCard } from "./vehicle-card";

type SortMode = "recommended" | "price-low" | "price-high" | "mileage";

export function InventoryBrowser({ vehicles }: { vehicles: Vehicle[] }) {
  const [query, setQuery] = useState("");
  const [body, setBody] = useState("all");
  const [fuel, setFuel] = useState("all");
  const [sort, setSort] = useState<SortMode>("recommended");
  const [selected, setSelected] = useState<string[]>([]);

  const bodies = Array.from(new Set(vehicles.map((vehicle) => vehicle.bodyType)));
  const fuels = Array.from(new Set(vehicles.map((vehicle) => vehicle.fuelType)));

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const result = vehicles.filter((vehicle) => {
      const haystack = [
        vehicle.make,
        vehicle.model,
        vehicle.variant,
        vehicle.bodyType,
        vehicle.fuelType,
      ]
        .join(" ")
        .toLowerCase();
      return (
        (!normalized || haystack.includes(normalized)) &&
        (body === "all" || vehicle.bodyType === body) &&
        (fuel === "all" || vehicle.fuelType === fuel)
      );
    });

    return [...result].sort((a, b) => {
      if (sort === "price-low") return a.price - b.price;
      if (sort === "price-high") return b.price - a.price;
      if (sort === "mileage") return a.mileage - b.mileage;
      return Number(a.availabilityStatus !== "available") -
        Number(b.availabilityStatus !== "available");
    });
  }, [vehicles, query, body, fuel, sort]);

  const toggleCompare = (id: string) => {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 3) return current;
      return [...current, id];
    });
  };

  return (
    <>
      <div className="inventory-toolbar" aria-label="Inventory filters">
        <label className="filter-wide">
          <span>Search</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="BMW, SUV, automatic..."
          />
        </label>
        <label>
          <span>Body</span>
          <select value={body} onChange={(event) => setBody(event.target.value)}>
            <option value="all">All body types</option>
            {bodies.map((item) => (
              <option value={item} key={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Fuel</span>
          <select value={fuel} onChange={(event) => setFuel(event.target.value)}>
            <option value="all">All fuel types</option>
            {fuels.map((item) => (
              <option value={item} key={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Sort</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortMode)}
          >
            <option value="recommended">Recommended</option>
            <option value="price-low">Price: low to high</option>
            <option value="price-high">Price: high to low</option>
            <option value="mileage">Lowest mileage</option>
          </select>
        </label>
      </div>

      <div className="inventory-summary">
        <span>{filtered.length} matching vehicles</span>
        {selected.length > 0 ? (
          <Link
            className="button compact"
            href={"/compare?ids=" + selected.join(",")}
          >
            Compare {selected.length} selected
          </Link>
        ) : (
          <span>Select up to 3 cars to compare</span>
        )}
      </div>

      {filtered.length ? (
        <div className="inventory-grid">
          {filtered.map((vehicle) => (
            <div key={vehicle.id}>
              <VehicleCard vehicle={vehicle} />
              <button
                className={
                  "compare-toggle " +
                  (selected.includes(vehicle.id) ? "selected" : "")
                }
                type="button"
                onClick={() => toggleCompare(vehicle.id)}
                aria-pressed={selected.includes(vehicle.id)}
              >
                {selected.includes(vehicle.id)
                  ? "Selected for compare"
                  : "Add to compare"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <section className="empty-state" role="status">
          <p className="eyebrow">No match</p>
          <h2>Try a wider search.</h2>
          <p>
            The inventory facts are authoritative; filters never invent a vehicle
            that is not in stock.
          </p>
        </section>
      )}
    </>
  );
}
