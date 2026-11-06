"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Campaign, Vehicle } from "@/lib/domain";
import { buildCaption, captionLength, captionProblems, listingLink, normalisePhone, ordinalOwner, PLATFORMS, POST_FORMATS, postFacts, postPrice, shareLinks, type Platform, type PostFormatId } from "@/lib/social-post";
import { useToast } from "../toast";
import { Button, Check, Notice, SelectField, TextArea, TextField } from "../ui";
import { useScopedHref, useWorkspace } from "../workspace";
import { canvasBlob, drawSlide, loadImage, type PostContent, type PostTheme, type SlideSpec } from "./post-renderer";

const ACCENTS = [
  { value: "#047857", label: "Emerald" },
  { value: "#1d4ed8", label: "Blue" },
  { value: "#b91c1c", label: "Red" },
  { value: "#b45309", label: "Amber" },
  { value: "#6d28d9", label: "Violet" },
];
const RIBBONS = ["Available now", "Book a test drive", ""] as const;
const MAX_PHOTOS = 10;

type Rendered = { url: string; blob: Blob; name: string; label: string };

const store = {
  get(key: string): string { try { return window.localStorage.getItem(key) ?? ""; } catch { return ""; } },
  set(key: string, value: string) { try { if (value) window.localStorage.setItem(key, value); else window.localStorage.removeItem(key); } catch { /* storage unavailable */ } },
};

const proxied = (src: string) => `/api/advertising/photo?src=${encodeURIComponent(src)}`;

/** Adds UTM tags to the dealer's own website link. */
function withUtm(base: string, platform: Platform, utm: string): string {
  try {
    const url = new URL(base);
    url.searchParams.set("utm_source", platform);
    url.searchParams.set("utm_medium", "social");
    if (utm) url.searchParams.set("utm_campaign", utm);
    return url.toString();
  } catch { return base; }
}

/**
 * Social post studio: branded, ready-to-post images (single image or multi-photo carousel) and per-platform captions with
 * tracked links for one vehicle. Organic posts spend nothing, so this works at any campaign status.
 */
export function SocialPostKit({ vehicle, campaign }: { vehicle: Vehicle; campaign: Campaign }) {
  const { state } = useWorkspace();
  const href = useScopedHref();
  const toast = useToast();
  const branch = state.branches.find((b) => b.id === vehicle.branchId);
  const city = branch?.city ?? "";
  const tenantKey = `vl:post:${state.tenant.id}`;
  const photos = useMemo(() => (vehicle.photos ?? []).filter((u) => /^https:\/\//.test(u)), [vehicle.photos]);

  const [formatId, setFormatId] = useState<PostFormatId>("square");
  const [theme, setTheme] = useState<PostTheme>("dark");
  const [accent, setAccent] = useState(ACCENTS[0].value);
  const [ribbon, setRibbon] = useState<string>(RIBBONS[0]);
  const [selected, setSelected] = useState<string[]>(() => photos.slice(0, 5));
  const [details, setDetails] = useState(true);
  const [dealer, setDealer] = useState(state.tenant.displayName || state.tenant.name);
  const [phone, setPhone] = useState("");
  const [ownSite, setOwnSite] = useState("");
  const [origin, setOrigin] = useState("");
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [extra, setExtra] = useState("");
  const [tags, setTags] = useState(true);
  const [edits, setEdits] = useState<Partial<Record<Platform, string>>>({});
  const [rendered, setRendered] = useState<Rendered[]>([]);
  const [rendering, setRendering] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const images = useRef(new Map<string, Promise<HTMLImageElement | null>>());

  useEffect(() => {
    setOrigin(window.location.origin);
    setPhone(store.get(`${tenantKey}:phone`));
    setOwnSite(store.get(`${tenantKey}:site`));
    try { setCanShareFiles(typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([new Blob(["x"], { type: "image/jpeg" })], "x.jpg", { type: "image/jpeg" })] })); } catch { setCanShareFiles(false); }
  }, [tenantKey]);
  useEffect(() => { setSelected(photos.slice(0, 5)); }, [photos]);

  const format = POST_FORMATS.find((f) => f.id === formatId)!;
  const phoneShown = phone.trim();
  const linkFor = (p: Platform) => (ownSite.trim() ? withUtm(ownSite.trim(), p, campaign.utm) : origin ? listingLink(origin, state.tenant.id, vehicle.id, p, campaign.utm) : "");
  const link = linkFor(platform);
  const published = vehicle.channels.includes("Owned site");
  const live = Boolean(state.live);

  const content = useMemo<PostContent>(() => ({
    dealer: dealer.trim(),
    eyebrow: `${vehicle.year} · ${vehicle.make}`,
    title: [vehicle.model, vehicle.variant].filter(Boolean).join(" "),
    subtitle: `${vehicle.year} ${vehicle.make}`,
    price: postPrice(vehicle.asking),
    chips: [`${vehicle.km.toLocaleString("en-IN")} km`, vehicle.fuel, vehicle.transmission, ordinalOwner(vehicle.owners)],
    facts: postFacts(vehicle, city),
    city,
    phone: phoneShown,
    // The public listing address is long; images point to the link in the caption unless the dealer has their own site.
    linkLabel: ownSite.trim().replace(/^https?:\/\//, "").replace(/\?.*$/, "").replace(/\/$/, ""),
    stockId: vehicle.id,
    ribbon,
  }), [dealer, vehicle, city, phoneShown, ownSite, ribbon]);

  // Render every slide whenever an input changes (debounced), and release the previous images.
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setRendering(true);
      const load = (src: string) => {
        const cached = images.current.get(src);
        if (cached) return cached;
        const next = loadImage(proxied(src));
        images.current.set(src, next);
        return next;
      };
      if (typeof document !== "undefined" && document.fonts?.ready) await document.fonts.ready.catch(() => undefined);
      const imgs = await Promise.all(selected.map(load));
      const specs: SlideSpec[] = [];
      if (!format.carousel) specs.push({ kind: "hero", photo: imgs[0] ?? null, thumbs: imgs, index: 0, count: 1 });
      else {
        specs.push({ kind: "hero", photo: imgs[0] ?? null, thumbs: imgs, index: 0, count: 0 });
        for (const img of imgs.slice(1)) specs.push({ kind: "photo", photo: img, thumbs: imgs, index: 0, count: 0 });
        if (details) specs.push({ kind: "details", photo: null, thumbs: imgs.slice(1).length ? imgs.slice(1) : imgs, index: 0, count: 0 });
        specs.forEach((s, i) => { s.index = i; s.count = specs.length; });
      }
      const out: Rendered[] = [];
      for (const [i, spec] of specs.entries()) {
        const canvas = document.createElement("canvas");
        drawSlide(canvas, format, spec, content, theme, accent);
        const blob = await canvasBlob(canvas);
        if (!blob) continue;
        const label = spec.kind === "hero" ? "Cover" : spec.kind === "details" ? "Details" : `Photo ${i}`;
        out.push({ url: URL.createObjectURL(blob), blob, name: `${vehicle.id}-${format.id}-${String(i + 1).padStart(2, "0")}.jpg`, label });
      }
      if (cancelled) { out.forEach((r) => URL.revokeObjectURL(r.url)); return; }
      setRendered((prev) => { prev.forEach((r) => URL.revokeObjectURL(r.url)); return out; });
      setRendering(false);
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [selected, format, details, content, theme, accent, vehicle.id]);
  useEffect(() => () => { setRendered((prev) => { prev.forEach((r) => URL.revokeObjectURL(r.url)); return []; }); }, []);

  const generated = buildCaption({ vehicle, platform, link, city, dealer: dealer.trim(), phone: phoneShown, headline: campaign.headline, extra, tags });
  const caption = edits[platform] ?? generated;
  const problems = captionProblems(`${caption}\n${ribbon}`);
  const limit = PLATFORMS.find((p) => p.id === platform)!.limit;
  const length = captionLength(caption, platform);
  const phoneInvalid = phoneShown !== "" && normalisePhone(phoneShown) === null;

  const toggle = (src: string) => setSelected((cur) => (cur.includes(src) ? cur.filter((x) => x !== src) : cur.length >= MAX_PHOTOS ? cur : [...cur, src]));
  const moveFirst = (src: string) => setSelected((cur) => [src, ...cur.filter((x) => x !== src)]);
  const download = (r: Rendered) => { const a = document.createElement("a"); a.href = r.url; a.download = r.name; document.body.appendChild(a); a.click(); a.remove(); };
  const downloadAll = async () => { for (const r of rendered) { download(r); await new Promise((res) => setTimeout(res, 350)); } toast(`${rendered.length} image${rendered.length === 1 ? "" : "s"} downloaded.`); };
  const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text); toast(`${what} copied.`); } catch { toast(`Could not copy the ${what.toLowerCase()}. Select it and copy instead.`, "error"); } };
  const share = async () => {
    try {
      await navigator.share({ files: rendered.map((r) => new File([r.blob], r.name, { type: "image/jpeg" })), text: caption, title: `${vehicle.make} ${vehicle.model}` });
    } catch (error) { if ((error as Error)?.name !== "AbortError") toast("Sharing is not available here. Download the images instead.", "error"); }
  };
  const captionFor = (p: Platform) => edits[p] ?? buildCaption({ vehicle, platform: p, link: linkFor(p), city, dealer: dealer.trim(), phone: phoneShown, headline: campaign.headline, extra, tags: p === "whatsapp" ? false : tags });
  const quickShares = (["whatsapp", "facebook", "linkedin", "x"] as const).map((p) => shareLinks(captionFor(p), linkFor(p)).find((s) => s.platform === p)!);
  const editCaption = (text: string) => setEdits((e) => ({ ...e, [platform]: text }));

  return (
    <section className="card post-kit" id="social-posts" aria-labelledby="post-kit-title">
      <div className="spread">
        <div>
          <h2 className="h3" id="post-kit-title">Social post studio</h2>
          <p className="muted">Ready-to-post images and captions for {vehicle.make} {vehicle.model} with a tracked link. Facts come from stock record {vehicle.id}. Nothing is posted for you and nothing spends.</p>
        </div>
      </div>

      {live && !published && !ownSite.trim() ? (
        <Notice tone="warn" role="status">This vehicle is not published to your website yet, so the listing link will say it is not available. <Link className="accent-text" href={href(`/app/inventory/${vehicle.id}`)}>Publish it from the stock page</Link>, or use your own website link below.</Notice>
      ) : null}

      <div className="post-kit-grid">
        <div className="stack post-kit-controls">
          <fieldset className="stack-sm"><legend className="label">Format</legend>
            <div className="seg post-seg" role="group" aria-label="Post format">
              {POST_FORMATS.map((f) => <button key={f.id} type="button" className={`btn btn-sm ${f.id === formatId ? "btn-primary" : ""}`} aria-pressed={f.id === formatId} onClick={() => setFormatId(f.id)}>{f.label}</button>)}
            </div>
            <p className="meta">{format.width} × {format.height} px · {format.use}</p>
          </fieldset>

          <fieldset className="stack-sm"><legend className="label">Photos {format.carousel ? `(carousel: cover + ${Math.max(0, selected.length - 1)} photo${selected.length - 1 === 1 ? "" : "s"}${details ? " + details" : ""})` : "(first selected photo is used)"}</legend>
            {photos.length ? (
              <>
                <div className="post-thumbs">
                  {photos.map((src, i) => {
                    const order = selected.indexOf(src);
                    return (
                      <div key={src} className={`post-thumb ${order >= 0 ? "on" : ""}`}>
                        <button type="button" onClick={() => toggle(src)} aria-pressed={order >= 0} aria-label={`Photo ${i + 1}${order >= 0 ? `, selected as slide ${order + 1}` : ""}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt="" loading="lazy" />
                          {order >= 0 ? <span className="post-thumb-n">{order + 1}</span> : null}
                        </button>
                        {order > 0 ? <button type="button" className="link-btn post-thumb-cover" onClick={() => moveFirst(src)}>Make cover</button> : null}
                      </div>
                    );
                  })}
                </div>
                <div className="row-flex"><Button size="sm" onClick={() => setSelected(photos.slice(0, MAX_PHOTOS))}>Select all</Button><Button size="sm" onClick={() => setSelected([])}>Clear</Button><span className="meta">{selected.length} of {Math.min(photos.length, MAX_PHOTOS)} max</span></div>
              </>
            ) : (
              <Notice role="status">No photos on this vehicle yet, so a labelled schematic is used. <Link className="accent-text" href={href(`/app/inventory/${vehicle.id}`)}>Add photos on the stock page</Link> for real posts.</Notice>
            )}
            {format.carousel ? <Check label="Add a details slide (specs, price, call to action)" checked={details} onChange={setDetails} /> : null}
          </fieldset>

          <fieldset className="stack-sm"><legend className="label">Style</legend>
            <div className="seg post-seg" role="group" aria-label="Theme">
              {(["dark", "light"] as const).map((t) => <button key={t} type="button" className={`btn btn-sm ${theme === t ? "btn-primary" : ""}`} aria-pressed={theme === t} onClick={() => setTheme(t)}>{t === "dark" ? "Dark" : "Light"}</button>)}
            </div>
            <div className="post-swatches" role="group" aria-label="Accent colour">
              {ACCENTS.map((a) => <button key={a.value} type="button" className={`post-swatch ${accent === a.value ? "on" : ""}`} style={{ background: a.value }} aria-pressed={accent === a.value} aria-label={a.label} title={a.label} onClick={() => setAccent(a.value)} />)}
            </div>
            <SelectField label="Corner badge" value={ribbon} onChange={(e) => setRibbon(e.target.value)} options={RIBBONS.map((r) => ({ value: r, label: r || "None" }))} />
          </fieldset>

          <fieldset className="stack-sm"><legend className="label">Contact and link</legend>
            <TextField label="Dealer name on images" value={dealer} maxLength={40} onChange={(e) => setDealer(e.target.value)} />
            <TextField label="Call / WhatsApp number" inputMode="tel" placeholder="98765 43210" value={phone} onChange={(e) => { setPhone(e.target.value); store.set(`${tenantKey}:phone`, e.target.value.trim()); }} error={phoneInvalid ? "Enter a 10-digit mobile number or a full number with country code." : undefined} help="Shown on the images and in captions. Saved on this device." />
            {live && origin ? (
              <div className="stack-sm">
                <span className="label">Your public showroom (all published cars)</span>
                <div className="row-flex"><a className="accent-text post-showroom" href={`/l/${state.tenant.id}`} target="_blank" rel="noopener noreferrer">{`${origin.replace(/^https?:\/\//, "")}/l/${state.tenant.id.slice(0, 8)}…`}</a><Button size="sm" onClick={() => copy(`${origin}/l/${state.tenant.id}?utm_source=bio&utm_medium=social`, "Showroom link")}>Copy</Button></div>
                <p className="meta">Put this in your Instagram bio and WhatsApp Business profile.</p>
              </div>
            ) : null}
            <TextField label="Your website link (optional)" type="url" placeholder="https://yourdealership.in/cars/innova" value={ownSite} onChange={(e) => { setOwnSite(e.target.value); store.set(`${tenantKey}:site`, e.target.value.trim()); }} help="Leave empty to use the VandLabs listing page for this vehicle. UTM tags are added for each platform." />
          </fieldset>
        </div>

        <div className="stack post-kit-output">
          <div className="spread">
            <h3 className="h3">Images {rendering ? <span className="meta">· updating…</span> : <span className="meta">· {rendered.length} ready</span>}</h3>
            <div className="row-flex">
              {canShareFiles && rendered.length ? <Button size="sm" onClick={share}>Share…</Button> : null}
              <Button size="sm" variant="primary" disabled={!rendered.length} onClick={downloadAll}>Download all</Button>
            </div>
          </div>
          <div className={`post-previews fmt-${format.id}`} aria-busy={rendering}>
            {rendered.map((r, i) => (
              <figure key={r.url} className="post-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.url} alt={`${r.label} slide ${i + 1} of ${rendered.length}`} />
                <figcaption className="spread"><span className="meta">{i + 1}. {r.label}</span><button type="button" className="link-btn" onClick={() => download(r)}>Download</button></figcaption>
              </figure>
            ))}
          </div>

          <h3 className="h3">Caption</h3>
          <div className="tabs post-platforms" role="tablist" aria-label="Platform">
            {PLATFORMS.map((p) => <button key={p.id} type="button" role="tab" className="tab" aria-selected={platform === p.id} onClick={() => setPlatform(p.id)}>{p.label}</button>)}
          </div>
          <TextArea label={`${PLATFORMS.find((p) => p.id === platform)!.label} caption`} rows={platform === "x" ? 4 : 12} value={caption} onChange={(e) => editCaption(e.target.value)} help={`${length.toLocaleString("en-IN")} / ${limit.toLocaleString("en-IN")} characters${edits[platform] !== undefined ? " · edited" : ""}`} error={length > limit ? `Too long for ${PLATFORMS.find((p) => p.id === platform)!.label}. Shorten it.` : undefined} />
          {problems.length ? <Notice tone="danger" role="alert">Blocked claim: {problems.join(" ")} Remove it before posting.</Notice> : <Notice role="status">Caption uses stock facts only.</Notice>}
          <div className="form-grid">
            <TextField label="Extra line (optional)" placeholder="Finance and exchange enquiries welcome" value={extra} maxLength={140} onChange={(e) => { setExtra(e.target.value); setEdits({}); }} />
            <div className="stack-sm"><span className="label">&nbsp;</span><Check label="Hashtags" checked={tags} onChange={(v) => { setTags(v); setEdits({}); }} /></div>
          </div>
          <div className="row-flex">
            <Button variant="primary" onClick={() => copy(caption, "Caption")} disabled={problems.length > 0}>Copy caption</Button>
            <Button onClick={() => copy(link, "Link")} disabled={!link}>Copy link</Button>
            {edits[platform] !== undefined ? <Button onClick={() => setEdits((e) => { const next = { ...e }; delete next[platform]; return next; })}>Reset caption</Button> : null}
            {link ? <a className="btn" href={link} target="_blank" rel="noopener noreferrer">Open link</a> : null}
          </div>
          {link && !problems.length ? (
            <div className="stack-sm">
              <span className="label">Open the platform with this post</span>
              <div className="row-flex">
                {quickShares.map((s) => <a key={s.platform} className="btn btn-sm" href={s.href} target="_blank" rel="noopener noreferrer">{s.label}</a>)}
              </div>
              <p className="meta">Instagram has no web composer: download the images (or use Share… on a phone), then paste the caption in the Instagram app. Each platform&apos;s link carries its own utm_source so leads are attributed to {campaign.id}.</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
