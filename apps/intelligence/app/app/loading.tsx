import { Skeleton } from "@/components/ui";

/** Shown while a workspace page loads inside the persistent shell. The shapes match the real page head, metric cards and panel so nothing jumps when data arrives. */
export default function Loading() {
  return (
    <main className="stack" style={{ padding: 24 }} role="status" aria-busy="true" aria-label="Loading page">
      <Skeleton h={32} w={280} />
      <div className="kpi-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        {[0, 1, 2, 3].map((i) => <div key={i} className="card"><Skeleton h={14} w="50%" /><div style={{ height: 12 }} /><Skeleton h={32} w="70%" /></div>)}
      </div>
      <div className="card"><Skeleton h={20} w="30%" /><div style={{ height: 16 }} /><Skeleton h={160} /></div>
      <span className="sr-only">Loading page…</span>
    </main>
  );
}
