import { json, problem } from "@/lib/api";
import { can } from "@/lib/permissions";
import { getPrincipal } from "@/lib/server/auth";
import { blobConfigured, putPublicBlob } from "@/lib/server/blob";
import { sameOrigin } from "@/lib/server/csrf";
import { tenantTx } from "@/lib/server/db";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PHOTOS = 20;

/** Content is identified from its first bytes, never from the file name or the browser's claim. */
function sniff(bytes: Uint8Array): { type: string; ext: string } | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { type: "image/png", ext: "png" };
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return { type: "image/webp", ext: "webp" };
  return null;
}

type Row = Record<string, unknown>;

async function vehicleFor(tenantId: string, stockId: string, locationIds: string[]) {
  return tenantTx(tenantId, async (c) => {
    const row = (await c.query("SELECT id, location_id, payload FROM vehicles WHERE tenant_id=$1 AND stock_id=$2", [tenantId, stockId])).rows[0] as Row | undefined;
    return row && locationIds.includes(String(row.location_id)) ? row : null;
  });
}

/** Adds or removes photos on the shared vehicle record, which the owned website also reads. */
async function setMedia(tenantId: string, stockId: string, change: (media: Row[]) => Row[]) {
  return tenantTx(tenantId, async (c) => {
    const row = (await c.query("SELECT id, payload FROM vehicles WHERE tenant_id=$1 AND stock_id=$2 FOR UPDATE", [tenantId, stockId])).rows[0] as Row | undefined;
    if (!row) return null;
    const payload = row.payload as Row;
    const media = change(Array.isArray(payload.media) ? (payload.media as Row[]) : []);
    const stamp = new Date().toISOString();
    const version = Number(payload.version ?? 0) + 1;
    await c.query("UPDATE vehicles SET payload = payload || $3::jsonb, updated_at = $4 WHERE tenant_id=$1 AND id=$2", [tenantId, row.id, JSON.stringify({ media, version, updatedAt: stamp }), stamp]);
    // Keep the Intelligence record's photo flag in step. Its version is left alone so an open edit form does not conflict.
    await c.query(`UPDATE intelligence_documents SET payload = payload || jsonb_build_object('hasImages', $4::boolean), updated_at = $5
      WHERE tenant_id=$1 AND collection=$2 AND id=$3`, [tenantId, "vehicles", stockId, media.length > 0, stamp]);
    return media;
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Sign in to continue.");
  if (!can(current.principal.role, "inventory.edit")) return problem(403, "forbidden", "Your role cannot change vehicle photos.");
  if (!blobConfigured()) return problem(503, "not_configured", "Photo storage is not connected for this workspace.");
  const { id } = await context.params;
  const vehicle = await vehicleFor(current.principal.tenantId, id, current.principal.locationIds);
  if (!vehicle) return problem(404, "not_found", "Record not found.");
  const existing = Array.isArray((vehicle.payload as Row).media) ? ((vehicle.payload as Row).media as Row[]).length : 0;
  const form = await request.formData().catch(() => null);
  const files = (form?.getAll("photos") ?? []).filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
  if (!files.length) return problem(422, "invalid", "Choose at least one photo.");
  if (existing + files.length > MAX_PHOTOS) return problem(422, "invalid", `A vehicle can hold up to ${MAX_PHOTOS} photos.`);
  const added: Row[] = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) return problem(422, "invalid", `${file.name} is larger than 8 MB.`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = sniff(bytes);
    if (!kind) return problem(422, "invalid", `${file.name} is not a JPEG, PNG or WebP image.`);
    try {
      const stored = await putPublicBlob(`tenants/${current.principal.tenantId}/vehicles/${id}/photo.${kind.ext}`, bytes.buffer as ArrayBuffer, kind.type);
      added.push({ url: stored.url, alt: `${String((vehicle.payload as Row).make ?? "")} ${String((vehicle.payload as Row).model ?? "")}`.trim() || id, kind: "exterior" });
    } catch (error) {
      console.error(JSON.stringify({ event: "photo_upload_failure", message: error instanceof Error ? error.message : "unknown" }));
      return problem(502, "upload_failed", "The photo could not be stored. Nothing was changed. Try again.");
    }
  }
  const media = await setMedia(current.principal.tenantId, id, (m) => [...m, ...added]);
  return json({ ok: true, photos: (media ?? []).map((m) => String(m.url)) });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Sign in to continue.");
  if (!can(current.principal.role, "inventory.edit")) return problem(403, "forbidden", "Your role cannot change vehicle photos.");
  const { id } = await context.params;
  if (!(await vehicleFor(current.principal.tenantId, id, current.principal.locationIds))) return problem(404, "not_found", "Record not found.");
  const url = new URL(request.url).searchParams.get("url") ?? "";
  const media = await setMedia(current.principal.tenantId, id, (m) => m.filter((x) => String(x.url) !== url));
  return json({ ok: true, photos: (media ?? []).map((m) => String(m.url)) });
}
