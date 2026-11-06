"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Campaign, Vehicle } from "@/lib/domain";
import { buildCaption, captionLength, captionProblems, listingLink, normalisePhone, ordinalOwner, PLATFORMS, POST_FORMATS, postFacts, postPrice, shareLinks, type Platform, type PostFormatId } from "@/lib/social-post";
import { Icon } from "../icons";
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
  const [active, setActive] = useState(0);
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

  const slide = rendered[Math.min(active, Math.max(0, rendered.length - 1))];
  const platformLabel = PLATFORMS.find((p) => p.id === platform)!.label;
  const seg = <T extends string>(label: string, value: T, options: { value: T; label: string }[], onChange: (v: T) => void) => (
    <div className={`pk-seg${options.length > 3 ? " pk-seg-grid" : ""}`} role="group" aria-label={label}>
      {options.map((o) => <button key={o.value} type="button" className={o.value === value ? "on" : ""} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );

  return (
    <section className="post-kit" id="social-posts" aria-labelledby="post-kit-title">
      <div className="pk-head">
        <div>
          <h2 className="h3" id="post-kit-title">Posts for the {vehicle.year} {vehicle.make} {vehicle.model}</h2>
          <p className="muted">Ready to post yourself. Every detail comes from stock record {vehicle.id}; nothing is posted or paid for automatically.</p>
        </div>
        <div className="row-flex">
          {canShareFiles && rendered.length ? <Button onClick={share}><Icon name="share" size={16} />Share</Button> : null}
          <Button variant="primary" disabled={!rendered.length} onClick={downloadAll}><Icon name="download" size={16} />Download all</Button>
        </div>
      </div>

      {live && !published && !ownSite.trim() ? (
        <Notice tone="warn" role="status">This car is not on your website yet, so the link in the post would say it is unavailable. <Link className="accent-text" href={href(`/app/inventory/${vehicle.id}`)}>Publish it from the stock page</Link>, or add your own website link under Contact.</Notice>
      ) : null}

      <div className="pk-grid">
        <div className="pk-stage">
          <div className={`pk-main fmt-${format.id}`} aria-busy={rendering}>
            {slide ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={slide.url} alt={`${slide.label}, slide ${rendered.indexOf(slide) + 1} of ${rendered.length}`} />
            ) : <span className="meta">Preparing the images…</span>}
            {rendering ? <span className="pk-busy">Updating…</span> : null}
          </div>
          <div className="pk-strip" role="group" aria-label="Slides">
            {rendered.map((r, i) => (
              <div key={r.url} className={`pk-strip-item ${r === slide ? "on" : ""}`}>
                <button type="button" onClick={() => setActive(i)} aria-pressed={r === slide} aria-label={`Show slide ${i + 1}: ${r.label}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.url} alt="" />
                </button>
                <span className="meta">{i + 1}. {r.label}</span>
                <button type="button" className="link-btn" onClick={() => download(r)}>Download</button>
              </div>
            ))}
          </div>
        </div>

        <div className="pk-panel">
          <section className="card pk-card" aria-labelledby="pk-look">
            <h3 className="pk-card-title" id="pk-look">Look</h3>
            <div className="pk-field"><span className="label">Format</span>{seg("Post format", formatId, POST_FORMATS.map((f) => ({ value: f.id, label: f.label })), setFormatId)}<span className="meta">{format.width} × {format.height} px · {format.use}</span></div>
            <div className="pk-field"><span className="label">Style</span>
              <div className="pk-style">
                {seg("Image style", theme, [{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }], setTheme)}
                <div className="post-swatches" role="group" aria-label="Accent colour">
                  {ACCENTS.map((a) => <button key={a.value} type="button" className={`post-swatch ${accent === a.value ? "on" : ""}`} style={{ background: a.value }} aria-pressed={accent === a.value} aria-label={a.label} title={a.label} onClick={() => setAccent(a.value)} />)}
                </div>
              </div>
            </div>
            <SelectField label="Corner badge" value={ribbon} onChange={(e) => setRibbon(e.target.value)} options={RIBBONS.map((r) => ({ value: r, label: r || "None" }))} />
          </section>

          <section className="card pk-card" aria-labelledby="pk-photos">
            <div className="spread"><h3 className="pk-card-title" id="pk-photos">Photos</h3>{photos.length ? <span className="meta">{selected.length} of {Math.min(photos.length, MAX_PHOTOS)} chosen</span> : null}</div>
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
                <div className="row-flex"><Button size="sm" onClick={() => setSelected(photos.slice(0, MAX_PHOTOS))}>Select all</Button><Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear</Button></div>
              </>
            ) : (
              <p className="muted">No photos yet, so the post uses a drawing of the car. <Link className="accent-text" href={href(`/app/inventory/${vehicle.id}`)}>Add real photos</Link> for better posts.</p>
            )}
            {format.carousel ? <Check label="Finish with a details slide (specs, price, contact)" checked={details} onChange={setDetails} /> : null}
          </section>

          <details className="card pk-card pk-details">
            <summary className="pk-card-title">Contact on the post<span className="meta">{dealer.trim() || "Dealer name"}{phoneShown ? ` · ${phoneShown}` : ""}</span></summary>
            <div className="stack-sm">
              <TextField label="Dealer name" value={dealer} maxLength={40} onChange={(e) => setDealer(e.target.value)} />
              <TextField label="Call or WhatsApp number" inputMode="tel" placeholder="98765 43210" value={phone} onChange={(e) => { setPhone(e.target.value); store.set(`${tenantKey}:phone`, e.target.value.trim()); }} error={phoneInvalid ? "Enter a 10-digit mobile number or a full number with country code." : undefined} help="Saved on this device." />
              <TextField label="Your website link (optional)" type="url" placeholder="https://yourdealership.in/cars/innova" value={ownSite} onChange={(e) => { setOwnSite(e.target.value); store.set(`${tenantKey}:site`, e.target.value.trim()); }} help="Leave empty to link to this car's VandLabs page." />
              {live && origin ? (
                <div className="pk-showroom"><span className="meta">Showroom link for your Instagram bio</span><Button size="sm" onClick={() => copy(`${origin}/l/${state.tenant.id}?utm_source=bio&utm_medium=social`, "Showroom link")}><Icon name="copy" size={14} />Copy</Button></div>
              ) : null}
            </div>
          </details>
        </div>
      </div>

      <section className="card pk-caption" aria-labelledby="pk-caption-title">
        <div className="spread"><h3 className="pk-card-title" id="pk-caption-title">Caption</h3>{problems.length ? null : <span className="pk-ok"><Icon name="check" size={14} />Only facts from the stock record</span>}</div>
        <div className="tabs post-platforms" role="tablist" aria-label="Platform">
          {PLATFORMS.map((p) => <button key={p.id} type="button" role="tab" className="tab" aria-selected={platform === p.id} onClick={() => setPlatform(p.id)}>{p.label}</button>)}
        </div>
        <TextArea label={`${platformLabel} caption`} rows={platform === "x" ? 4 : 9} value={caption} onChange={(e) => editCaption(e.target.value)} help={`${length.toLocaleString("en-IN")} / ${limit.toLocaleString("en-IN")} characters${edits[platform] !== undefined ? " · edited" : ""}`} error={length > limit ? `Too long for ${platformLabel}. Shorten it.` : undefined} />
        {problems.length ? <Notice tone="danger" role="alert">Remove this before posting: {problems.join(" ")}</Notice> : null}
        <div className="pk-extra">
          <TextField label="Extra line (optional)" placeholder="Finance and exchange enquiries welcome" value={extra} maxLength={140} onChange={(e) => { setExtra(e.target.value); setEdits({}); }} />
          <Check label="Hashtags" checked={tags} onChange={(v) => { setTags(v); setEdits({}); }} />
        </div>
        <div className="pk-actions">
          <div className="row-flex">
            <Button variant="primary" onClick={() => copy(caption, "Caption")} disabled={problems.length > 0}><Icon name="copy" size={16} />Copy caption</Button>
            <Button onClick={() => copy(link, "Link")} disabled={!link}><Icon name="link" size={16} />Copy link</Button>
            {edits[platform] !== undefined ? <Button variant="ghost" onClick={() => setEdits((e) => { const next = { ...e }; delete next[platform]; return next; })}>Reset caption</Button> : null}
          </div>
          {link && !problems.length ? (
            <div className="row-flex pk-post-to"><span className="meta">Post to</span>{quickShares.map((s) => <a key={s.platform} className="btn btn-sm" href={s.href} target="_blank" rel="noopener noreferrer">{s.label.replace(/^(Send on|Share on|Post on) /, "")}</a>)}</div>
          ) : null}
        </div>
        <p className="meta">Instagram can&apos;t be posted to from a browser: download the images (or use Share on a phone), then paste the caption in the app. Each platform&apos;s link is tracked separately, so enquiries are credited to {campaign.id}.</p>
      </section>
    </section>
  );
}
