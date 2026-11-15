import { json, problem, rateLimited, readJson } from "@/lib/api";
import { adminApi } from "@/lib/server/admin-gate";
import { createWorkspaceForGoogle, listWorkspaces, validateWorkspace, type NewWorkspace } from "@/lib/server/platform-admin";
import { appOrigin } from "@/lib/server/google-oauth";
import { hitShared } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await adminApi(null);
  if (gate.error) return gate.error;
  return json({ workspaces: await listWorkspaces(gate.access.userId) });
}

export async function POST(request: Request) {
  const gate = await adminApi(request, { reauth: true });
  if (gate.error) return gate.error;
  const limit = await hitShared(`admin-provision:${gate.access.userId}`, 20, 60 * 60_000);
  if (!limit.allowed) return rateLimited("Too many workspaces created in the last hour.", limit.retryAfter);
  const body = (await readJson<Partial<NewWorkspace>>(request)) ?? {};
  const fields = validateWorkspace(body);
  if (Object.keys(fields).length) return problem(422, "invalid", "Fix the highlighted fields.", { fields });
  // The owner signs in with this Google account; no link, password or email is involved.
  const result = await createWorkspaceForGoogle(gate.access.userId, body as NewWorkspace);
  if (!result.ok) return problem(409, "conflict", "A business with this name already exists. Nothing was changed.", { fields: { organization: "This business name is already registered." } });
  return json({ tenantId: result.tenantId, ownerEmail: String(body.ownerEmail).trim().toLowerCase(), signInUrl: `${appOrigin(request)}/login` }, { status: 201 });
}
