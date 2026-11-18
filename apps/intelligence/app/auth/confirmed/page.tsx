import type { Metadata } from "next";
import { CloseWhenConfirmed } from "./close";
import { isStepUpResult, STEP_UP_MESSAGES, type StepUpResult } from "@/lib/step-up-copy";

export const metadata: Metadata = { title: "Confirmation", robots: { index: false, follow: false } };

/** Where the step-up window lands after Google. The opening page notices the confirmation itself; this window closes on success. */
export default async function Confirmed({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const requested = (await searchParams).result;
  const result: StepUpResult = isStepUpResult(requested) ? requested : "failed";
  return (
    <main className="page" style={{ maxWidth: 420, margin: "64px auto", textAlign: "center" }}>
      <p role="status">{STEP_UP_MESSAGES[result]}</p>
      <CloseWhenConfirmed result={result} />
    </main>
  );
}
