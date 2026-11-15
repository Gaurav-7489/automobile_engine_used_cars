import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginExperience } from "@/components/login/login-experience";
import { googleConfigured } from "@/lib/server/google-oauth";
import { legacyPasswordLogin } from "@/lib/server/legacy-auth";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ legacy?: string }> }) {
  // Password sign-in exists only for the migration window, and only when asked for explicitly.
  const legacy = legacyPasswordLogin() && (await searchParams).legacy === "1";
  // A provider is offered only when its credentials are configured for this deployment.
  return (
    <Suspense fallback={null}>
      <LoginExperience providers={googleConfigured() ? [{ id: "google", label: "Continue with Google" }] : []} legacy={legacy} />
    </Suspense>
  );
}
