/**
 * What a Google confirmation window reports, and what the opening page tells the person. Plain constants (no "use client"), so the
 * server confirmation page and the client dialog share one set of words.
 */
export const STEP_UP_RESULTS = ["ok", "failed", "signed_out", "unavailable"] as const;
export type StepUpResult = (typeof STEP_UP_RESULTS)[number];

export const STEP_UP_MESSAGES: Record<StepUpResult, string> = {
  ok: "Confirmed with Google. You can close this window and continue.",
  failed: "Google could not confirm this change. Close this window and try again with the Google account you use for VandLabs.",
  signed_out: "Your session has ended. Sign in again.",
  unavailable: "Confirmation is not available right now. Try again in a moment.",
};

export const isStepUpResult = (value: unknown): value is StepUpResult => (STEP_UP_RESULTS as readonly unknown[]).includes(value);
