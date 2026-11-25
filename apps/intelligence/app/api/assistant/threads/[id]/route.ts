import { json, problem } from "@/lib/api";
import { deleteThread, readThread, validThreadId } from "@/lib/server/ai/history";
import { getPrincipal } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/csrf";
import { tenantTx } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/** One of the member's own threads. Another member's thread, in this dealership or any other, is simply not found. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Your session has expired. Sign in again.");
  const { principal } = current;
  const { id } = await params;
  if (!validThreadId(id)) return problem(404, "not_found", "Conversation not found.");
  const messages = await tenantTx(principal.tenantId, (c) => readThread(c, principal.tenantId, principal.userId, id, 100));
  return messages ? json({ id, messages }) : problem(404, "not_found", "Conversation not found.");
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Your session has expired. Sign in again.");
  const { principal } = current;
  const { id } = await params;
  const removed = validThreadId(id) && await tenantTx(principal.tenantId, (c) => deleteThread(c, principal.tenantId, principal.userId, id));
  return removed ? json({ deleted: true }) : problem(404, "not_found", "Conversation not found.");
}
