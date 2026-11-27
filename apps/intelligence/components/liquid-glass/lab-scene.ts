import type { ScenePainter } from "@/lib/liquid-glass/engine";

/**
 * The prototype's background: the "page" behind the glass, painted into the engine's scene canvas every frame.
 * Editorial type, a listing ticker, live charts and an inventory table scroll with the page; a few solid objects drift
 * independently. Crisp edges and type are deliberate: refraction is only legible against detail, not over soft gradients.
 */

export const SCENE_HEIGHT = 3000;

type Palette = { bg: string; ink: string; muted: string; line: string; band: string; bandInk: string; dim: string; objects: string[] };

const DARK: Palette = {
  bg: "#0b0e0d", ink: "#eef3f1", muted: "#7f8c87", line: "#1f2624", band: "#eef3f1", bandInk: "#0b0e0d", dim: "rgba(3,6,5,0.55)",
  objects: ["#34d399", "#4aa8ff", "#f5b544", "#ff8a80", "#b79cff"],
};
const LIGHT: Palette = {
  bg: "#f3f5f4", ink: "#0f1514", muted: "#66726e", line: "#dbe2df", band: "#0f1514", bandInk: "#f3f5f4", dim: "rgba(15,21,20,0.28)",
  objects: ["#047857", "#1d6fd8", "#c98a0b", "#d4483d", "#6a4fd0"],
};

const LISTINGS = [
  "2021 Hyundai Creta SX(O) · ₹14.2L · 38,400 km",
  "2019 Maruti Swift VXi · ₹5.9L · 52,100 km",
  "2022 Tata Nexon EV Max · ₹16.8L · 21,900 km",
  "2020 Honda City ZX CVT · ₹11.4L · 44,300 km",
  "2018 Toyota Innova Crysta · ₹17.6L · 88,000 km",
  "2023 Mahindra XUV700 AX7 · ₹23.9L · 12,600 km",
  "2021 Kia Seltos HTX · ₹13.1L · 35,200 km",
];

const ROWS = [
  ["VL-2041", "Hyundai Creta SX(O)", "2021", "Diesel", "38,400", "₹14.20L", "+3.1%", "12d"],
  ["VL-2038", "Maruti Baleno Alpha", "2020", "Petrol", "41,800", "₹6.75L", "−1.4%", "27d"],
  ["VL-2035", "Tata Nexon EV Max", "2022", "Electric", "21,900", "₹16.80L", "+5.6%", "6d"],
  ["VL-2031", "Honda City ZX CVT", "2020", "Petrol", "44,300", "₹11.40L", "+0.8%", "19d"],
  ["VL-2029", "Toyota Innova Crysta", "2018", "Diesel", "88,000", "₹17.60L", "−2.2%", "41d"],
  ["VL-2026", "Mahindra XUV700 AX7", "2023", "Diesel", "12,600", "₹23.90L", "+4.0%", "3d"],
  ["VL-2022", "Kia Seltos HTX", "2021", "Petrol", "35,200", "₹13.10L", "+1.9%", "15d"],
  ["VL-2019", "Skoda Kushaq Style", "2022", "Petrol", "18,700", "₹14.60L", "+2.7%", "9d"],
  ["VL-2015", "Maruti Ertiga ZXi+", "2019", "CNG", "67,300", "₹8.10L", "−0.6%", "33d"],
  ["VL-2012", "MG Hector Sharp", "2021", "Petrol", "29,800", "₹15.30L", "+1.1%", "22d"],
];

export function createLabScene(getState: () => { theme: "dark" | "light"; dim: number }): ScenePainter {
  let tickerX = 0;
  return (ctx, { width: W, height: H, time: t, dt, scrollY }) => {
    const { theme, dim } = getState();
    const P = theme === "light" ? LIGHT : DARK;
    const font = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, W, H);
    const y0 = -scrollY;
    const narrow = W < 720;
    const pad = narrow ? 20 : 64;

    // Fine grid, scrolls with the page.
    ctx.strokeStyle = P.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const gs = 48, gy = ((y0 % gs) + gs) % gs;
    for (let x = 0.5; x < W; x += gs) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = gy + 0.5; y < H; y += gs) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    // Drifting solid objects (viewport-fixed, independent of scroll).
    const objs = [
      { r: 0.11, ax: 0.38, ay: 0.32, fx: 0.11, fy: 0.17, ph: 0, shape: "circle" },
      { r: 0.07, ax: 0.42, ay: 0.36, fx: 0.07, fy: 0.13, ph: 2.1, shape: "square" },
      { r: 0.05, ax: 0.30, ay: 0.40, fx: 0.15, fy: 0.09, ph: 4.2, shape: "circle" },
      { r: 0.09, ax: 0.45, ay: 0.28, fx: 0.05, fy: 0.11, ph: 1.3, shape: "ring" },
      { r: 0.04, ax: 0.36, ay: 0.42, fx: 0.19, fy: 0.07, ph: 5.0, shape: "square" },
    ];
    const m = Math.min(W, H);
    objs.forEach((o, i) => {
      const x = W * (0.5 + o.ax * Math.sin(t * o.fx * 2 + o.ph));
      const y = H * (0.5 + o.ay * Math.cos(t * o.fy * 2 + o.ph * 1.3));
      const r = m * o.r;
      ctx.fillStyle = P.objects[i];
      ctx.strokeStyle = P.objects[i];
      if (o.shape === "circle") { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
      else if (o.shape === "ring") { ctx.lineWidth = r * 0.28; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }
      else { ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.25 + o.ph); roundRect(ctx, -r, -r, r * 2, r * 2, r * 0.22); ctx.fill(); ctx.restore(); }
    });

    // Hero type.
    ctx.fillStyle = P.ink;
    ctx.textBaseline = "alphabetic";
    const hs = narrow ? Math.min(52, W * 0.1) : Math.min(132, W * 0.095);
    ctx.font = `600 ${hs}px ${font}`;
    ctx.fillText("Market evidence,", pad, y0 + 250);
    ctx.fillStyle = P.muted;
    ctx.fillText("in motion.", pad, y0 + 250 + hs * 1.05);
    ctx.font = `500 ${narrow ? 15 : 19}px ${font}`;
    ctx.fillStyle = P.ink;
    wrap(ctx, "Every price, every listing, every lead — measured live across Indian used-car markets.", pad, y0 + 250 + hs * 1.05 + 56, W - pad * 2, narrow ? 22 : 28);

    // Listing ticker band.
    const by = y0 + 560;
    if (by > -120 && by < H + 40) {
      ctx.fillStyle = P.band;
      ctx.fillRect(0, by, W, 72);
      ctx.fillStyle = P.bandInk;
      ctx.font = `600 ${narrow ? 18 : 24}px ${font}`;
      tickerX -= dt * 60;
      const text = LISTINGS.join("     ◆     ") + "     ◆     ";
      const tw = ctx.measureText(text).width;
      if (tickerX < -tw) tickerX += tw;
      for (let x = tickerX; x < W; x += tw) ctx.fillText(text, x, by + 46);
    }

    // Charts: bars and a price line.
    const cy = y0 + 760;
    if (cy > -520 && cy < H + 20) {
      ctx.fillStyle = P.muted;
      ctx.font = `600 13px ${font}`;
      ctx.fillText("WEEKLY DEMAND INDEX · PUNE · DELHI NCR · BENGALURU", pad, cy);
      const cw = W - pad * 2, ch = 300, base = cy + 40 + ch;
      const nb = narrow ? 14 : 28, bw = cw / nb;
      for (let i = 0; i < nb; i++) {
        const v = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(i * 0.7 + t * 0.9)) * (0.6 + 0.4 * Math.sin(i * 0.31 + 1.2));
        ctx.fillStyle = i % 7 === 3 ? P.objects[1] : i % 5 === 1 ? P.objects[0] : P.ink;
        ctx.globalAlpha = i % 7 === 3 || i % 5 === 1 ? 1 : 0.85;
        ctx.fillRect(pad + i * bw + bw * 0.18, base - v * ch, bw * 0.64, v * ch);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = P.objects[2];
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let x = 0; x <= cw; x += 8) {
        const yv = base - ch * (0.55 + 0.25 * Math.sin(x / cw * 9 + t * 0.6) * Math.cos(x / cw * 3.1 - t * 0.3));
        if (x === 0) ctx.moveTo(pad + x, yv); else ctx.lineTo(pad + x, yv);
      }
      ctx.stroke();
      ctx.fillStyle = P.line;
      ctx.fillRect(pad, base + 2, cw, 2);
    }

    // Inventory table.
    const ty = y0 + 1260;
    if (ty > -900 && ty < H + 20) {
      ctx.fillStyle = P.ink;
      ctx.font = `600 ${narrow ? 28 : 40}px ${font}`;
      ctx.fillText("Inventory at a glance", pad, ty);
      const cols = narrow ? [0, 1, 5] : [0, 1, 2, 3, 4, 5, 6, 7];
      const widths = [0.1, 0.28, 0.08, 0.11, 0.11, 0.12, 0.1, 0.1];
      const tw = W - pad * 2;
      const head = ["Stock", "Vehicle", "Year", "Fuel", "Km", "Ask", "vs market", "Age"];
      const rowH = 54;
      const drawRow = (cells: string[], y: number, bold: boolean, stripe: boolean) => {
        if (stripe) { ctx.fillStyle = P.line; ctx.fillRect(pad - 12, y - 34, tw + 24, rowH); }
        let x = pad;
        const totalW = cols.reduce((a, c) => a + widths[c], 0);
        cols.forEach((c) => {
          const v = cells[c];
          ctx.font = `${bold ? 600 : c === 1 ? 600 : 500} ${narrow ? 14 : 17}px ${font}`;
          ctx.fillStyle = !bold && c === 6 ? (v.startsWith("+") ? P.objects[0] : P.objects[3]) : bold ? P.muted : P.ink;
          ctx.fillText(v, x, y);
          x += (widths[c] / totalW) * tw;
        });
      };
      drawRow(head, ty + 60, true, false);
      ROWS.forEach((r, i) => drawRow(r, ty + 60 + (i + 1) * rowH, false, i % 2 === 0));
    }

    // Diagonal stripe field: dense straight lines, the clearest proof of refraction.
    const sy = y0 + 2000;
    if (sy > -620 && sy < H) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, sy, W, 560); ctx.clip();
      ctx.strokeStyle = P.ink; ctx.lineWidth = 6;
      ctx.beginPath();
      for (let x = -600 + ((t * 20) % 28); x < W + 600; x += 28) { ctx.moveTo(x, sy); ctx.lineTo(x + 560, sy + 560); }
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = P.bg;
      ctx.fillRect(pad, sy + 200, narrow ? W - pad * 2 : 620, 150);
      ctx.fillStyle = P.ink;
      ctx.font = `600 ${narrow ? 34 : 64}px ${font}`;
      ctx.fillText("Refraction test", pad + 24, sy + 300);
    }

    // Footer type.
    const fy = y0 + 2780;
    if (fy > -40 && fy < H + 120) {
      ctx.fillStyle = P.muted;
      ctx.font = `600 ${narrow ? 40 : 96}px ${font}`;
      ctx.fillText("VandLabs", pad, fy);
    }

    if (dim > 0.001) { ctx.globalAlpha = dim; ctx.fillStyle = P.dim; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number) {
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? line + " " + word : word;
    if (ctx.measureText(next).width > max && line) { ctx.fillText(line, x, y); line = word; y += lh; } else line = next;
  }
  if (line) ctx.fillText(line, x, y);
}
