import { problem, readJson } from "@/lib/api";
import { businessCall, runFuel, runIngest, runRecommendations, runVehicles } from "@/lib/server/business-api";

export const dynamic = "force-dynamic";

// /api/v1/inventory and /api/v1/leads are their own routes (the dealership's own stock and leads). These are the sourcing-data resources.
export async function GET(request: Request, context: { params: Promise<{ resource: string }> }) {
  const { resource } = await context.params;
  const input = Object.fromEntries(new URL(request.url).searchParams);
  if (resource === "vehicles") return businessCall(request, "vehicles:read", input, (state, _k, now) => runVehicles(state, input, now));
  if (resource === "fuel-prices") return businessCall(request, "fuel:read", input, (state, _k, now) => runFuel(state, input, now));
  return problem(404, "not_found", "Unknown API resource.");
}

export async function POST(request: Request, context: { params: Promise<{ resource: string }> }) {
  const { resource } = await context.params;
  if (resource !== "recommendations" && resource !== "ingest") return problem(404, "not_found", "Unknown API resource.");
  const input = await readJson<Record<string, unknown>>(request, resource === "ingest" ? 2_000_000 : 10_000);
  if (!input || typeof input !== "object" || Array.isArray(input)) return problem(400, "invalid", "Send a JSON object.");
  if (resource === "recommendations") return businessCall(request, "recommendations:read", input, (state, _k, now) => runRecommendations(state, input, now));
  return businessCall(request, "sourcing:write", input, (state, key, now) => runIngest(state, key, input, now));
}
