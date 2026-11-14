"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { publishVehicles } from "@/lib/actions";
import type { Vehicle } from "@/lib/domain";
import { formatMoney } from "@/lib/format";
import { useRemote } from "../use-remote";
import { useToast } from "../toast";
import { Badge, Button, EmptyState, ErrorPanel, Kpi, Notice, PageHead, PanelSkeleton } from "../ui";
import { useScopedHref, useWorkspace } from "../workspace";

type Data = { tenantId: string; live: number; notLive: number; pending: Vehicle[]; enquiries30d: number; enquiries7d: number };

/**
 * The dealership's public showroom, managed from inside the app: the link to share, a live preview, what is published and
 * what is not yet (with the reason), and the enquiries it has produced. The same pages customers see, not a separate site.
 */
export function ShowroomHub() {
  const { state, scope, can, run, mergeRecords } = useWorkspace();
  const href = useScopedHref();
  const toast = useToast();
  const live = Boolean(state.live);
  const remote = useRemote<Data>(live ? `/api/showroom?branches=${scope.ids.join(",")}` : null, (d) => mergeRecords({ vehicles: d.pending }));
  const [origin, setOrigin] = useState("");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [frameKey, setFrameKey] = useState(0);
  useEffect(() => setOrigin(window.location.origin), []);
  const path = live ? `/l/${state.tenant.id}` : "/showroom";
  const url = origin ? `${origin}${path}` : path;

  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast("Showroom link copied."); } catch { toast("Could not copy. Select the link and copy it.", "error"); } };
  const publish = (ids: string[]) => {
    const r = run((s, a) => publishVehicles(s, a, ids));
    if (!r.ok) { toast(r.message, "error"); return; }
    const done = r.results.filter((x) => x.channels[0]?.status === "Synced").length;
    const failed = r.results.find((x) => x.channels[0]?.status !== "Synced");
    toast(done ? `${done} car${done === 1 ? "" : "s"} now live in your showroom.` : failed?.channels[0]?.detail ?? "Nothing was published.", done ? undefined : "error");
    remote.reload();
    // The preview is the real public page: reload it so newly published cars appear straight away.
    if (done) setFrameKey((k) => k + 1);
  };

  if (live && !remote.data && remote.status !== "error") return <div className="page"><PageHead title="Showroom" lead="Loading your showroom…" /><PanelSkeleton rows={6} title="Showroom" /></div>;
  if (live && !remote.data) return <div className="page"><PageHead title="Showroom" /><ErrorPanel title="Showroom could not load" onRetry={remote.reload} /></div>;
  const d = remote.data;
  const missing = (v: Vehicle) => [!v.hasImages ? "a photo" : "", !v.asking ? "an asking price" : ""].filter(Boolean);

  return (
    <div className="page">
      <PageHead title="Showroom" lead={live ? "Your public showroom: every published car, with enquiry forms that arrive in Leads." : "The sample showroom. In a live workspace this is your dealership's own public showroom."}
        actions={<><a className="btn" href={path} target="_blank" rel="noopener noreferrer">Open showroom</a><Button variant="primary" className="primary-cta" onClick={() => copy(`${url}${live ? "?utm_source=share&utm_medium=link" : ""}`)}>Copy link</Button></>} />

      <section className="card sh-link" aria-label="Showroom link">
        <div className="sh-link-url"><span className="label meta">Your showroom link</span><code>{url}</code></div>
        <div className="row-flex">
          <a className="btn btn-sm" href={`https://wa.me/?text=${encodeURIComponent(`See our cars for sale: ${url}?utm_source=whatsapp&utm_medium=social`)}`} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
          {can("campaign.view") ? <Link className="btn btn-sm" href={href("/app/advertising")}>Promote cars</Link> : null}
        </div>
        <p className="meta">Put it in your Instagram bio, WhatsApp Business profile and Google Business listing. Each car page has its own link and an enquiry form.</p>
      </section>

      {live && d ? (
        <div className="kpi-grid">
          <Kpi label="Live in showroom" value={d.live} note={`Published, not sold · ${scope.label}`} />
          <Kpi label="Not live yet" value={d.notLive} tone={d.notLive ? "warn" : "neutral"} note={`Available, not published · ${scope.label}`} />
          <Kpi label="Website enquiries" value={d.enquiries30d} tone="neutral" note={`${d.enquiries7d} in the last 7 days`} href={href("/app/leads", { created: "all" })} />
        </div>
      ) : null}

      <div className="sh-grid">
        <section className="card stack" aria-labelledby="sh-preview">
          <div className="spread"><h2 className="h3" id="sh-preview">Live preview</h2>
            <div className="seg" role="group" aria-label="Preview size">
              {(["desktop", "phone"] as const).map((x) => <button key={x} type="button" className={`btn btn-sm ${device === x ? "btn-primary" : ""}`} aria-pressed={device === x} onClick={() => setDevice(x)}>{x === "desktop" ? "Desktop" : "Phone"}</button>)}
            </div>
          </div>
          {live && d && d.live === 0 ? (
            <Notice tone="warn" role="status">Your showroom is live but shows no cars yet: {d.notLive ? `${d.notLive} car${d.notLive === 1 ? " is" : "s are"} not published.` : "nothing is on sale."} {d.notLive ? "Publish them on the right and they appear here." : ""}</Notice>
          ) : null}
          <div className={`sh-frame ${device}`}>
            <div className="sh-bar"><span className="sh-dots" aria-hidden="true"><i /><i /><i /></span><span className="sh-url" title={url}>{url.replace(/^https?:\/\//, "")}</span>
              <button type="button" className="sh-reload" onClick={() => setFrameKey((k) => k + 1)} aria-label="Reload preview">↻</button></div>
            <iframe key={frameKey} title="Your public showroom" src={path} loading="lazy" />
          </div>
          <p className="meta">Your real public showroom at the link above, exactly as customers see it. Only published, unsold cars appear.</p>
        </section>

        <section className="card stack" aria-labelledby="sh-pending">
          <h2 className="h3" id="sh-pending">Not in the showroom yet</h2>
          {!live ? <Notice role="status">Publishing applies to live workspaces. In this sample, browse the sample showroom.</Notice> : !d?.pending.length ? (
            <EmptyState title="Everything available is live">New stock appears here until it has a photo, an asking price and is published.</EmptyState>
          ) : (
            <>
              <ul className="sh-pending">
                {d.pending.map((v) => {
                  const need = missing(v);
                  return (
                    <li key={v.id}>
                      <div><Link className="row-title" href={href(`/app/inventory/${v.id}`)}>{v.year} {v.make} {v.model}</Link><div className="meta">{v.id} · {formatMoney(v.asking)}</div></div>
                      {need.length ? <Badge tone="warn">Needs {need.join(" and ")}</Badge> : can("inventory.transition") ? <Button size="sm" onClick={() => publish([v.id])}>Publish</Button> : <Badge tone="neutral">Ready</Badge>}
                    </li>
                  );
                })}
              </ul>
              {can("inventory.transition") && d.pending.filter((v) => !missing(v).length).length > 1 ? <Button variant="primary" onClick={() => publish(d.pending.filter((v) => !missing(v).length).map((v) => v.id))}>Publish all ready cars</Button> : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
