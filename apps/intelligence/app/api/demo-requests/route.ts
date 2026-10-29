import { json } from "@/lib/api";
import { sameOrigin } from "@/lib/server/csrf";
import { handlePublicForm } from "@/lib/public-forms";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: { code: "forbidden", message: "Request origin is not allowed." } }, { status: 403 });
  const result = await handlePublicForm(request, "demo");
  const retry = (result.body as { error?: { retry_after?: number } }).error?.retry_after;
  return json(result.body, { status: result.status, headers: result.status === 429 && retry ? { "Retry-After": String(retry) } : undefined });
}
