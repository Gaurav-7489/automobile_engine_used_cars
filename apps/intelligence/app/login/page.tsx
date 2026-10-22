import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginExperience } from "@/components/login/login-experience";
import { configuredProviders, demoModeEnabled, directory } from "@/lib/auth-users";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const demo = demoModeEnabled();
  return (
    <Suspense fallback={null}>
      <LoginExperience providers={configuredProviders()} demoAccounts={demo ? directory().map((u) => ({ email: u.email, role: u.role, mfa: u.mfa })) : []} />
    </Suspense>
  );
}
