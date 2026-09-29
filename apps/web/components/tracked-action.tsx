"use client";

import type { ReactNode } from "react";
import { recordJourneyEvent } from "../lib/attribution";

export function TrackedAction({
  href,
  eventType,
  vehicleId,
  className,
  children,
}: {
  href: string;
  eventType: "whatsapp_click" | "call_click";
  vehicleId?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={() => {
        void recordJourneyEvent(eventType, { vehicleId });
      }}
    >
      {children}
    </a>
  );
}
