import { tenantTx } from "../db";
import type { ProviderId } from "./config";
import { aiLimits } from "./config";
import { AiError } from "./errors";

export type UsageRow = {
  tenantId: string; userId: string | null; feature: "assistant" | "customer"; provider: ProviderId; model: string;
  inputTokens: number; outputTokens: number; status: "ok" | "error"; errorKind?: string; latencyMs: number;
};

/** Records one model call. A failure to record never fails the answer; it is logged without any content. */
export async function recordUsage(row: UsageRow): Promise<void> {
  try {
    await tenantTx(row.tenantId, (c) => c.query(
      "INSERT INTO intelligence_ai_usage(tenant_id, user_id, feature, provider, model, input_tokens, output_tokens, status, error_kind, latency_ms) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [row.tenantId, row.userId, row.feature, row.provider, row.model.slice(0, 120), Math.max(0, Math.round(row.inputTokens)), Math.max(0, Math.round(row.outputTokens)), row.status, row.errorKind ?? null, Math.max(0, Math.round(row.latencyMs))],
    ));
  } catch (error) {
    console.error(JSON.stringify({ event: "ai_usage_record_failure", message: error instanceof Error ? error.name : "unknown" }));
  }
}

export type DailyUsage = { tenantCalls: number; tenantTokens: number; allCalls: number };

export async function usageToday(tenantId: string): Promise<DailyUsage> {
  const row = (await tenantTx(tenantId, (c) => c.query("SELECT * FROM intelligence_ai_usage_today($1)", [tenantId]))).rows[0] as { tenant_calls?: number; tenant_tokens?: number | string; all_calls?: number } | undefined;
  return { tenantCalls: Number(row?.tenant_calls ?? 0), tenantTokens: Number(row?.tenant_tokens ?? 0), allCalls: Number(row?.all_calls ?? 0) };
}

/**
 * Refuses a model call once a daily budget is used up: per dealership (calls and tokens) and across all dealerships (the
 * provider project's quota). If the ledger cannot be read the call goes ahead: the provider's own quota is the backstop.
 */
export async function assertBudget(tenantId: string, provider: ProviderId): Promise<void> {
  const limits = aiLimits(provider);
  if (!limits.tenantDailyCalls && !limits.tenantDailyTokens && !limits.globalDailyCalls) return;
  let today: DailyUsage;
  try { today = await usageToday(tenantId); } catch (error) {
    console.error(JSON.stringify({ event: "ai_budget_unavailable", message: error instanceof Error ? error.name : "unknown" }));
    return;
  }
  if ((limits.tenantDailyCalls && today.tenantCalls >= limits.tenantDailyCalls) || (limits.tenantDailyTokens && today.tenantTokens >= limits.tenantDailyTokens) || (limits.globalDailyCalls && today.allCalls >= limits.globalDailyCalls)) {
    throw new AiError("quota_exhausted", "Daily AI budget reached");
  }
}
