import { json } from "@/lib/api";
import { adminApi } from "@/lib/server/admin-gate";
import { listAccessRequests } from "@/lib/server/access-requests";

export const dynamic = "force-dynamic";

/** Access requests from Google accounts without access (`?status=pending|approved|declined`, default pending). */
export async function GET(request: Request) {
  const gate = await adminApi(null);
  if (gate.error) return gate.error;
  const s = new URL(request.url).searchParams.get("status");
  const status = s === "approved" || s === "declined" || s === "all" ? (s === "all" ? null : s) : "pending";
  return json({ requests: await listAccessRequests(gate.access.userId, status) });
}
