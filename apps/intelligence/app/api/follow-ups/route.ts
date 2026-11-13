import { can } from "@/lib/permissions";
import { readRoute } from "@/lib/server/read-api";
import type { Lead } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * Today's follow-ups: open lead tasks due by the end of today (India time) or already overdue, soonest first.
 * Sales staff see their own; managers and owners see everyone's. Contact numbers only for roles that may contact customers.
 */
export async function GET(request: Request) {
  return readRoute(request, "leads.view", async ({ c, principal, role, branchIds }) => {
    const ist = new Date(Date.now() + 330 * 60_000);
    const endOfToday = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 23, 59, 59) - 330 * 60_000).toISOString();
    const mine = role === "sales" ? principal.name : null;
    const rows = (await c.query(
      `SELECT l.data, (SELECT min((t->>'dueAt')::timestamptz) FROM jsonb_array_elements(coalesce(l.data->'tasks', '[]'::jsonb)) t
                       WHERE coalesce((t->>'done')::boolean, false) = false) AS due
         FROM intelligence_lead_index l
        WHERE l.tenant_id = $1 AND l.branch_id = ANY($2::uuid[]) AND l.stage NOT IN ('Won', 'Lost') AND ($4::text IS NULL OR l.owner = $4)
          AND EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(l.data->'tasks', '[]'::jsonb)) t
                       WHERE coalesce((t->>'done')::boolean, false) = false AND (t->>'dueAt')::timestamptz <= $3::timestamptz)
        ORDER BY due ASC NULLS LAST LIMIT 12`,
      [principal.tenantId, branchIds, endOfToday, mine])).rows as { data: Lead }[];
    const contact = can(role, "leads.contact");
    return { leads: rows.map((r) => (contact ? r.data : { ...r.data, contactFull: r.data.contactMasked, email: undefined })), endOfToday, mine: Boolean(mine) };
  }, "leads");
}
