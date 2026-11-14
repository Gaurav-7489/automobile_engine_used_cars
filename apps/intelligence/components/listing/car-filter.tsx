"use client";

import { useState } from "react";
import { CarSelector, type CarPick } from "../car-selector";

/** Brand → Model → Variant filter for the public showroom's plain GET search form (submits as make, model and variant). */
export function CarFilter({ initial, brands }: { initial: CarPick; brands: string[] }) {
  const [car, setCar] = useState<CarPick>(initial);
  return <CarSelector mode="filter" value={car} onChange={setCar} brands={brands} names={{ make: "make", model: "model", variant: "variant" }} />;
}
