"use client";
import { useState } from "react";
import { VehicleArt } from "../vehicle-art";

/** Sample photo with a labelled schematic when the image cannot load. */
export function CarImage({ src, alt }: { src?: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <VehicleArt label="Schematic vehicle image" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}
