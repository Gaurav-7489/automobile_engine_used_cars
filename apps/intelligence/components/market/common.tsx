"use client";

import { useEffect, useRef, useState } from "react";
import { withBase } from "@/lib/base-path";
import type { EvidenceTier } from "@/lib/domain";
import { differenceLabel } from "@/lib/evidence";
import { formatPercent, MISSING } from "@/lib/format";
import type { ListingRow } from "@/lib/market";
import { Badge } from "../ui";

export function EvidenceBadge({ tier }: { tier: EvidenceTier }) {
  return <Badge tone={tier === "Insufficient" ? "warn" : "accent"}>{tier === "Insufficient" ? "Insufficient evidence" : `${tier} evidence`}</Badge>;
}

/** Difference is signed text plus a label: never colour alone. Unknown is stated, never zero. */
export function DifferenceCell({ value }: { value: number | null }) {
  if (value === null) return <span className="muted" title="No usable estimate: the cohort is too small or too stale.">Unknown</span>;
  const rounded = Math.round(value * 10) / 10;
  return <span className={rounded < 0 ? "tone-accent" : ""} title={differenceLabel(value)}>{formatPercent(rounded, { signed: true })}</span>;
}

export type MarketResponse = { data: { listings: ListingRow[]; total: number; next_cursor: number | null; rule_version: string }; snapshot_id: string; computed_at: string; source_observed_at: string };

/** Listing search: cancels obsolete requests when the query changes, retains the previous page label while loading, and retries the same query. */
export function useListings(queryString: string, enabled: boolean) {
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; data: MarketResponse | null; error?: string }>({ status: "loading", data: null });
  const [attempt, setAttempt] = useState(0);
  const lastGood = useRef<MarketResponse | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setState((s) => ({ ...s, status: "loading" }));
    fetch(withBase(`/api/market/listings?${queryString}`),{ signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) { window.location.href = withBase(`/login?returnTo=${encodeURIComponent(window.location.pathname.replace(/^\/intelligence(?=\/)/, "") + window.location.search)}&reason=expired`); return; }
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error?.message ?? "The market feed did not respond.");
        lastGood.current = body;
        setState({ status: "ready", data: body });
      })
      .catch((error) => { if ((error as Error).name !== "AbortError") setState({ status: "error", data: lastGood.current, error: (error as Error).message }); });
    return () => controller.abort();
  }, [queryString, enabled, attempt]);
  return { ...state, retry: () => setAttempt((a) => a + 1) };
}

export const listingTitle = (l: Pick<ListingRow, "make" | "model" | "variant">) => `${l.make} ${l.model}`;
export const missing = MISSING;
