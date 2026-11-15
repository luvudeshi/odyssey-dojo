// Drawn pieces of the Multiplayer screen, all from the pebble kit: the round token (a sea-blue mosaic disc in a ring of
// bronze stones, with a line icon on it) used as a card's sticker and a fighter's avatar, and the tall arched frame the
// room code stands in. Each is drawn once per size and cached.
import { type ReactNode, useMemo } from "react";
import { Icon, type IconName } from "../account/ui/icons";
import { PebbleCanvas } from "../ui/pebble";
import { drawLayout } from "../ui/pebble/draw";
import { useBoxSize } from "../ui/pebble/hooks";
import { sunDisc } from "../ui/pebble/ornaments";
import { LEAD, PAL } from "../ui/pebble/palette";
import { type Pt, ellipsePoly, fillPoly, lineStones, makeRng, newLayout, rectPoly, ringLayout, roundRectPoly, strip } from "../ui/pebble/stones";

export function RoomToken(props: { icon: IconName; size: number; className?: string }) {
  const { size } = props, c = size / 2;
  return (
    <span className={`mp-token ${props.className ?? ""}`} style={{ width: size, height: size }} aria-hidden="true">
      <PebbleCanvas width={size} height={size} cacheKey={`mp-token-${String(size)}`} draw={(ctx) => {
        const l = newLayout();
        fillPoly(l, makeRng(13), ellipsePoly(c, c, c - 5, c - 5, 32), { size: Math.max(4, size / 14), margin: 0.1, col: PAL.sea });
        l.stones.push(...ringLayout(c, c, c - 4.5, { seed: 6, size: Math.max(4.4, size / 15), col: PAL.ochre }).stones);
        strip(l, ellipsePoly(c, c, c - 1, c - 1, 48), 1.4, LEAD, true);
        drawLayout(ctx, l);
      }} />
      <Icon name={props.icon} className="mp-token__icon" />
    </span>
  );
}

// Frame geometry, in CSS pixels: room above the arch for the sun disc, below it for the plinth, and the width of the rings.
const TOP = 38, BASE = 30, SIDE = 12, RIM = 26;

const closed = (poly: readonly Pt[]): Pt[] => { const first = poly[0]; return first ? [...poly, first] : [...poly]; };

function frameDraw(w: number, h: number) {
  return (ctx: CanvasRenderingContext2D): void => {
    const l = newLayout(), r = makeRng(31), fw = w - 2 * SIDE, fh = h - TOP - BASE;
    const arch = (inset: number): Pt[] => {
      const aw = fw - 2 * inset, rad = aw / 2;
      return roundRectPoly(SIDE + inset, TOP + inset, aw, fh - 2 * inset, [rad, rad, 8, 8]);
    };
    // The plinth: a slab of bronze stones under the arch.
    fillPoly(l, r, rectPoly(SIDE - 8, h - BASE - 4, fw + 16, BASE), { size: 6.5, margin: 0.2, col: PAL.ochre });
    strip(l, rectPoly(SIDE - 8, h - BASE - 4, fw + 16, BASE), 1.6, LEAD, true);
    // Three rows of stones round the arch: bronze outside, terracotta, cream inside.
    lineStones(l, r, closed(arch(4)), { size: 7.2, col: PAL.ochre, gap: 0.98 });
    lineStones(l, r, closed(arch(12)), { size: 6.4, col: PAL.terra, gap: 0.98 });
    lineStones(l, r, closed(arch(19.5)), { size: 5.6, col: PAL.cream, gap: 0.98 });
    strip(l, closed(arch(-0.5)), 1.8, LEAD);
    strip(l, closed(arch(RIM - 2)), 1.6, LEAD);
    sunDisc(l, r, w / 2, TOP + 2, 30);
    drawLayout(ctx, l);
  };
}

/** The tall arched frame the room code stands in. It fills its box; the children sit on the mosaic glass inside. */
export function CodeFrame(props: { children: ReactNode }) {
  const [ref, box] = useBoxSize<HTMLDivElement>();
  const draw = useMemo(() => frameDraw(box.w, box.h), [box.w, box.h]);
  const glassW = box.w - 2 * (SIDE + RIM);
  const glass = box.w > 80 ? { left: SIDE + RIM, top: TOP + RIM, width: glassW, height: box.h - TOP - BASE - 2 * RIM, borderRadius: `${String(glassW / 2)}px ${String(glassW / 2)}px 4px 4px` } : undefined;
  return (
    <div ref={ref} className="mp-frame">
      {/* The code is in the page from the first render; the frame is drawn round it once its size is known. */}
      <div className="mp-frame__glass" style={glass}>
        <span className="mp-frame__glare" aria-hidden="true" />
        {props.children}
      </div>
      {box.w > 80 && box.h > 120 && <PebbleCanvas className="mp-frame__stones" width={box.w} height={box.h} cacheKey="mp-frame" draw={draw} />}
    </div>
  );
}
