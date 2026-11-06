import type { Metadata } from "next";
import { ShowroomHub } from "@/components/showroom/showroom-hub";

export const metadata: Metadata = { title: "Showroom" };

export default function Page() {
  return <ShowroomHub />;
}
