import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiquidGlassLab } from "@/components/liquid-glass/lab";

export const metadata: Metadata = { title: "Liquid glass lab", robots: { index: false, follow: false } };

/**
 * Development prototype for the WebGL liquid glass material. It is not part of the product: production builds return 404
 * unless LIQUID_GLASS_LAB=1 is set for a local performance check (`next build && LIQUID_GLASS_LAB=1 next start`).
 */
export default function LiquidGlassLabPage() {
  if (process.env.NODE_ENV === "production" && process.env.LIQUID_GLASS_LAB !== "1") notFound();
  return <LiquidGlassLab />;
}
