import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginExperience } from "@/components/login/login-experience";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  // Single sign-on is offered only when a provider handshake is implemented and configured; none is yet.
  return (
    <Suspense fallback={null}>
      <LoginExperience providers={[]} />
    </Suspense>
  );
}
