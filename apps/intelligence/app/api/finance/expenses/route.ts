import { json, problem, readJson } from "@/lib/api";
import { getPrincipal } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/csrf";
import { addExpense, deleteExpense } from "@/lib/server/finance-records";

export const dynamic = "force-dynamic";

/** Record an operating expense, or remove one recorded by mistake. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Sign in to continue.");
  const body = await readJson<Record<string, unknown>>(request, 4000);
  if (!body) return problem(422, "invalid", "Send the expense details.");
  if (body.action === "delete") {
    return (await deleteExpense(current.principal, String(body.id ?? ""))) ? json({ ok: true }) : problem(404, "not_found", "That expense could not be removed.");
  }
  const result = await addExpense(current.principal, { branchId: body.branchId, category: body.category, description: body.description, amount: body.amount, spentOn: body.spentOn });
  return result.ok ? json(result, { status: 201 }) : problem(result.status, result.status === 403 ? "forbidden" : "invalid", result.message, result.fields ? { fields: result.fields } : {});
}
