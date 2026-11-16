import type { Metadata } from "next";
import { CloseWhenConfirmed } from "./close";

export const metadata: Metadata = { title: "Confirmation", robots: { index: false, follow: false } };

const TEXT: Record<string, string> = {
  ok: "Confirmed. You can close this window and continue.",
  failed: "Google could not verify a recent sign-in for this session. Close this window and try again with the account you used to sign in.",
  signed_out: "Your session has ended. Sign in again.",
  unavailable: "Confirmation is not available right now. Try again in a moment.",
};

/** Where the step-up window lands after Google. The opening page notices the confirmation itself; this window closes. */
export default async function Confirmed({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const result = (await searchParams).result ?? "failed";
  return (
    <main className="page" style={{ maxWidth: 420, margin: "64px auto", textAlign: "center" }}>
      <p role="status">{TEXT[result] ?? TEXT.failed}</p>
      <CloseWhenConfirmed ok={result === "ok"} />
    </main>
  );
}
