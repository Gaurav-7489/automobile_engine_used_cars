import { json } from "@/lib/api";

export function GET() {
  return json({ status: "ok", service: "vandlabs-intelligence" });
}
