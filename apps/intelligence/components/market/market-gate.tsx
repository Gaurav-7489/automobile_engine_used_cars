"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState, PageHead } from "../ui";
import { useScopedHref, useWorkspace } from "../workspace";

/**
 * Market Radar, regional comparison and valuations need a licensed market-data feed. Until one is connected the
 * pages say so and show no listings, prices or estimates at all.
 */
export function MarketGate({ title, children }: { title: string; children: ReactNode }) {
  const { state, can } = useWorkspace();
  const href = useScopedHref();
  const feed = state.integrations.find((i) => i.id === "feed-a");
  if (!state.live || feed?.state === "Connected") return <>{children}</>;
  return (
    <div className="page">
      <PageHead title={title} lead="Asking-price evidence from licensed market data." />
      <EmptyState title="Setup required: market data is not connected" actions={can("settings.view") ? <Link className="btn btn-primary" href={href("/app/settings/integrations")}>View integrations</Link> : undefined}>
        This page compares your stock with listings from a licensed market-data provider. No provider is connected for this workspace, so there are no listings, price comparisons or valuations to show. Nothing here is estimated or simulated. Pricing and Capital keep working from your own records.
      </EmptyState>
    </div>
  );
}
