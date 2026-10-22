import { currentSession, json, problem } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await currentSession();
  if (!session) return problem(401, "unauthenticated", "Sign in to continue.");
  return json({ user: { sub: session.sub, name: session.name, email: session.email, role: session.role, branchIds: session.branchIds }, expires_at: new Date(session.exp * 1000).toISOString() });
}
