import type { Metadata } from "next";
import { DesktopAuthorize } from "@/components/login/desktop-authorize";

export const metadata: Metadata = { title: "Connect desktop application" };

export default function Page() {
  return <DesktopAuthorize />;
}
