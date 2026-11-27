"use client";

import { createContext, forwardRef, useContext, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { LiquidGlassEngine, type EngineStatus, type GlassParams, type ScenePainter, type SurfaceOptions } from "@/lib/liquid-glass/engine";

/**
 * React bindings for the liquid glass engine. One <GlassProvider> owns the single WebGL canvas for its subtree; every
 * <Glass> inside registers itself as a surface. Content inside <Glass> is ordinary DOM: crisp, selectable and accessible.
 */

type Ctx = { engine: LiquidGlassEngine | null; status: EngineStatus };
const GlassContext = createContext<Ctx>({ engine: null, status: "starting" });

export function useGlassEngine(): Ctx { return useContext(GlassContext); }

const reducedMotion = () =>
  document.documentElement.getAttribute("data-motion") === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches;

export function GlassProvider({ painter, live = true, params, className, children }: { painter?: ScenePainter; live?: boolean; params?: Partial<GlassParams>; className?: string; children: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<Ctx>({ engine: null, status: "starting" });
  const painterRef = useRef(painter);
  painterRef.current = painter;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new LiquidGlassEngine(canvas, { params, reducedMotion });
    engine.onStatus = (status) => setState({ engine, status });
    engine.setScenePainter((ctx, info) => painterRef.current?.(ctx, info), live);
    setState({ engine, status: engine.status });
    return () => { engine.destroy(); document.documentElement.removeAttribute("data-liquid-glass"); };
    // The engine is created once; params and liveness are pushed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (params) state.engine?.setParams(params); }, [params, state.engine]);
  useEffect(() => { state.engine?.setSceneLive(live); }, [live, state.engine]);

  return (
    <GlassContext.Provider value={state}>
      <canvas ref={canvasRef} className={className} aria-hidden="true" style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 0, pointerEvents: "none" }} />
      {children}
    </GlassContext.Provider>
  );
}

/** Register any element as a glass surface. */
export function useGlassSurface<T extends HTMLElement>(options: SurfaceOptions = {}) {
  const ref = useRef<T>(null);
  const { engine } = useGlassEngine();
  const { radius, tint, interactive, follow } = options;
  useEffect(() => {
    const el = ref.current;
    if (!engine || !el) return;
    return engine.register(el, { radius, interactive, follow, tint });
    // Tint and radius updates do not need a re-register.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, interactive, follow]);
  useEffect(() => { if (engine && ref.current) engine.update(ref.current, { tint, radius }); }, [engine, tint, radius]);
  return ref;
}

type GlassProps = HTMLAttributes<HTMLDivElement> & SurfaceOptions & { style?: CSSProperties };

/** A div that is a glass surface. Use `className` for layout and border-radius; the glass follows the element's box. */
export const Glass = forwardRef<HTMLDivElement, GlassProps>(function Glass({ radius, tint, interactive, follow, className, ...rest }, forwarded) {
  const ref = useGlassSurface<HTMLDivElement>({ radius, tint, interactive, follow });
  useImperativeHandle(forwarded, () => ref.current as HTMLDivElement);
  return <div ref={ref} className={["lg-surface", className].filter(Boolean).join(" ")} {...rest} />;
});

/** A button that is a glass surface. */
export const GlassButton = forwardRef<HTMLButtonElement, HTMLAttributes<HTMLButtonElement> & SurfaceOptions & { type?: "button" | "submit"; disabled?: boolean; "aria-pressed"?: boolean }>(
  function GlassButton({ radius, tint, interactive, follow, className, type = "button", ...rest }, forwarded) {
    const ref = useGlassSurface<HTMLButtonElement>({ radius, tint, interactive, follow });
    useImperativeHandle(forwarded, () => ref.current as HTMLButtonElement);
    return <button ref={ref} type={type} className={["lg-surface", className].filter(Boolean).join(" ")} {...rest} />;
  },
);
