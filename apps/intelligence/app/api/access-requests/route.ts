import { json } from "@/lib/api";
import { handlePublicForm } from "@/lib/public-forms";

export const dynamic = "force-dynamic";

/** Submission creates a pending request, never a privileged account. */
export async function POST(request: Request) {
  const result = await handlePublicForm(request, "access");
  return json(result.body, { status: result.status });
}
