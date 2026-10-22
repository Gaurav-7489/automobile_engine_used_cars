import { currentSession, envelope, json, problem, scopeFromRequest } from "@/lib/api";
import { alertCounts, alertsFor, overviewModel } from "@/lib/selectors";

export const dynamic = "force-dynamic";

/** Aggregate endpoint for the Command Centre: per-tenant and per-branch, never fetched wholesale and filtered in the browser. */
export async function GET(request: Request) {
  const session = await currentSession();
  if (!session) return problem(401, "unauthenticated", "Sign in to continue.");
  const scoped = scopeFromRequest(session, new URL(request.url));
  if (!scoped) return problem(404, "not_found", "Record not found.");
  const model = overviewModel(scoped.state, scoped.scope.ids);
  return json(envelope(session, scoped.scope.value, { kpis: model.metrics, movement: model.movement, alerts: alertCounts(alertsFor(scoped.state, scoped.scope.ids)) }));
}
