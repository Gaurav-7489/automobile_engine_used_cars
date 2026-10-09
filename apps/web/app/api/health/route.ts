import { dataMode } from "@vandlabs/data";
import { NextResponse } from "next/server";
import { isReadOnlyPreview } from "../../../lib/hosting";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "vandlabs-automobile-engine-bff",
    version: "ecosystem-runtime",
    operationalWrites: !isReadOnlyPreview(),
    readiness: "liveness-only; database connectivity is checked by the protected staff readiness APIs",
    persistence: dataMode() === "aurora" ? "postgresql" : "demo-adapter",
  });
}
