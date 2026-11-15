// A round achievement badge: a ring of pebbles with the line icon inside. Unlocked is ochre and bright, locked is dim stone
// with its picture faded and a padlock, so the two read apart by shape and brightness and not by colour alone.
import { PebbleCanvas } from "../../ui/pebble";
import { drawLayout } from "../../ui/pebble/draw";
import { PAL } from "../../ui/pebble/palette";
import { ellipsePoly, fillPoly, makeRng, newLayout, ringLayout } from "../../ui/pebble/stones";
import { FEAT_ICON, Icon } from "./icons";

function badgeLayout(size: number, done: boolean) {
  const c = size / 2, l = newLayout();
  fillPoly(l, makeRng(5), ellipsePoly(c, c, c - 4, c - 4, 24), { size: 5, margin: 0.1, col: done ? PAL.blood : PAL.dim, flat: true });
  const ring = ringLayout(c, c, c - 3.5, { seed: done ? 9 : 11, size: 4.6, rows: 1, col: done ? PAL.ochre : PAL.sea });
  l.stones.push(...ring.stones);
  return l;
}

export function Badge(props: { id: string; size: number; done: boolean }) {
  const { id, size, done } = props;
  return (
    <span className={`acc-badge ${done ? "is-done" : "is-locked"}`} style={{ width: size, height: size }}>
      <PebbleCanvas width={size} height={size} cacheKey={`badge-${done ? "on" : "off"}-${String(size)}`} draw={(ctx) => { drawLayout(ctx, badgeLayout(size, done)); }} />
      <Icon name={FEAT_ICON[id] ?? "laurel"} className="acc-badge__icon" />
      {!done && <Icon name="lock" className="acc-badge__lock" />}
    </span>
  );
}
