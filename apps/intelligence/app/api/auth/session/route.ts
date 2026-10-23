import { json, problem } from "@/lib/api";
import { getPrincipal } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Sign in to continue.");
  const { session } = current;
  return json({ user: { sub: session.sub, name: session.name, email: session.email, role: session.role, branchIds: session.branchIds }, expires_at: new Date(session.exp * 1000).toISOString() });
}
