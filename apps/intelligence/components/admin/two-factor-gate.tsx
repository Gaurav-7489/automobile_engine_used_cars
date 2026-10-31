"use client";
import { useRouter } from "next/navigation";
import { TwoFactor } from "../settings/two-factor";

/** Set up two-factor login right here; the console opens as soon as it is on. */
export function AdminTwoFactorGate() {
  const router = useRouter();
  return <div className="card"><TwoFactor onEnabled={() => router.refresh()} /></div>;
}
