// Canvas drawing for stone layouts, and the bitmap cache: a static piece is drawn once, then only composited.
import { GROUT, TROUGH } from "./palette";
import type { Layout, Stone, Strip } from "./stones";

export function drawStone(ctx: CanvasRenderingContext2D, s: Stone, color = s.color, alpha = s.alpha): void {
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.ellipse(s.x, s.y, s.a, s.b, s.rot, 0, 6.2832);
  ctx.fillStyle = color;
  ctx.fill();
  if (s.a > 1.6) { ctx.lineWidth = Math.min(1, s.a * 0.14 + 0.3); ctx.strokeStyle = GROUT; ctx.stroke(); }
  if (s.a > 2.2 && !s.flat) {
    ctx.beginPath();
    ctx.ellipse(s.x - s.a * 0.22, s.y - s.b * 0.3, s.a * 0.5, s.b * 0.36, s.rot, 0, 6.2832);
    ctx.fillStyle = "rgba(255,255,255,0.17)";
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawStrip(ctx: CanvasRenderingContext2D, st: Strip): void {
  ctx.beginPath();
  st.pts.forEach(([x, y], k) => { if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.lineWidth = st.w + 1.6; ctx.strokeStyle = "rgba(8,5,4,0.7)"; ctx.stroke();
  ctx.lineWidth = st.w; ctx.strokeStyle = st.color; ctx.stroke();
}

/** Stones first, strips on top in the order laid (the mockup interleaves them; strips here are outlines, so on top reads the same). */
export function drawLayout(ctx: CanvasRenderingContext2D, l: Layout): void {
  for (const s of l.stones) drawStone(ctx, s);
  for (const st of l.strips) drawStrip(ctx, st);
}

/** Draws a seamless tile: stones near an edge are repeated on the far side. */
export function drawWrapped(ctx: CanvasRenderingContext2D, stones: readonly Stone[], w: number, h: number): void {
  for (const s of stones) {
    const m = s.a + 1;
    for (const dx of [-w, 0, w]) {
      for (const dy of [-h, 0, h]) {
        const x = s.x + dx, y = s.y + dy;
        if (x + m < 0 || x - m > w || y + m < 0 || y - m > h) continue;
        drawStone(ctx, { ...s, x, y });
      }
    }
  }
}

export function troughPath(ctx: CanvasRenderingContext2D, poly: readonly (readonly [number, number])[]): void {
  ctx.beginPath();
  poly.forEach(([x, y], i) => { if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  ctx.closePath();
}

export function fillTrough(ctx: CanvasRenderingContext2D, poly: readonly (readonly [number, number])[]): void {
  ctx.fillStyle = TROUGH;
  troughPath(ctx, poly);
  ctx.fill();
}

/** A solid underlay, so the gaps between stones are the piece's own ground and not whatever is behind it. */
export function fillShape(ctx: CanvasRenderingContext2D, poly: readonly (readonly [number, number])[], color: string): void {
  troughPath(ctx, poly);
  ctx.fillStyle = color;
  ctx.fill();
}

// ---- bitmap cache ----
const MAX_BITMAPS = 96;
const bitmaps = new Map<string, HTMLCanvasElement>();

export function newCanvas(w: number, h: number, dpr: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(w * dpr)); canvas.height = Math.max(1, Math.ceil(h * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(dpr, dpr);
  return { canvas, ctx };
}

/** Draws once per (key, size, dpr), then hands back the same bitmap. `draw` works in CSS pixels. */
export function cachedBitmap(key: string, w: number, h: number, dpr: number, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement | null {
  const k = `${key}|${String(w)}x${String(h)}@${String(dpr)}`, hit = bitmaps.get(k);
  if (hit) { bitmaps.delete(k); bitmaps.set(k, hit); return hit; }
  const made = newCanvas(w, h, dpr);
  if (!made) return null;
  draw(made.ctx);
  bitmaps.set(k, made.canvas);
  if (bitmaps.size > MAX_BITMAPS) { const oldest = bitmaps.keys().next(); if (!oldest.done) bitmaps.delete(oldest.value); }
  return made.canvas;
}

export const bitmapCacheSize = (): number => bitmaps.size;
export const clearBitmapCache = (): void => { bitmaps.clear(); };

/** SVG text of a layout, for the favicon. Same stones as the canvas, no highlight on tiny ones. */
export function layoutToSvg(l: Layout): string {
  const f = (n: number): number => Math.round(n * 10) / 10;
  let o = "";
  for (const s of l.stones) {
    const t = s.a / s.b > 1.08 ? ` transform="rotate(${String(Math.round((s.rot * 180) / Math.PI))} ${String(f(s.x))} ${String(f(s.y))})"` : "";
    o += `<ellipse cx="${String(f(s.x))}" cy="${String(f(s.y))}" rx="${String(f(s.a))}" ry="${String(f(s.b))}" fill="${s.color}"${s.alpha < 1 ? ` opacity="${String(s.alpha)}"` : ""}${t}/>`;
  }
  for (const st of l.strips) {
    const d = st.pts.map(([x, y], k) => `${k ? "L" : "M"}${String(f(x))} ${String(f(y))}`).join("");
    o += `<path d="${d}" fill="none" stroke="${st.color}" stroke-width="${String(st.w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  return o;
}
