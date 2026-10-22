import { json } from "@/lib/api";
import { handlePublicForm } from "@/lib/public-forms";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const result = await handlePublicForm(request, "demo");
  return json(result.body, { status: result.status });
}
