// Look C only: the hero's crest, a helmet in a sea-blue pebble roundel between two laurel branches, drawn once and cached.
import { PebbleCanvas } from "../../ui/pebble";
import { drawLayout } from "../../ui/pebble/draw";
import { laurel } from "../../ui/pebble/ornaments";
import { LEAD, PAL } from "../../ui/pebble/palette";
import { ellipsePoly, fillPoly, makeRng, newLayout, ringLayout, strip } from "../../ui/pebble/stones";
import { Icon } from "./icons";

const SIZE = 132;

function crest(ctx: CanvasRenderingContext2D): void {
  const c = SIZE / 2, l = newLayout(), r = makeRng(21);
  fillPoly(l, r, ellipsePoly(c, c, 36, 36, 32), { size: 5.2, margin: 0.1, col: PAL.sea });
  l.stones.push(...ringLayout(c, c, 40, { seed: 4, size: 5, col: PAL.ochre }).stones);
  strip(l, ellipsePoly(c, c, 44, 44, 48), 1.6, LEAD, true);
  laurel(l, r, c, c + 2, 56, 100, 250, false);
  laurel(l, r, c, c + 2, 56, 80, -70, true);
  drawLayout(ctx, l);
}

export function AccountCrest() {
  return (
    <span className="acc-crest" aria-hidden="true">
      <PebbleCanvas width={SIZE} height={SIZE} cacheKey="acc-crest" draw={crest} />
      <Icon name="helmet" className="acc-crest__icon" />
    </span>
  );
}
