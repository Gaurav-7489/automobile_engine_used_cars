import { Skeleton } from "@/components/ui";

/** Shaped like the Overview: greeting, four figures, follow-ups beside needs-attention. Nothing moves when it arrives. */
export default function Loading() {
  return (
    <div className="page" role="status" aria-busy="true" aria-label="Loading Overview">
      <div className="ov-hero"><div className="stack-sm"><Skeleton h={34} w={300} /><Skeleton h={16} w={220} /></div></div>
      <div className="kpi-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="kpi" style={{ padding: 20 }}><Skeleton h={14} w="55%" /><div style={{ height: 14 }} /><Skeleton h={30} w="40%" /></div>)}</div>
      <div className="ov-split">{[0, 1].map((i) => <div key={i} className="card stack-sm"><Skeleton h={20} w="40%" />{[0, 1, 2].map((r) => <Skeleton key={r} h={44} />)}</div>)}</div>
      <span className="sr-only">Loading Overview…</span>
    </div>
  );
}
