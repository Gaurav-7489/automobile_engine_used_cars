import { json, problem } from "@/lib/api";
import { getPrincipal } from "@/lib/server/auth";
import { redactFor } from "@/lib/server/redact";
import { loadWorkspace } from "@/lib/server/workspace";

export const dynamic = "force-dynamic";

export async function GET() {
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Sign in to continue.");
  try {
    const state = redactFor(await loadWorkspace(current.principal), current.session);
    return json({ state, as_of: new Date().toISOString() });
  } catch (error) {
    console.error(JSON.stringify({ event: "workspace_load_failure", message: error instanceof Error ? error.message : "unknown" }));
    return problem(503, "unavailable", "Your workspace could not be loaded. Try again in a moment.");
  }
}
