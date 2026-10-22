import type { Metadata } from "next";
import { SettingsPage } from "@/components/settings/settings-page";

export const metadata: Metadata = { title: "Settings" };

export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return <SettingsPage section={section} />;
}
