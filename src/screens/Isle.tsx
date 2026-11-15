// One island on the quest map, laid in pebbles once per state and cached by the kit's canvas.
import { PAL } from "../ui/pebble/palette";
import type { Palette } from "../ui/pebble/palette";
import { drawLayout } from "../ui/pebble/draw";
import { PebbleCanvas } from "../ui/pebble";
import { ellipsePoly, fillPoly, lineStones, makeRng, newLayout, strip } from "../ui/pebble/stones";

export type IsleState = "cleared" | "open" | "locked";

const FILL: Record<IsleState, Palette> = { cleared: PAL.ochre, open: PAL.olive, locked: ["#4a5236", "#434a31", "#505a3b"] };
export const ISLE_W = 76;
export const ISLE_H = 50;

export function Isle(props: { state: IsleState }) {
  const { state } = props;
  return (
    <PebbleCanvas
      width={ISLE_W}
      height={ISLE_H}
      cacheKey={`isle|${state}`}
      draw={(ctx) => {
        const l = newLayout(), r = makeRng(state === "open" ? 11 : state === "cleared" ? 12 : 13);
        const poly = ellipsePoly(ISLE_W / 2, ISLE_H / 2, ISLE_W / 2 - 3, ISLE_H / 2 - 3, 36);
        ctx.beginPath();
        poly.forEach(([x, y], i) => { if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
        ctx.closePath();
        ctx.fillStyle = "#15100e";
        ctx.fill();
        fillPoly(l, r, poly, { size: 4, margin: 0.2, col: FILL[state] });
        lineStones(l, r, [...poly, poly[0] ?? [0, 0]], { size: 3, rows: 1, gap: 1, col: state === "locked" ? PAL.sea : PAL.cream });
        strip(l, poly, 1.4, "#9c9b93", true);
        drawLayout(ctx, l);
      }}
    />
  );
}
