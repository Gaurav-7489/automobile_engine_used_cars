import { json, readJson } from "@/lib/api";
import { clientKey, hit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Recovery always shows the same neutral confirmation, whether or not the account exists. */
export async function POST(request: Request) {
  const limit = hit(`forgot:${clientKey(request)}`, 5, 15 * 60_000);
  await readJson(request);
  if (!limit.allowed) return json({ ok: true, message: "If that address belongs to a workspace, a reset link is on its way." }, { status: 202 });
  return json({ ok: true, message: "If that address belongs to a workspace, a reset link is on its way." }, { status: 202 });
}
