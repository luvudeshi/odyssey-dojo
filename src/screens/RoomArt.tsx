// Drawn pieces of the Multiplayer screen in the Obsidian Rift look. The token is a glass gem with a lava core and a line
// icon (CSS only); `cold` gives it the ice-blue of an open place. The code frame is a tall arch of faceted black glass,
// cracked through with lava, with glass blades round its crown and a slab for a foot: painted on a canvas once per size.
import { type ReactNode, useMemo } from "react";
import { Icon, type IconName } from "../account/ui/icons";
import { PebbleCanvas } from "../ui/pebble";
import { useBoxSize } from "../ui/pebble/hooks";
import { makeRng } from "../ui/pebble/stones";
import { GLASS, jag, lavaLine } from "./riftHall";

type P = readonly [number, number];

export function RoomToken(props: { icon: IconName; size: number; cold?: boolean; className?: string }) {
  return (
    <span className={`mp-token ${props.cold ? "mp-token--cold" : ""} ${props.className ?? ""}`} style={{ width: props.size, height: props.size }} aria-hidden="true">
      <Icon name={props.icon} className="mp-token__icon" />
    </span>
  );
}

// Frame geometry, in CSS pixels: room above the arch for the blades, below it for the slab, and the rim's width.
const TOP = 54, BASE = 40, SIDE = 18, RIM = 34;

/** A point on an arch (straight sides, a half circle on top) `inset` px inside the outer arch, `t` from 0 (foot of the
 *  left side) to 1 (foot of the right side). */
function archAt(w: number, h: number, inset: number, t: number): P {
  const x0 = SIDE + inset, x1 = w - SIDE - inset, rad = (x1 - x0) / 2, cx = (x0 + x1) / 2;
  const yc = TOP + inset + rad, yb = h - BASE, side = Math.max(0, yb - yc), len = 2 * side + Math.PI * rad;
  const s = t * len;
  if (s <= side) return [x0, yb - s];
  if (s <= side + Math.PI * rad) { const a = Math.PI + (s - side) / rad; return [cx + rad * Math.cos(a), yc + rad * Math.sin(a)]; }
  return [x1, yc + (s - side - Math.PI * rad)];
}

function fill(ctx: CanvasRenderingContext2D, pts: readonly P[], colour: string): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => { if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  ctx.closePath(); ctx.fillStyle = colour; ctx.fill();
}

function stroke(ctx: CanvasRenderingContext2D, pts: readonly P[], width: number, colour: string, alpha: number): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => { if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  ctx.globalAlpha = alpha; ctx.lineWidth = width; ctx.strokeStyle = colour; ctx.lineJoin = "round"; ctx.stroke(); ctx.globalAlpha = 1;
}

function frameDraw(w: number, h: number) {
  return (ctx: CanvasRenderingContext2D): void => {
    const r = makeRng(23), n = 44, shade = (): string => GLASS[Math.floor(r() * GLASS.length)] ?? "#0d0b12";
    const outer: P[] = [], inner: P[] = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n, [ox, oy] = archAt(w, h, 0, t), [ix, iy] = archAt(w, h, RIM, t), chip = k === 0 || k === n ? 0 : (r() - 0.3) * 7;
      // Chipped glass: the outer edge pushed out a little, unevenly.
      const nx = ox - ix, ny = oy - iy, nl = Math.hypot(nx, ny) || 1;
      outer.push([ox + (nx / nl) * chip, oy + (ny / nl) * chip]);
      inner.push([ix, iy]);
    }
    // Glass blades round the crown, behind the rim.
    const cx = w / 2, crown = TOP + (w - 2 * SIDE) / 2;
    for (const [deg, len] of [[-90, 50], [-62, 40], [-118, 40], [-38, 30], [-142, 30]] as const) {
      const a = (deg * Math.PI) / 180, rad = (w - 2 * SIDE) / 2 - 6, bx = cx + rad * Math.cos(a), by = crown + rad * Math.sin(a);
      const tip: P = [bx + Math.cos(a) * len, by + Math.sin(a) * len], side = a + Math.PI / 2, half = 9;
      const blade: P[] = [[bx + Math.cos(side) * half, by + Math.sin(side) * half], tip, [bx - Math.cos(side) * half, by - Math.sin(side) * half]];
      fill(ctx, blade, "#06050a"); fill(ctx, [blade[0] ?? tip, tip, [bx, by]], "#2a2436");
      stroke(ctx, [...blade, blade[0] ?? tip], 1.2, "#c8b8f0", 0.6);
      lavaLine(ctx, [[bx, by], [bx + Math.cos(a) * len * 0.7, by + Math.sin(a) * len * 0.7]], 0.5);
    }
    // The foot: a faceted slab under the arch with a seam of lava.
    const fy = h - BASE, foot: P[] = [[SIDE - 14, fy + 4], [w - SIDE + 14, fy], [w - SIDE + 4, h - 4], [SIDE - 2, h - 2]];
    fill(ctx, foot, "#0d0b12");
    fill(ctx, [foot[0] ?? [0, 0], [cx, fy + 2], [cx + 30, h - 3], foot[3] ?? [0, 0]], "#1a1622");
    stroke(ctx, [...foot, foot[0] ?? [0, 0]], 1.3, "#c8b8f0", 0.5);
    lavaLine(ctx, jag(r, [SIDE + 10, fy + 16], [w - SIDE - 10, fy + 20], 9, 7), 0.8);
    // The rim: facets between the outer and inner edge.
    for (let k = 0; k < n; k++) {
      const a = outer[k], b = outer[k + 1], c = inner[k + 1], d = inner[k];
      if (!a || !b || !c || !d) continue;
      fill(ctx, [a, b, c], shade()); fill(ctx, [a, c, d], shade());
    }
    stroke(ctx, outer, 2.4, "#000", 0.9);
    stroke(ctx, outer, 1.3, "#c8b8f0", 0.55);
    // Light from the lava inside, leaking over the inner edge.
    stroke(ctx, inner, 8, "#ff6a10", 0.35);
    lavaLine(ctx, inner, 0.7);
    // Cracks across the rim, from the hot inside out to the edge.
    for (let k = 3; k < n - 2; k += 4 + Math.floor(r() * 3)) {
      const from = inner[k], to = outer[k + (r() < 0.5 ? 1 : -1)];
      if (from && to) lavaLine(ctx, jag(r, from, to, 4, 9), 0.7);
    }
  };
}

/** The tall arch the room code burns in. It fills its box; the children sit on the glass inside. */
export function CodeFrame(props: { children: ReactNode }) {
  const [ref, box] = useBoxSize<HTMLDivElement>();
  const draw = useMemo(() => frameDraw(box.w, box.h), [box.w, box.h]);
  const glassW = box.w - 2 * (SIDE + RIM);
  const glass = box.w > 80 ? { left: SIDE + RIM, top: TOP + RIM, width: glassW, height: box.h - TOP - BASE - RIM, borderRadius: `${String(glassW / 2)}px ${String(glassW / 2)}px 0 0` } : undefined;
  return (
    <div ref={ref} className="mp-frame">
      {/* The code is in the page from the first render; the frame is drawn round it once its size is known. */}
      <div className="mp-frame__glass" style={glass}>
        <span className="mp-frame__heat" aria-hidden="true" />
        {props.children}
      </div>
      {box.w > 80 && box.h > 160 && <PebbleCanvas className="mp-frame__stones" width={box.w} height={box.h} cacheKey="mp-rift-frame" draw={draw} />}
    </div>
  );
}
