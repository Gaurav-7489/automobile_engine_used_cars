import { Skeleton } from "@/components/ui";

/** Shaped like a list page: title, filters, then rows. */
export default function Loading() {
  return (
    <div className="page" role="status" aria-busy="true" aria-label="Loading">
      <div className="stack-sm"><Skeleton h={30} w={220} /><Skeleton h={16} w={320} /></div>
      <div className="row-flex">{[0, 1, 2].map((i) => <Skeleton key={i} h={40} w={150} />)}</div>
      <div className="table-wrap" style={{ padding: 16, display: "grid", gap: 14 }}>{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={44} />)}</div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
