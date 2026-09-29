"use client";

import { useEffect } from "react";
import { recordJourneyEvent } from "../lib/attribution";

export function VehicleViewEvent({ vehicleId }: { vehicleId: string }) {
  useEffect(() => {
    void recordJourneyEvent("vehicle_view", { vehicleId });
  }, [vehicleId]);
  return null;
}
