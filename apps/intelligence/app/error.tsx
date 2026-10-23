"use client";

import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // The digest links this report to the server log entry without exposing details to the page.
    console.error(JSON.stringify({ event: "client_render_failure", digest: error.digest ?? null }));
  }, [error]);
  return (
    <main className="login-form-wrap" id="content" tabIndex={-1}>
      <div className="login-form">
        <h1 className="h1">Something went wrong</h1>
        <p className="muted">The page could not be shown. Nothing was changed. {error.digest ? `Reference: ${error.digest}.` : ""}</p>
        <button type="button" className="btn btn-primary" onClick={reset}>Try again</button>
      </div>
    </main>
  );
}
