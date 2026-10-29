import { commercePlans, type AcquisitionReport, type CommerceState } from "@vandlabs/contracts";
import { CommerceError, recommend, sourceCoverage, acquisitionInput } from "@vandlabs/data/commerce-rules";
import type { SqlClient } from "./db";

export { CommerceError, acquisitionInput };

/** What the acquisition page shows before anything is run: the plan, this month's use, and the approved sources with coverage. */
export type AcquisitionOverview = {
  subscription: { plan: string; status: string; expiresAt: string } | null; usage: { monthlyUsed: number; monthlyLimit: number } | null;
  sources: { id: string; name: string; kind: string; enabled: boolean; expiresAt: string; records: number; available: number; latest: string | null }[]; demo: boolean;
};

const empty = (): CommerceState => ({ subscription: null, sources: [], vehicles: [], fuel: [], keys: [], usage: {}, audit: [] });
const month = (now: Date) => `month:${now.toISOString().slice(0, 7)}`;

export async function acquisitionOverview(c: SqlClient, tenantId: string, now = new Date()): Promise<AcquisitionOverview> {
  const state = ((await c.query("SELECT payload FROM dealer_commerce WHERE tenant_id = $1", [tenantId])).rows[0]?.payload as CommerceState | undefined) ?? empty();
  const sub = state.subscription;
  const limits = sub ? commercePlans[sub.plan] : null;
  return {
    subscription: sub ? { plan: sub.plan, status: sub.status, expiresAt: sub.expiresAt } : null,
    usage: limits ? { monthlyUsed: state.usage?.[month(now)] ?? 0, monthlyLimit: limits.monthlyRequests } : null,
    sources: (state.sources ?? []).map((s) => { const cov = sourceCoverage(state, s.id, now); return { id: s.id, name: s.name, kind: s.kind, enabled: s.enabled, expiresAt: s.expiresAt, records: cov.records, available: cov.available, latest: cov.latestObservationAt }; }),
    demo: (state.sources ?? []).some((s) => s.kind === "demo"),
  };
}

/**
 * Runs the dealer acquisition planner against the approved sourcing data and counts it against the plan's allowance. The commerce record is
 * locked for the duration so concurrent runs cannot overspend the quota; the report is never stored.
 */
export async function runAcquisition(c: SqlClient, tenantId: string, input: ReturnType<typeof acquisitionInput>, now = new Date()): Promise<AcquisitionReport & { usage: { monthlyUsed: number; monthlyLimit: number } }> {
  const row = (await c.query("SELECT payload FROM dealer_commerce WHERE tenant_id = $1 FOR UPDATE", [tenantId])).rows[0] as { payload: CommerceState } | undefined;
  const state = row?.payload ?? empty();
  const sub = state.subscription;
  if (!sub || sub.status !== "active" || Date.parse(sub.expiresAt) <= now.getTime()) throw new CommerceError(402, "An active dealership subscription is required.");
  const limits = commercePlans[sub.plan];
  const report = recommend(state, input, sub.plan, false, now);
  const monthly = month(now), minuteKey = `minute:${now.toISOString().slice(0, 16)}`;
  const usage = Object.fromEntries(Object.entries(state.usage ?? {}).filter(([k]) => k === monthly || k === minuteKey)) as Record<string, number>;
  if ((usage[monthly] ?? 0) >= limits.monthlyRequests) throw new CommerceError(429, "Monthly request quota exhausted.");
  if ((usage[minuteKey] ?? 0) >= limits.perMinute) throw new CommerceError(429, "Tenant request rate exceeded.", 60 - now.getUTCSeconds());
  usage[monthly] = (usage[monthly] ?? 0) + 1;
  usage[minuteKey] = (usage[minuteKey] ?? 0) + 1;
  await c.query("UPDATE dealer_commerce SET payload = jsonb_set(payload, '{usage}', $2::jsonb), version = version + 1, updated_at = now() WHERE tenant_id = $1", [tenantId, JSON.stringify(usage)]);
  return { ...report, usage: { monthlyUsed: usage[monthly], monthlyLimit: limits.monthlyRequests } };
}
