import { ruleMutation } from "@/lib/server/automation-api";

export const dynamic = "force-dynamic";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  return ruleMutation(request, (await context.params).id.slice(0, 60), "save");
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return ruleMutation(request, (await context.params).id.slice(0, 60), "delete");
}
