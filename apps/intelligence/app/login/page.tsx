import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginExperience } from "@/components/login/login-experience";
import { ssoProviders } from "@/lib/server/federated";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  // Single sign-on is offered only when the shared Cognito pool is configured for this app.
  return (
    <Suspense fallback={null}>
      <LoginExperience providers={ssoProviders()} />
    </Suspense>
  );
}
