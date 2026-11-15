// The Multiplayer screen's textures in the Obsidian Rift look of the fight HUD: a hall of faceted black glass with lava
// seams, glowing veins for the slabs, and a molten surface for the main buttons. Each is painted once on a canvas the
// first time the screen opens and set on the page root as a CSS image (--mp-hall, --mp-veins, --mp-melt); nothing
// here runs per frame.
import { makeRng } from "../ui/pebble/stones";

type Rng = () => number;
type P = readonly [number, number];

/** Black glass with a cold violet sheen (the same family as the fight HUD's slabs). */
export const GLASS = ["#1a1622", "#0d0b12", "#231d2e", "#09080c", "#16121c", "#2c2538"] as const;
const pick = (r: Rng): string => GLASS[Math.floor(r() * GLASS.length)] ?? "#0d0b12";

function canvas(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  return ctx ? { c, ctx } : null;
}

function path(ctx: CanvasRenderingContext2D, pts: readonly P[], close: boolean): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => { if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  if (close) ctx.closePath();
}

/** A lava crack: a wide soft glow, a hot line, a white-hot core. */
export function lavaLine(ctx: CanvasRenderingContext2D, pts: readonly P[], width = 1): void {
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  for (const [w, colour, alpha] of [[7, "#ff4a0a", 0.22], [3.4, "#ff7a14", 0.6], [1.4, "#ffd27a", 0.95], [0.6, "#fff6d8", 0.9]] as const) {
    path(ctx, pts, false);
    ctx.globalAlpha = alpha; ctx.lineWidth = w * width; ctx.strokeStyle = colour; ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** A jagged walk from `a` towards `b` in `n` steps, wandering by `wander` px. */
export function jag(r: Rng, a: P, b: P, n: number, wander: number): P[] {
  const out: P[] = [a];
  for (let k = 1; k < n; k++) {
    const t = k / n;
    out.push([a[0] + (b[0] - a[0]) * t + (r() - 0.5) * wander, a[1] + (b[1] - a[1]) * t + (r() - 0.5) * wander]);
  }
  out.push(b);
  return out;
}

/** The hall: a seamless tile of glass facets (a jittered grid cut into triangles) crossed by a few lava seams. */
function hall(): string {
  const W = 640, N = 10, step = W / N, made = canvas(W, W);
  if (!made) return "";
  const { c, ctx } = made, r = makeRng(41);
  const jx: number[][] = [], jy: number[][] = [];
  for (let i = 0; i < N; i++) { jx.push([]); jy.push([]); for (let j = 0; j < N; j++) { jx[i]?.push((r() - 0.5) * step * 0.7); jy[i]?.push((r() - 0.5) * step * 0.7); } }
  // Grid points wrap, so the tile has no seam.
  const at = (i: number, j: number): P => [i * step + (jx[((i % N) + N) % N]?.[((j % N) + N) % N] ?? 0), j * step + (jy[((i % N) + N) % N]?.[((j % N) + N) % N] ?? 0)];
  ctx.fillStyle = "#07060a"; ctx.fillRect(0, 0, W, W);
  for (let i = -1; i <= N; i++) for (let j = -1; j <= N; j++) {
    const a = at(i, j), b = at(i + 1, j), d = at(i, j + 1), e = at(i + 1, j + 1), flip = r() < 0.5;
    for (const tri of flip ? [[a, b, e], [a, e, d]] : [[a, b, d], [b, e, d]]) {
      path(ctx, tri, true); ctx.fillStyle = pick(r); ctx.fill();
      ctx.lineWidth = 0.8; ctx.strokeStyle = "rgba(200, 184, 240, 0.07)"; ctx.stroke();
    }
  }
  // Seams along facet edges, drawn on every side of the tile so they cross its edges cleanly.
  for (let s = 0; s < 3; s++) {
    let i = Math.floor(r() * N), j = Math.floor(r() * N);
    const pts: P[] = [at(i, j)];
    for (let k = 0; k < 7; k++) { if (r() < 0.6) i += 1; else j += r() < 0.5 ? 1 : -1; pts.push(at(i, j)); }
    for (const dx of [-W, 0, W]) for (const dy of [-W, 0, W]) lavaLine(ctx, pts.map(([x, y]): P => [x + dx, y + dy]), 0.55);
  }
  return `url("${c.toDataURL("image/png")}")`;
}

/** Veins for a slab: cracks climbing from the foot and the corners, on a clear ground. Stretched to the slab's size. */
function veins(): string {
  const W = 360, H = 560, made = canvas(W, H);
  if (!made) return "";
  const { c, ctx } = made, r = makeRng(17);
  const starts: [P, P][] = [[[30, H], [60, H - 110]], [[W * 0.6, H], [W * 0.52, H - 80]], [[W, H - 30], [W - 50, H - 120]], [[0, 80], [50, 120]], [[W, 50], [W - 55, 25]]];
  for (const [a, b] of starts) {
    const main = jag(r, a, b, 6, 26);
    lavaLine(ctx, main, 0.9);
    const from = main[3] ?? b;
    lavaLine(ctx, jag(r, from, [from[0] + (r() - 0.5) * 70, from[1] - 20 - r() * 30], 4, 12), 0.6);
  }
  return `url("${c.toDataURL("image/png")}")`;
}

/** Molten surface for the main buttons: a hot gradient, soft blooms and a few cooled crust plates. */
function melt(): string {
  const W = 256, H = 64, made = canvas(W, H);
  if (!made) return "";
  const { c, ctx } = made, r = makeRng(5), g = ctx.createLinearGradient(0, 0, 0, H);
  for (const [at, colour] of [[0, "#ffe9a0"], [0.25, "#ffc23a"], [0.55, "#ff7a10"], [0.85, "#c8300a"], [1, "#6a1204"]] as const) g.addColorStop(at, colour);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 18; i++) {
    const x = r() * W, y = H * (0.3 + r() * 0.6), rad = 8 + r() * 20, hot = r() < 0.5, b = ctx.createRadialGradient(x, y, 0, x, y, rad);
    b.addColorStop(0, hot ? "rgba(255, 246, 200, 0.45)" : "rgba(130, 20, 2, 0.35)"); b.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = b; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 7; i++) {
    const x = r() * W, y = H * (0.62 + r() * 0.3), ru = 8 + r() * 12, pts: P[] = [];
    for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; pts.push([x + Math.cos(a) * ru * (0.7 + r() * 0.3), y + Math.sin(a) * ru * 0.3]); }
    path(ctx, pts, true); ctx.globalAlpha = 0.55; ctx.fillStyle = "#5a1c0a"; ctx.fill(); ctx.globalAlpha = 1;
  }
  return `url("${c.toDataURL("image/png")}")`;
}

/** Paints the three textures once and sets them on the page root. Safe to call again. */
export function installRiftHall(): void {
  const root = document.documentElement;
  if (root.style.getPropertyValue("--mp-hall")) return;
  for (const [key, paint] of [["--mp-hall", hall], ["--mp-veins", veins], ["--mp-melt", melt]] as const) {
    const url = paint();
    if (url) root.style.setProperty(key, url);
  }
}
