import { dataMode } from "@vandlabs/data";
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "vandlabs-automobile-engine-bff",
    version: "ecosystem-runtime",
    modules: {
      experience: "ready",
      inventory: "ready",
      conversion: "ready",
      crmContract: "ready",
      attribution: "ready",
    },
    persistence: dataMode() === "aurora" ? "postgresql" : "demo-adapter",
  });
}
