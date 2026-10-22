import { currentSession, json, problem, readJson } from "@/lib/api";
import { validateStep, type OnboardingDraft } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

/** Server-side validation of the current onboarding step. Activation is only possible after Review. */
export async function POST(request: Request) {
  const session = await currentSession();
  if (!session) return problem(401, "unauthenticated", "Sign in to continue.");
  const body = await readJson<{ step?: number; draft?: OnboardingDraft }>(request, 30_000);
  if (!body?.draft || typeof body.step !== "number" || body.step < 1 || body.step > 5) return problem(422, "invalid", "Send a step and a draft.");
  const fields = validateStep(body.step, body.draft);
  if (Object.keys(fields).length) return problem(422, "invalid", "Fix the highlighted fields to continue.", { fields });
  return json({ ok: true, step: body.step });
}
