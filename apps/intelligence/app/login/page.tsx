import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginExperience } from "@/components/login/login-experience";
import { googleConfigured } from "@/lib/server/google-oauth";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  // A provider is offered only when its credentials are configured for this deployment.
  return (
    <Suspense fallback={null}>
      <LoginExperience providers={googleConfigured() ? [{ id: "google", label: "Continue with Google" }] : []} />
    </Suspense>
  );
}
