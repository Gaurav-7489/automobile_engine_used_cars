import type { Metadata } from "next";
import { ConversationsPage } from "@/components/conversations/conversations-page";

export const metadata: Metadata = { title: "Conversations" };

export default function Page() {
  return <ConversationsPage />;
}
