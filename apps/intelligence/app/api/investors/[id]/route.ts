import { json, problem, readJson } from "@/lib/api";
import { getPrincipal } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/csrf";
import { addInvestorEntry } from "@/lib/server/finance-records";

export const dynamic = "force-dynamic";

/** Record a contribution, repayment or payout against one investor. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Sign in to continue.");
  const { id } = await params;
  if (!/^I-[0-9A-F]{8}$/.test(id)) return problem(404, "not_found", "Investor not found.");
  const body = await readJson<Record<string, unknown>>(request, 4000);
  if (!body) return problem(422, "invalid", "Send the entry details.");
  const result = await addInvestorEntry(current.principal, id, body);
  return result.ok ? json(result) : problem(result.status, result.status === 403 ? "forbidden" : "invalid", result.message, result.fields ? { fields: result.fields } : {});
}
