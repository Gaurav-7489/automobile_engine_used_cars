import { HeroCar } from "./hero-car";

const CAPTIONS = ["Acquire with evidence.", "Price with confidence.", "Sell before it ages."];

/** Deterministic window lights for the skyline, so server and client render the same scene. */
function skyline(seed: number, width: number) {
  const buildings: { x: number; w: number; h: number; lit: { x: number; y: number }[] }[] = [];
  let x = 0, s = seed;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  while (x < width) {
    const w = 26 + Math.round(rnd() * 46), h = 50 + Math.round(rnd() * 120);
    const lit: { x: number; y: number }[] = [];
    for (let wy = 160 - h + 10; wy < 152; wy += 12) for (let wx = x + 6; wx < x + w - 6; wx += 10) if (rnd() > 0.72) lit.push({ x: wx, y: wy });
    buildings.push({ x, w, h, lit });
    x += w + 3 + Math.round(rnd() * 8);
  }
  return buildings;
}

function City({ seed, className }: { seed: number; className: string }) {
  const b = skyline(seed, 900);
  return (
    <svg className={className} viewBox="0 0 900 160" preserveAspectRatio="none" aria-hidden="true">
      {b.map((x, i) => (
        <g key={i}>
          <rect x={x.x} y={160 - x.h} width={x.w} height={x.h} />
          {x.lit.map((l, j) => <rect key={j} className={`cine-win w${(i + j) % 4}`} x={l.x} y={l.y} width="4" height="5" />)}
        </g>
      ))}
    </svg>
  );
}

/**
 * The sign-in page's left panel: a slow cinematic night drive, built from CSS and SVG (no video download). Skyline parallax,
 * moving road, passing light trails, headlight beam, bokeh, film grain and rotating captions. Every animation stops under
 * reduced motion.
 */
export function LoginCinema() {
  return (
    <div className="cine" aria-hidden="true">
      <div className="cine-sky" />
      <div className="cine-bokeh">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div>
      <div className="cine-city cine-far"><City seed={7} className="cine-city-svg" /><City seed={7} className="cine-city-svg" /></div>
      <div className="cine-city cine-near"><City seed={31} className="cine-city-svg" /><City seed={31} className="cine-city-svg" /></div>
      <div className="cine-road"><div className="cine-lanes" /></div>
      <div className="cine-streaks">{Array.from({ length: 5 }, (_, i) => <i key={i} />)}</div>
      <div className="cine-beam" />
      <div className="cine-car"><HeroCar /></div>
      <div className="cine-grain" />
      <div className="cine-vignette" />
      <div className="cine-captions">{CAPTIONS.map((c) => <span key={c}>{c}</span>)}</div>
    </div>
  );
}
