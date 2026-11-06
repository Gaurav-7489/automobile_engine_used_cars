import type { PostFormat } from "@/lib/social-post";

/** Browser-only: draws post images on a canvas. Photos are loaded through a same-origin route so the canvas can be exported. */

export type PostTheme = "dark" | "light";
export type SlideKind = "hero" | "photo" | "details";
export type SlideSpec = {
  kind: SlideKind;
  photo: HTMLImageElement | null;
  thumbs: (HTMLImageElement | null)[];
  index: number;
  count: number;
};
export type PostContent = {
  dealer: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  price: string;
  chips: string[];
  facts: { label: string; value: string }[];
  city: string;
  phone: string;
  linkLabel: string;
  stockId: string;
  ribbon: string;
};

const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const font = (weight: number, size: number) => `${weight} ${Math.round(size)}px ${FONT}`;

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Draws an image to cover the box (like CSS object-fit: cover). */
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale, sh = h / scale;
  const sx = (img.naturalWidth - sw) / 2, sy = (img.naturalHeight - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/** A labelled schematic when the vehicle has no usable photo. Never presented as photography. */
function placeholder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, accent: string) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, "#1b2422");
  g.addColorStop(1, "#0b0f0e");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  const s = Math.min(w / 520, h / 260) * 0.8;
  ctx.save();
  ctx.translate(x + w / 2 - 260 * s, y + h / 2 - 120 * s);
  ctx.scale(s, s);
  ctx.lineWidth = 2 / s;
  ctx.strokeStyle = accent;
  ctx.fillStyle = "#3a4643";
  ctx.beginPath(); ctx.moveTo(36, 150); ctx.lineTo(48, 116); ctx.lineTo(136, 90); ctx.lineTo(200, 48); ctx.lineTo(328, 48); ctx.lineTo(390, 88); ctx.lineTo(474, 106); ctx.lineTo(484, 150); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#0b111c";
  ctx.beginPath(); ctx.moveTo(148, 98); ctx.lineTo(196, 64); ctx.lineTo(314, 64); ctx.lineTo(358, 98); ctx.closePath(); ctx.fill(); ctx.stroke();
  for (const cx of [132, 388]) { ctx.fillStyle = "#080b12"; ctx.beginPath(); ctx.arc(cx, 152, 30, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#9aa7bd"; ctx.beginPath(); ctx.arc(cx, 152, 13, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

function photoOrPlaceholder(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, x: number, y: number, w: number, h: number, accent: string) {
  if (img) cover(ctx, img, x, y, w, h);
  else placeholder(ctx, x, y, w, h, accent);
}

/** Wraps text into at most `maxLines` lines, shrinking the font until it fits. Returns the lines and the size used. */
function fitText(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, maxWidth: number, maxLines: number, min = size * 0.55): { lines: string[]; size: number } {
  for (let s = size; s >= min; s -= 2) {
    ctx.font = font(weight, s);
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth) line = next;
      else { if (line) lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxWidth)) return { lines, size: s };
  }
  ctx.font = font(weight, min);
  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth * maxLines) clipped = clipped.slice(0, -1);
  return { lines: [clipped.length < text.length ? `${clipped}…` : clipped], size: min };
}

function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, bg: string, fg: string, align: "left" | "right" = "left"): number {
  ctx.font = font(600, size);
  const padX = size * 0.75, h = size * 2.1;
  const w = ctx.measureText(text).width + padX * 2;
  const left = align === "right" ? x - w : x;
  ctx.fillStyle = bg;
  roundRect(ctx, left, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.fillText(text, left + padX, y + h / 2 + size * 0.04);
  ctx.textBaseline = "alphabetic";
  return w;
}

/** A row of chips that wraps; returns the height used. */
function chipRow(ctx: CanvasRenderingContext2D, chips: string[], x: number, y: number, maxWidth: number, size: number, bg: string, fg: string): number {
  const gap = size * 0.6, h = size * 2.1;
  let cx = x, cy = y;
  for (const chip of chips) {
    ctx.font = font(600, size);
    const w = ctx.measureText(chip).width + size * 1.5;
    if (cx + w > x + maxWidth && cx > x) { cx = x; cy += h + gap; }
    pill(ctx, chip, cx, cy, size, bg, fg);
    cx += w + gap;
  }
  return cy - y + h;
}

function brandMark(ctx: CanvasRenderingContext2D, dealer: string, x: number, y: number, size: number) {
  if (dealer) pill(ctx, dealer.toUpperCase(), x, y, size, "rgba(10, 14, 13, 0.62)", "#ffffff");
}

function shade(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, from: number, to: number, top = false) {
  const g = ctx.createLinearGradient(0, top ? y + h : y, 0, top ? y : y + h);
  g.addColorStop(0, `rgba(6, 9, 8, ${from})`);
  g.addColorStop(1, `rgba(6, 9, 8, ${to})`);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

const palette = (theme: PostTheme) => (theme === "dark"
  ? { bg: "#0c1110", panel: "#141b19", text: "#ffffff", muted: "rgba(255,255,255,0.68)", line: "rgba(255,255,255,0.14)", chipBg: "rgba(255,255,255,0.12)" }
  : { bg: "#f6f8f7", panel: "#ffffff", text: "#0f1514", muted: "#505d59", line: "rgba(15,21,20,0.12)", chipBg: "rgba(15,21,20,0.07)" });

export function drawSlide(canvas: HTMLCanvasElement, format: PostFormat, slide: SlideSpec, content: PostContent, theme: PostTheme, accent: string) {
  const W = format.width, H = format.height;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const u = Math.min(W, H) / 1080;
  const pad = 64 * u;
  const p = palette(theme);
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";

  if (format.id === "landscape" && slide.kind !== "photo") return drawLandscape(ctx, W, H, slide, content, theme, accent);

  if (slide.kind === "details") {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, W, H);
    // Laid out bottom-up so every format fits: call to action, footer, facts, price and title, then photos in what remains.
    const gap = 16 * u;
    const ctaH = 140 * u, ctaY = H - pad - ctaH;
    ctx.fillStyle = accent;
    roundRect(ctx, pad, ctaY, W - pad * 2, ctaH, 28 * u);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    const callText = fitText(ctx, content.phone ? `Call / WhatsApp ${content.phone}` : `Enquire with ${content.dealer || "us"}`, 800, 40 * u, W - pad * 2 - 72 * u, 1, 24 * u);
    ctx.font = font(800, callText.size);
    ctx.fillText(callText.lines[0], pad + 36 * u, ctaY + 62 * u);
    const link = fitText(ctx, content.linkLabel ? `Details: ${content.linkLabel}` : "Photos and full details: link in caption", 600, 26 * u, W - pad * 2 - 72 * u, 1, 16 * u);
    ctx.font = font(600, link.size);
    ctx.fillText(link.lines[0], pad + 36 * u, ctaY + 108 * u);
    let bottom = ctaY - 28 * u;
    ctx.fillStyle = p.muted;
    ctx.font = font(500, 22 * u);
    ctx.fillText([content.dealer, content.city, `Ref ${content.stockId}`].filter(Boolean).join(" · "), pad, bottom);
    bottom -= 22 * u + 24 * u;
    // Facts grid.
    const cols = W / H >= 0.8 ? 3 : 2;
    const cw = (W - pad * 2 - gap * (cols - 1)) / cols, ch = 96 * u;
    const rows = Math.ceil(content.facts.length / cols);
    const gridTop = bottom - (rows * ch + (rows - 1) * gap);
    content.facts.forEach((f, i) => {
      const fx = pad + (i % cols) * (cw + gap), fy = gridTop + Math.floor(i / cols) * (ch + gap);
      ctx.fillStyle = p.panel;
      roundRect(ctx, fx, fy, cw, ch, 20 * u);
      ctx.fill();
      ctx.strokeStyle = p.line;
      ctx.lineWidth = 2 * u;
      ctx.stroke();
      ctx.fillStyle = p.muted;
      ctx.font = font(600, 20 * u);
      ctx.fillText(f.label.toUpperCase(), fx + 22 * u, fy + 36 * u);
      const v = fitText(ctx, f.value, 700, 30 * u, cw - 44 * u, 1, 18 * u);
      ctx.fillStyle = p.text;
      ctx.font = font(700, v.size);
      ctx.fillText(v.lines[0], fx + 22 * u, fy + 74 * u);
    });
    // Price and title above the grid.
    let y = gridTop - 36 * u;
    ctx.fillStyle = accent;
    ctx.font = font(800, 60 * u);
    ctx.fillText(content.price, pad, y);
    y -= 60 * u + 20 * u;
    const t = fitText(ctx, content.title, 800, 56 * u, W - pad * 2, 2, 34 * u);
    ctx.fillStyle = p.text;
    ctx.font = font(800, t.size);
    for (let i = t.lines.length - 1; i >= 0; i -= 1) { ctx.fillText(t.lines[i], pad, y); y -= t.size * 1.1; }
    ctx.fillStyle = accent;
    ctx.font = font(700, 24 * u);
    ctx.fillText(content.eyebrow.toUpperCase(), pad, y - 2 * u);
    // Photo strip in the remaining space (skipped when there is too little room).
    const stripH = y - 24 * u - 30 * u - pad;
    if (stripH >= 140 * u) {
      const thumbs = slide.thumbs.length ? slide.thumbs.slice(0, 3) : [null];
      const tw = (W - pad * 2 - (thumbs.length - 1) * gap) / thumbs.length;
      thumbs.forEach((img, i) => {
        const tx = pad + i * (tw + gap);
        ctx.save();
        roundRect(ctx, tx, pad, tw, stripH, 24 * u);
        ctx.clip();
        photoOrPlaceholder(ctx, img, tx, pad, tw, stripH, accent);
        ctx.restore();
      });
    } else brandMark(ctx, content.dealer, pad, pad, 24 * u);
    return;
  }

  // Full-bleed photo for hero and photo slides.
  photoOrPlaceholder(ctx, slide.photo, 0, 0, W, H, accent);
  shade(ctx, 0, 0, W, H * 0.22, 0.55, 0, false);
  brandMark(ctx, content.dealer, pad, pad, 24 * u);

  if (slide.kind === "photo") {
    shade(ctx, 0, H * 0.7, W, H * 0.3, 0, 0.75);
    if (slide.count > 1) pill(ctx, `${slide.index + 1} / ${slide.count}`, W - pad, pad, 24 * u, "rgba(10, 14, 13, 0.62)", "#ffffff", "right");
    ctx.fillStyle = "#ffffff";
    ctx.font = font(800, 44 * u);
    const t = fitText(ctx, content.title, 800, 44 * u, W - pad * 2 - 140 * u, 1, 26 * u);
    ctx.font = font(800, t.size);
    ctx.fillText(t.lines[0], pad, H - pad - 48 * u);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = font(700, 34 * u);
    ctx.fillText(content.price, pad, H - pad);
    if (slide.index < slide.count - 1) {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = font(700, 26 * u);
      ctx.textAlign = "right";
      ctx.fillText("Swipe →", W - pad, H - pad);
      ctx.textAlign = "left";
    }
    return;
  }

  // Hero.
  if (content.ribbon) pill(ctx, content.ribbon, W - pad, pad, 24 * u, accent, "#ffffff", "right");
  const panelTop = H * (format.id === "story" ? 0.5 : 0.4);
  shade(ctx, 0, panelTop, W, H - panelTop, 0, 0.92);
  let y = H - pad;
  // Footer line.
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  const footer = [content.city ? `📍 ${content.city}` : "", content.phone ? `📞 ${content.phone}` : "", `Ref ${content.stockId}`].filter(Boolean).join("  ·  ");
  const f = fitText(ctx, footer, 600, 26 * u, W - pad * 2, 1, 18 * u);
  ctx.font = font(600, f.size);
  ctx.fillText(f.lines[0], pad, y);
  y -= 26 * u + 30 * u;
  // Chips (measure first, then draw above the footer).
  ctx.font = font(600, 26 * u);
  let rows = 1, cx = 0;
  for (const chip of content.chips) { const w = ctx.measureText(chip).width + 26 * u * 1.5; if (cx + w > W - pad * 2 && cx > 0) { rows += 1; cx = 0; } cx += w + 26 * u * 0.6; }
  const chipH = rows * 26 * u * 2.1 + (rows - 1) * 26 * u * 0.6;
  y -= chipH;
  chipRow(ctx, content.chips, pad, y, W - pad * 2, 26 * u, "rgba(255,255,255,0.16)", "#ffffff");
  y -= 36 * u;
  // Price on a solid badge so it reads over any photo.
  ctx.font = font(800, 64 * u);
  const priceW = ctx.measureText(content.price).width + 48 * u, priceH = 96 * u;
  ctx.fillStyle = accent;
  roundRect(ctx, pad, y - priceH, priceW, priceH, 22 * u);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(content.price, pad + 24 * u, y - priceH / 2 + 22 * u);
  y -= priceH + 30 * u;
  // Title (bottom-up).
  const t = fitText(ctx, content.title, 800, (format.id === "story" ? 84 : 72) * u, W - pad * 2, 2);
  ctx.fillStyle = "#ffffff";
  ctx.font = font(800, t.size);
  for (let i = t.lines.length - 1; i >= 0; i -= 1) { ctx.fillText(t.lines[i], pad, y); y -= t.size * 1.08; }
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = font(700, 28 * u);
  ctx.fillText(content.eyebrow.toUpperCase(), pad, y - 4 * u);
}

function drawLandscape(ctx: CanvasRenderingContext2D, W: number, H: number, slide: SlideSpec, content: PostContent, theme: PostTheme, accent: string) {
  const p = palette(theme);
  const u = H / 628;
  const photoW = Math.round(W * 0.56);
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, W, H);
  photoOrPlaceholder(ctx, slide.photo ?? slide.thumbs[0] ?? null, 0, 0, photoW, H, accent);
  pill(ctx, content.dealer.toUpperCase(), 28 * u, 28 * u, 18 * u, "rgba(10, 14, 13, 0.62)", "#ffffff");
  if (content.ribbon) pill(ctx, content.ribbon, photoW - 28 * u, 28 * u, 18 * u, accent, "#ffffff", "right");
  const x = photoW + 44 * u, maxW = W - x - 40 * u;
  let y = 76 * u;
  ctx.fillStyle = accent;
  ctx.font = font(700, 18 * u);
  ctx.fillText(content.eyebrow.toUpperCase(), x, y);
  const t = fitText(ctx, content.title, 800, 44 * u, maxW, 3, 26 * u);
  ctx.fillStyle = p.text;
  ctx.font = font(800, t.size);
  for (const line of t.lines) { y += t.size * 1.12; ctx.fillText(line, x, y); }
  y += 62 * u;
  ctx.fillStyle = accent;
  ctx.font = font(800, 46 * u);
  ctx.fillText(content.price, x, y);
  y += 28 * u;
  const used = chipRow(ctx, content.chips, x, y, maxW, 18 * u, p.chipBg, p.text);
  y += used + 30 * u;
  const ctaH = 70 * u, ctaY = H - 40 * u - ctaH;
  ctx.fillStyle = accent;
  roundRect(ctx, x, ctaY, maxW, ctaH, 16 * u);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  const cta = fitText(ctx, content.phone ? `Call / WhatsApp ${content.phone}` : "View photos and full details", 800, 24 * u, maxW - 40 * u, 1, 16 * u);
  ctx.font = font(800, cta.size);
  ctx.fillText(cta.lines[0], x + 20 * u, ctaY + ctaH / 2 + cta.size * 0.35);
  ctx.fillStyle = p.muted;
  const foot = fitText(ctx, `${content.city ? `${content.city} · ` : ""}Ref ${content.stockId}`, 500, 18 * u, maxW, 1, 12 * u);
  ctx.font = font(500, foot.size);
  ctx.fillText(foot.lines[0], x, Math.min(y, ctaY - 18 * u));
}

export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92));
}
