/**
 * What a Google confirmation window reports, and what the opening page tells the person. Plain constants (no "use client"), so the
 * server confirmation page and the client dialog share one set of words.
 */
export const STEP_UP_RESULTS = ["ok", "failed", "setup_required", "signed_out", "unavailable"] as const;
export type StepUpResult = (typeof STEP_UP_RESULTS)[number];

export const STEP_UP_MESSAGES: Record<StepUpResult, string> = {
  ok: "Confirmed. You can close this window and continue.",
  failed: "Google could not verify a recent sign-in for this account. Close this window and try again with the Google account you used to sign in.",
  setup_required: "Google did not report when this account last signed in, so a fresh sign-in cannot be confirmed. An owner of the Google Cloud project must turn on “Session age claims” for the VandLabs OAuth app (Google Auth Platform → Settings → Advanced Settings). Then try again.",
  signed_out: "Your session has ended. Sign in again.",
  unavailable: "Confirmation is not available right now. Try again in a moment.",
};

export const isStepUpResult = (value: unknown): value is StepUpResult => (STEP_UP_RESULTS as readonly unknown[]).includes(value);
