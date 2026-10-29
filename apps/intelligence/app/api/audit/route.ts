import { intParam, readRoute } from "@/lib/server/read-api";
import type { AuditEvent } from "@/lib/domain";

export const dynamic = "force-dynamic";

const like = (q: string) => `%${q.toLowerCase().replace(/[%_\\]/g, (m) => `\\${m}`)}%`;

/** The dealership's audit trail, newest first, searched and paged in the database. Owners only. */
export async function GET(request: Request) {
  return readRoute(request, "settings.audit", async ({ c, principal, url }) => {
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
    const size = intParam(url, "size", 50, 1, 200);
    const page = intParam(url, "page", 1, 1, 100_000);
    const values: unknown[] = [principal.tenantId];
    let where = "tenant_id = $1 AND collection = 'audit'";
    if (q) { values.push(like(q)); where += ` AND lower(coalesce(payload->>'actor', '') || ' ' || coalesce(payload->>'action', '') || ' ' || coalesce(payload->>'target', '') || ' ' || coalesce(payload->>'detail', '')) LIKE $2`; }
    values.push(size, (page - 1) * size);
    const rows = (await c.query(`SELECT payload, count(*) OVER () AS total FROM intelligence_documents WHERE ${where} ORDER BY payload->>'at' DESC, id LIMIT $${values.length - 1} OFFSET $${values.length}`, values)).rows as { payload: AuditEvent; total: string }[];
    return { events: rows.map((r) => r.payload), total: rows.length ? Number(rows[0].total) : 0, page, size };
  });
}
