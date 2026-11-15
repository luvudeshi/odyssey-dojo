// The Obsidian Rift's molten textures, painted once on a small canvas when the HUD first loads and then used as plain
// background images. Nothing here runs per frame: the bars only slide these images (transform) and cut them (clip).
import { rng } from "./geometry";

/** The baked textures as image URLs, empty where there is no canvas (server rendering, tests). */
export interface RiftTextures { readonly lava: string; readonly hot: string; readonly slag: string }
/** Width of one tile; the CSS drift moves the flow by exactly this much so the loop has no seam. */
export const TILE = 512;
const H = 48;
const NONE: RiftTextures = { lava: "", hot: "", slag: "" };
let baked: RiftTextures | null = null;

type Stops = readonly (readonly [number, string])[];
const LIVE: Stops = [[0, "#8a1804"], [0.12, "#e04a0a"], [0.24, "#ff9a1c"], [0.33, "#ffe070"], [0.4, "#fff6cc"], [0.47, "#ffd040"], [0.6, "#ff7a10"], [0.8, "#c8300a"], [1, "#5a0e04"]];
const HOT: Stops = [[0, "#5a0804"], [0.2, "#b01408"], [0.4, "#ff4a1a"], [0.5, "#ff6a2a"], [0.7, "#c01a08"], [1, "#4a0604"]];

/** Floating crust: dark cooled skins with hot edges, drawn twice so the tile wraps. */
function crust(ctx: CanvasRenderingContext2D, seed: number, n: number, size: number, skin: string, edge: string): void {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * TILE, top = r() < 0.3, y = top ? H * (0.04 + r() * 0.14) : H * (0.52 + r() * 0.44);
    const ru = size * (0.6 + r() * 0.9) * 1.6, rv = Math.min(ru * 0.36, H * 0.16), pts: [number, number][] = [];
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + r() * 0.45, m = 0.65 + r() * 0.35; pts.push([Math.cos(a) * ru * m, Math.sin(a) * rv * m]); }
    for (const dx of [x - TILE, x, x + TILE]) {
      const path = (k: number): void => { ctx.beginPath(); pts.forEach(([px, py], j) => { if (j === 0) ctx.moveTo(dx + px * k, y + py * k); else ctx.lineTo(dx + px * k, y + py * k); }); ctx.closePath(); };
      path(1);
      ctx.lineWidth = 3; ctx.strokeStyle = edge; ctx.globalAlpha = 0.45; ctx.stroke();
      ctx.globalAlpha = 0.92; ctx.fillStyle = skin; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = edge; ctx.stroke();
      path(0.55); ctx.globalAlpha = 0.6; ctx.fillStyle = "#1a0603"; ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

function melt(ctx: CanvasRenderingContext2D, stops: Stops, seed: number, plates: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  for (const [at, c] of stops) g.addColorStop(at, c);
  ctx.fillStyle = g; ctx.fillRect(0, 0, TILE, H);
  const r = rng(seed);
  // soft hot blooms and darker patches, so the melt is not a flat stripe
  for (let i = 0; i < 26; i++) {
    const x = r() * TILE, y = H * (0.2 + r() * 0.6), rad = 10 + r() * 26, hot = r() < 0.55;
    for (const dx of [x - TILE, x, x + TILE]) {
      const b = ctx.createRadialGradient(dx, y, 0, dx, y, rad);
      b.addColorStop(0, hot ? "rgba(255, 240, 170, 0.5)" : "rgba(120, 16, 2, 0.45)");
      b.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = b; ctx.fillRect(dx - rad, y - rad, rad * 2, rad * 2);
    }
  }
  // fast bright streaks along the flow
  ctx.strokeStyle = "#fff6d0"; ctx.lineCap = "round";
  for (let i = 0; i < 40; i++) {
    const x = r() * TILE, y = H * (0.22 + r() * 0.36), len = 10 + r() * 34;
    ctx.globalAlpha = 0.3 + r() * 0.5; ctx.lineWidth = 0.6 + r() * 1.4;
    for (const dx of [x - TILE, x]) { ctx.beginPath(); ctx.moveTo(dx, y); ctx.lineTo(dx + len, y + (r() - 0.5) * 2); ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
  crust(ctx, seed + 1, plates, 7, stops === HOT ? "#3a0c05" : "#5a1c0a", stops === HOT ? "#ff4a12" : "#ffa030");
}

function slag(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#1e1614"); g.addColorStop(0.5, "#0e0907"); g.addColorStop(1, "#050303");
  ctx.fillStyle = g; ctx.fillRect(0, 0, TILE, H);
  crust(ctx, 9, 16, 8, "#2a1d18", "#6a1c0a");
  const r = rng(13);
  ctx.strokeStyle = "#8a2208"; ctx.lineWidth = 1; ctx.globalAlpha = 0.7;
  ctx.beginPath();
  let y = H / 2; ctx.moveTo(0, y);
  for (let x = 0; x <= TILE; x += 6 + r() * 8) { y = H / 2 + (r() - 0.5) * H * 0.35; ctx.lineTo(x, y); }
  ctx.lineTo(TILE, H / 2); ctx.stroke(); ctx.globalAlpha = 1;
}

function paint(draw: (ctx: CanvasRenderingContext2D) => void): string {
  const c = document.createElement("canvas");
  c.width = TILE; c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  draw(ctx);
  return c.toDataURL("image/png");
}

/** Paints the three textures the first time it is asked, then hands back the same URLs. */
export function riftTextures(): RiftTextures {
  if (baked) return baked;
  if (typeof document === "undefined") return NONE;
  baked = { lava: paint((c) => { melt(c, LIVE, 23, 13); }), hot: paint((c) => { melt(c, HOT, 41, 22); }), slag: paint(slag) };
  return baked;
}

/** Puts the textures on the page root as CSS variables (--rift-lava, --rift-hot, --rift-slag) for the stylesheets. */
export function installRiftTextures(): void {
  const t = riftTextures();
  if (!t.lava) return;
  const s = document.documentElement.style;
  s.setProperty("--rift-lava", `url("${t.lava}")`);
  s.setProperty("--rift-hot", `url("${t.hot}")`);
  s.setProperty("--rift-slag", `url("${t.slag}")`);
}
