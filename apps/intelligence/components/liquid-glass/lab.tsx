"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { DEFAULT_PARAMS, type EngineStats, type GlassParams } from "@/lib/liquid-glass/engine";
import { Glass, GlassButton, GlassProvider, useGlassEngine, useGlassSurface } from "./glass";
import { createLabScene, SCENE_HEIGHT } from "./lab-scene";
import s from "./lab.module.css";

/**
 * Liquid glass prototype (development only). Every translucent surface here is drawn by one shared WebGL2 shader pass that
 * refracts the live scene behind it; the DOM on top carries the real controls, text and accessibility.
 */

type Theme = "dark" | "light";

export function LiquidGlassLab() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [params, setParams] = useState<GlassParams>(DEFAULT_PARAMS);
  const [live, setLive] = useState(true);
  const [modal, setModal] = useState(false);
  const sceneState = useRef({ theme: theme as Theme, dim: 0 });
  useEffect(() => { sceneState.current.theme = theme; }, [theme]);
  useEffect(() => { sceneState.current.dim = modal ? 1 : 0; }, [modal]);
  useEffect(() => { try { if (matchMedia("(prefers-color-scheme: light)").matches) setTheme("light"); } catch { /* keep dark */ } }, []);
  const painter = useMemo(() => createLabScene(() => sceneState.current), []);
  const merged = useMemo(() => ({ ...params, theme }), [params, theme]);

  return (
    <GlassProvider painter={painter} live={live} params={merged}>
      <div className={s.root} data-theme={theme} style={{ minHeight: SCENE_HEIGHT }}>
        <h1 className="sr-only">Liquid glass prototype</h1>
        <TopBar />
        <Notifications />
        <Content onOpenModal={() => setModal(true)} />
        <Dock />
        {modal && <Modal onClose={() => setModal(false)} />}
        <DevPanel params={params} setParams={setParams} theme={theme} setTheme={setTheme} live={live} setLive={setLive} />
      </div>
    </GlassProvider>
  );
}

// ---------------------------------------------------------------- top bar

const TABS = ["Overview", "Inventory", "Market", "Leads", "Reports"];
const RESULTS = [["Hyundai Creta SX(O) 2021", "₹14.2L"], ["Pune demand index", "+6.4%"], ["Lead: Rohan M. · Nexon EV", "2m"], ["Price watch · Seltos HTX", "3 alerts"]];

function TopBar() {
  const [tab, setTab] = useState(0);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    const el = tabsRef.current?.querySelector<HTMLElement>(`[data-i="${tab}"]`);
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
  }, [tab]);
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const [active, setActive] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);
  const [resultsLeft, setResultsLeft] = useState(0);
  const open = focus;
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => { const r = searchRef.current?.getBoundingClientRect(); if (r) setResultsLeft(r.right - 340); };
    place();
    const t = setTimeout(place, 650);
    return () => clearTimeout(t);
  }, [open]);
  const items = RESULTS.filter(([a]) => a.toLowerCase().includes(q.toLowerCase()));
  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    if (e.key === "Escape") (e.target as HTMLInputElement).blur();
  };
  return (
    <header className={s.top}>
      <Glass className={`${s.glass} ${s.nav}`} tint={0.34} role="navigation" aria-label="Prototype navigation">
        <div className={s.brand}><i className={s.brandMark} aria-hidden="true" /><span>VandLabs</span></div>
        <div className={s.tabs} ref={tabsRef}>
          {TABS.map((t, i) => (
            <button key={t} data-i={i} className={s.tab} aria-current={tab === i ? "page" : undefined} onClick={() => setTab(i)}>{t}</button>
          ))}
          <span className={s.tabPill} style={pill} aria-hidden="true" />
        </div>
      </Glass>
      <Glass ref={searchRef} className={`${s.glass} ${s.search}`} tint={0.34} interactive={false}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input aria-label="Search" placeholder="Search vehicles, leads…" value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 120)} onKeyDown={onKey} role="combobox" aria-expanded={open} aria-controls="lg-results" />
        <span className={s.kbd} aria-hidden="true">/</span>
      </Glass>
      {open && (
        <Glass className={`${s.glass} ${s.results}`} tint={0.42} interactive={false} style={{ left: resultsLeft }} id="lg-results" role="listbox" aria-label="Search results">
          {items.length === 0 ? <div className={s.result}>No matches</div> : items.map(([a, b], i) => (
            <div key={a} className={s.result} role="option" aria-selected={i === active} data-active={i === active} onMouseEnter={() => setActive(i)}><span>{a}</span><span>{b}</span></div>
          ))}
        </Glass>
      )}
    </header>
  );
}

// ---------------------------------------------------------------- notifications

type Toast = { id: number; icon: string; title: string; body: string; time: string; leaving?: boolean };
const SAMPLES: Omit<Toast, "id">[] = [
  { icon: "₹", title: "Price drop detected", body: "Kia Seltos HTX in Pune listed 4.2% below your ask.", time: "now" },
  { icon: "◎", title: "New lead · Nexon EV Max", body: "Rohan M. asked about a test drive this Saturday.", time: "2m" },
  { icon: "↗", title: "Demand rising", body: "Compact SUV searches up 11% this week in Delhi NCR.", time: "14m" },
  { icon: "✓", title: "Report ready", body: "Weekly inventory ageing report is ready to share.", time: "1h" },
];

let toastSeq = 0;
function Notifications() {
  const [list, setList] = useState<Toast[]>(() => SAMPLES.slice(0, 3).map((t) => ({ ...t, id: ++toastSeq })));
  const dismiss = useCallback((id: number) => {
    setList((l) => l.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 340);
  }, []);
  useEffect(() => {
    const add = () => setList((l) => [{ ...SAMPLES[toastSeq % SAMPLES.length], time: "now", id: ++toastSeq }, ...l].slice(0, 3));
    window.addEventListener("lg:notify", add);
    return () => window.removeEventListener("lg:notify", add);
  }, []);
  return (
    <section className={s.toasts} aria-live="polite" aria-label="Notifications">
      {list.map((t) => (
        <Glass key={t.id} className={`${s.glass} ${s.toast}`} tint={0.42} data-leaving={t.leaving ? "true" : undefined}>
          <span className={s.toastIcon} aria-hidden="true">{t.icon}</span>
          <div><div className={s.toastTitle}>{t.title}</div><div className={s.toastBody}>{t.body}</div></div>
          <div style={{ display: "grid", justifyItems: "end", gap: 4 }}>
            <span className={s.toastTime}>{t.time}</span>
            <button className={s.close} aria-label={`Dismiss ${t.title}`} onClick={() => dismiss(t.id)}>×</button>
          </div>
        </Glass>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------- in-page content

function Content({ onOpenModal }: { onOpenModal: () => void }) {
  return (
    <main id="content">
      <div className={`${s.block} ${s.kpis}`}>
        <Glass className={`${s.glass} ${s.kpi}`} tint={0.3}><span className={s.kpiLabel}>Stock turn</span><div><div className={s.kpiValue}>31 days</div><span className={s.kpiDelta}>−4 days vs last month</span></div></Glass>
        <Glass className={`${s.glass} ${s.kpi}`} tint={0.3}><span className={s.kpiLabel}>Gross per unit</span><div><div className={s.kpiValue}>₹62,400</div><span className={s.kpiDelta}>+8.1% this quarter</span></div></Glass>
        <Glass className={`${s.glass} ${s.kpi}`} tint={0.3}><span className={s.kpiLabel}>Open leads</span><div><div className={s.kpiValue}>148</div><span className={s.kpiDelta}>23 need a reply today</span></div></Glass>
      </div>
      <Controls />
      <Expandable />
      <LensZone onOpenModal={onOpenModal} />
    </main>
  );
}

function Controls() {
  const [seg, setSeg] = useState(0);
  const segRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    const el = segRef.current?.querySelectorAll<HTMLElement>("button")[seg];
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
  }, [seg]);
  const [on, setOn] = useState(true);
  const [menu, setMenu] = useState(false);
  const [tip, setTip] = useState(false);
  const [range, setRange] = useState("30 days");
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [menu]);
  return (
    <div className={`${s.block} ${s.controls}`}>
      <GlassButton className={`${s.glass} ${s.btn} ${s.btnAccent}`} tint={0.28} onClick={() => window.dispatchEvent(new Event("lg:notify"))}>Send notification</GlassButton>
      <GlassButton className={`${s.glass} ${s.btn}`} tint={0.28}>Secondary</GlassButton>
      <div className={s.tipWrap}>
        <GlassButton className={`${s.glass} ${s.iconBtn}`} tint={0.28} aria-label="About refraction" aria-describedby={tip ? "lg-tip" : undefined} onPointerEnter={() => setTip(true)} onPointerLeave={() => setTip(false)} onFocus={() => setTip(true)} onBlur={() => setTip(false)}>i</GlassButton>
        {tip && <Glass id="lg-tip" role="tooltip" className={`${s.glass} ${s.tip}`} tint={0.45} interactive={false}>Glass bends the live scene behind it</Glass>}
      </div>
      <Glass className={`${s.glass} ${s.seg}`} tint={0.28} role="group" aria-label="Market" ref={segRef}>
        {["Pune", "Delhi NCR", "Bengaluru"].map((c, i) => <button key={c} aria-pressed={seg === i} onClick={() => setSeg(i)}>{c}</button>)}
        <span className={s.segPill} style={pill} aria-hidden="true" />
      </Glass>
      <GlassButton className={`${s.glass} ${s.switch}`} tint={0.28} aria-label="Live pricing" {...{ role: "switch", "aria-checked": on }} onClick={() => setOn((v) => !v)}><span className={s.knob} /></GlassButton>
      <div className={s.menuWrap} ref={menuRef}>
        <GlassButton className={`${s.glass} ${s.btn}`} tint={0.28} {...{ "aria-haspopup": "menu", "aria-expanded": menu }} onClick={() => setMenu((m) => !m)}>{range} <span aria-hidden="true">▾</span></GlassButton>
        {menu && (
          <Glass className={`${s.glass} ${s.menu}`} tint={0.45} interactive={false} role="menu" aria-label="Range">
            {["7 days", "30 days", "90 days", "12 months"].map((r) => <button key={r} role="menuitem" className={s.menuItem} onClick={() => { setRange(r); setMenu(false); }}>{r}</button>)}
          </Glass>
        )}
      </div>
      <Glass className={`${s.glass} ${s.loader}`} tint={0.28} interactive={false} role="status" aria-label="Syncing listings"><span className={s.dots} aria-hidden="true"><i /><i /><i /></span>Syncing listings</Glass>
    </div>
  );
}

function Expandable() {
  const [open, setOpen] = useState(false);
  const ref = useGlassSurface<HTMLDivElement>({ tint: 0.4 });
  const head = useRef<HTMLButtonElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const hh = head.current?.offsetHeight ?? 64, bh = body.current?.offsetHeight ?? 0;
    setH(open ? hh + bh : hh);
  }, [open]);
  return (
    <div ref={ref} className={`${s.block} ${s.glass} ${s.expand} lg-surface`} data-open={open} style={{ height: h }}>
      <button ref={head} className={s.expandHead} aria-expanded={open} aria-controls="lg-expand" onClick={() => setOpen((o) => !o)}>
        <span>Pricing insight · Creta SX(O)</span><span className={s.chev} aria-hidden="true">▾</span>
      </button>
      <div ref={body} id="lg-expand" className={s.expandBody} aria-hidden={!open}>
        Similar listings within 50 km suggest room to hold price.
        <dl>
          <dt>Market median</dt><dd>₹14.65L</dd>
          <dt>Your ask</dt><dd>₹14.20L</dd>
          <dt>Comparable listings</dt><dd>37</dd>
          <dt>Median days to sell</dt><dd>18</dd>
        </dl>
      </div>
    </div>
  );
}

function LensZone({ onOpenModal }: { onOpenModal: () => void }) {
  const ref = useGlassSurface<HTMLDivElement>({ tint: 0, follow: 340 });
  const pos = useRef({ x: 0, y: 200, dx: 0, dy: 0, drag: false });
  const [xy, setXY] = useState({ x: 120, y: 200 });
  const { engine } = useGlassEngine();
  useEffect(() => { setXY({ x: Math.max(40, window.innerWidth * 0.42), y: 180 }); }, []);
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pos.current = { ...pos.current, drag: true, dx: e.clientX - xy.x, dy: e.clientY - xy.y };
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pos.current.drag) return;
    setXY({ x: e.clientX - pos.current.dx, y: e.clientY - pos.current.dy });
    engine?.wake();
  };
  const up = () => { pos.current.drag = false; };
  const key = (e: ReactKeyboardEvent) => {
    const step = e.shiftKey ? 40 : 12;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (d[e.key]) { e.preventDefault(); setXY((p) => ({ x: p.x + d[e.key][0], y: p.y + d[e.key][1] })); }
  };
  return (
    <div className={`${s.block} ${s.lensZone}`}>
      <div ref={ref} className={`${s.glass} ${s.lens} lg-surface`} style={{ left: xy.x, top: xy.y }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} tabIndex={0} role="slider" aria-label="Draggable lens. Use arrow keys to move." aria-valuenow={Math.round(xy.x)} onKeyDown={key}>
        <span className={s.lensHint}>Drag</span>
      </div>
      <GlassButton className={`${s.glass} ${s.btn} ${s.modalBtn}`} tint={0.3} onClick={onOpenModal}>Open modal</GlassButton>
    </div>
  );
}

// ---------------------------------------------------------------- dock: toolbar + assistant

function Dock() {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<{ me: boolean; text: string }[]>([{ me: false, text: "Hi — I can compare listings, price a car or summarise today's leads." }]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const face = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => input.current?.focus(), 380);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); face.current?.focus(); } };
    document.addEventListener("keydown", esc);
    return () => { clearTimeout(t); document.removeEventListener("keydown", esc); };
  }, [open]);
  const send = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setLog((l) => [...l, { me: true, text }]);
    setDraft(""); setBusy(true);
    setTimeout(() => { setLog((l) => [...l, { me: false, text: "This prototype is not connected to the assistant. In the app, the answer would stream here." }]); setBusy(false); }, 1400);
  };
  return (
    <div className={s.dock} data-open={open}>
      <Glass className={`${s.glass} ${s.toolbar}`} tint={0.34} role="toolbar" aria-label="Quick actions">
        <button aria-label="Add vehicle">＋</button>
        <button aria-label="Scan RC">⌗</button>
        <button aria-label="Share">↗</button>
      </Glass>
      <Glass className={`${s.glass} ${s.orb}`} tint={open ? 0.46 : 0.22} follow={300}>
        <button ref={face} className={s.orbFace} aria-label="Open assistant" aria-expanded={open} onClick={() => setOpen(true)} tabIndex={open ? -1 : 0}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>
        </button>
        <div className={s.assistant} role="dialog" aria-label="Assistant" aria-hidden={!open}>
          <div className={s.assistantHead}><span>VandLabs Assistant</span><button className={s.close} aria-label="Close assistant" onClick={() => { setOpen(false); face.current?.focus(); }} tabIndex={open ? 0 : -1}>×</button></div>
          <div className={s.assistantLog} aria-live="polite">
            {log.map((m, i) => <div key={i} className={`${s.msg} ${m.me ? s.msgMe : ""}`}>{m.text}</div>)}
            {busy && <div className={s.msg} role="status" aria-label="Thinking"><span className={s.dots} aria-hidden="true"><i /><i /><i /></span></div>}
          </div>
          <form className={s.assistantForm} onSubmit={send}>
            <input ref={input} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask about a car or market…" aria-label="Message" tabIndex={open ? 0 : -1} />
            <button className={s.send} type="submit" tabIndex={open ? 0 : -1}>Send</button>
          </form>
        </div>
      </Glass>
    </div>
  );
}

// ---------------------------------------------------------------- modal

function Modal({ onClose }: { onClose: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const first = useRef<HTMLButtonElement>(null);
  const prev = useRef<Element | null>(null);
  const close = useCallback(() => { setLeaving(true); setTimeout(onClose, 230); }, [onClose]);
  useEffect(() => {
    prev.current = document.activeElement;
    first.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("keydown", esc); (prev.current as HTMLElement | null)?.focus?.(); };
  }, [close]);
  return (
    <div className={s.modalLayer} onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <Glass className={`${s.glass} ${s.modal}`} tint={0.5} interactive={false} role="dialog" aria-modal="true" aria-labelledby="lg-modal-title" data-leaving={leaving ? "true" : undefined}>
        <h2 id="lg-modal-title">Publish price change?</h2>
        <p>The Creta SX(O) ask moves from ₹14.20L to ₹14.45L on your website and every connected marketplace.</p>
        <div className={s.modalActions}>
          <GlassButton className={`${s.glass} ${s.btn}`} tint={0.3} onClick={close}>Cancel</GlassButton>
          <GlassButton ref={first} className={`${s.glass} ${s.btn} ${s.btnAccent}`} tint={0.3} onClick={close}>Publish</GlassButton>
        </div>
      </Glass>
    </div>
  );
}

// ---------------------------------------------------------------- dev controls

const SLIDERS: { key: keyof GlassParams; label: string; min: number; max: number; step: number }[] = [
  { key: "thickness", label: "Thickness", min: 0, max: 60, step: 1 },
  { key: "bevel", label: "Bevel", min: 2, max: 60, step: 1 },
  { key: "ior", label: "Refr. index", min: 1, max: 2.4, step: 0.01 },
  { key: "dispersion", label: "Dispersion", min: 0, max: 0.15, step: 0.005 },
  { key: "reflection", label: "Reflection", min: 0, max: 1.5, step: 0.05 },
  { key: "magnify", label: "Magnify", min: -0.2, max: 0.3, step: 0.01 },
  { key: "frost", label: "Frost", min: 0, max: 5, step: 0.1 },
  { key: "deform", label: "Deformation", min: 0, max: 2.5, step: 0.05 },
  { key: "merge", label: "Liquid merge", min: 0, max: 40, step: 1 },
  { key: "shadow", label: "Shadow", min: 0, max: 0.6, step: 0.01 },
];

function DevPanel({ params, setParams, theme, setTheme, live, setLive }: { params: GlassParams; setParams: (p: GlassParams) => void; theme: Theme; setTheme: (t: Theme) => void; live: boolean; setLive: (v: boolean) => void }) {
  const { engine, status } = useGlassEngine();
  const [collapsed, setCollapsed] = useState(false);
  const [stats, setStats] = useState<EngineStats | null>(null);
  const [quality, setQuality] = useState("auto");
  useEffect(() => { if (window.innerWidth < 720) setCollapsed(true); }, []);
  useEffect(() => {
    if (!engine) return;
    const id = setInterval(() => setStats(engine.getStats()), 500);
    return () => clearInterval(id);
  }, [engine]);
  useEffect(() => { engine?.setQuality(quality === "auto" ? null : Number(quality)); }, [quality, engine]);
  useEffect(() => { (window as unknown as { __lg?: unknown }).__lg = engine; }, [engine]);
  return (
    <aside className={s.dev} data-collapsed={collapsed} aria-label="Glass controls (development)">
      <div className={s.devHead}>
        <span>Glass lab · {status === "running" ? "WebGL2" : status}</span>
        <button onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed}>{collapsed ? "Show" : "Hide"}</button>
      </div>
      {!collapsed && (
        <div className={s.devBody}>
          {SLIDERS.map((sl) => (
            <label key={sl.key} className={s.row}>
              <span>{sl.label}</span>
              <input type="range" min={sl.min} max={sl.max} step={sl.step} value={params[sl.key] as number} onChange={(e) => setParams({ ...params, [sl.key]: Number(e.target.value) })} />
              <output>{Number(params[sl.key]).toFixed(sl.step < 0.1 ? (sl.step < 0.01 ? 3 : 2) : sl.step < 1 ? 1 : 0)}</output>
            </label>
          ))}
          <label className={s.row}>
            <span>Quality</span>
            <select value={quality} onChange={(e) => setQuality(e.target.value)}>
              <option value="auto">Adaptive</option><option value="1">100%</option><option value="0.75">75%</option><option value="0.5">50%</option><option value="0.35">35%</option>
            </select>
          </label>
          <div className={s.devActions}>
            <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "Light" : "Dark"} theme</button>
            <button onClick={() => setLive(!live)}>{live ? "Pause" : "Play"} background</button>
            <button onClick={() => setParams(DEFAULT_PARAMS)}>Reset</button>
          </div>
          {stats && (
            <div className={s.stats} aria-live="off">
              <div className={s.stat}><b>{stats.fps.toFixed(0)}</b><span>fps</span></div>
              <div className={s.stat}><b>{stats.frameMs.toFixed(1)}</b><span>frame ms</span></div>
              <div className={s.stat}><b>{stats.cpuMs.toFixed(2)}</b><span>cpu ms</span></div>
              <div className={s.stat}><b>{stats.gpuMs === null ? "n/a" : stats.gpuMs.toFixed(2)}</b><span>gpu ms</span></div>
              <div className={s.stat}><b>{Math.round(stats.scale * 100)}%</b><span>scale</span></div>
              <div className={s.stat}><b>{stats.surfaces}</b><span>surfaces</span></div>
              <div className={s.stat} style={{ gridColumn: "1 / 4" }}><span>{stats.width}×{stats.height} px · {stats.dpr.toFixed(2)} px/css</span></div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
