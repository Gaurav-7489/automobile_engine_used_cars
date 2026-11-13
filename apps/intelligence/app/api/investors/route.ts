import { json, problem, readJson } from "@/lib/api";
import { getPrincipal } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/csrf";
import { listInvestors, saveInvestor } from "@/lib/server/finance-records";

export const dynamic = "force-dynamic";

export async function GET() {
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Your session has expired. Sign in again.");
  const investors = await listInvestors(current.principal);
  return investors ? json({ investors }) : problem(403, "forbidden", "Investor records are visible to owners and finance only.");
}

/** Add an investor or partner, or update one (pass its id). */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Sign in to continue.");
  const body = await readJson<Record<string, unknown>>(request, 8000);
  if (!body) return problem(422, "invalid", "Send the investor details.");
  const result = await saveInvestor(current.principal, body);
  return result.ok ? json(result) : problem(result.status, result.status === 403 ? "forbidden" : "invalid", result.message, result.fields ? { fields: result.fields } : {});
}
