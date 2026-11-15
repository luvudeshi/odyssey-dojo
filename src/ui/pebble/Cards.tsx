// The two prompt-card frames. DEFEND is a rounded cool-slate shield, STRIKE a pointed warm spearhead: they differ by shape
// and ornament, not only colour. The frame draws the stones; everything inside is real DOM text the caller supplies.
import type { ReactNode } from "react";
import { drawLayout, fillShape } from "./draw";
import { useBoxSize } from "./hooks";
import { PebbleDots } from "./Meters";
import { PebbleCanvas } from "./PebbleCanvas";
import { LEAD, PAL } from "./palette";
import { type Layout, type Pt, ellipsePoly, fillPoly, lineStones, makeRng, newLayout, pebble, pick, roundRectPoly, strip } from "./stones";

export type CardKind = "defend" | "strike";

/** Outline of the card: shield (round shoulders) or spearhead (a point on the left). Origin top-left. */
export function cardShape(kind: CardKind, w: number, h: number): Pt[] {
  return kind === "defend" ? roundRectPoly(1, 1, w - 2, h - 2, [60, 60, 14, 14]) : [[38, 1], [w - 1, 1], [w - 1, h - 1], [38, h - 1], [1, h / 2]];
}

function inset(kind: CardKind, w: number, h: number, k: number): Pt[] {
  return kind === "defend" ? roundRectPoly(k, k, w - 2 * k, h - 2 * k, [60 - k, 60 - k, 8, 8]) : [[38 + k * 0.9, k], [w - k, k], [w - k, h - k], [38 + k * 0.9, h - k], [k * 1.15, h / 2]];
}

/** Fill, lead outline and the pebble rim: pearls (alternating slate and cream) on the shield, teeth (terracotta and ochre) on the spear. */
export function cardLayout(kind: CardKind, w: number, h: number): Layout {
  const def = kind === "defend", l = newLayout(), r = makeRng(def ? 21 : 22), poly = cardShape(kind, w, h);
  fillPoly(l, r, poly, { size: 5, margin: 0.15, col: def ? PAL.dusk : PAL.blood, flat: true });
  strip(l, poly, 2.4, LEAD, true);
  strip(l, inset(kind, w, h, 12), 1.6, LEAD, true);
  const rim = inset(kind, w, h, 6.5);
  lineStones(l, r, [...rim, rim[0] ?? [0, 0]], def
    ? { size: 4.2, rows: 1, gap: 1.05, round: true, col: (i, _row, rg) => (i % 2 ? pick(PAL.slate, rg) : pick(PAL.cream, rg)) }
    : { size: 4.4, rows: 1, gap: 1, col: (i, _row, rg) => (i % 2 ? pick(PAL.terra, rg) : pick(PAL.ochre, rg)) });
  return l;
}

/** The small shield or spearhead glyph beside the kind's name. */
export function glyphLayout(kind: CardKind): Layout {
  const l = newLayout(), r = makeRng(3);
  if (kind === "defend") {
    const poly = ellipsePoly(12, 12, 9, 9, 24);
    fillPoly(l, r, poly, { size: 3.6, margin: 0.1, col: PAL.slate });
    strip(l, poly, 1.4, LEAD, true);
    pebble(l, r, 12, 12, 7, PAL.cream[0], { round: true });
  } else {
    const poly: Pt[] = [[1, 12], [16, 6], [23, 12], [16, 18]];
    fillPoly(l, r, poly, { size: 3.2, margin: 0.05, col: PAL.ochre });
    strip(l, poly, 1.4, LEAD, true);
  }
  return l;
}

export interface CardFrameProps {
  kind: CardKind;
  children: ReactNode;
  /** 0 to 1: a row of stones along the bottom that goes dark as the prompt runs out. Leave out for none. */
  timer?: number;
  className?: string;
}

/**
 * The ONE prompt card, set at the right edge. Put the move word (plain type, 14 px or more), the HOLD tag and key hint
 * inside as children. Width comes from --pb-card-w (248 px); the height grows with the children.
 */
export function CardFrame(props: CardFrameProps) {
  const { kind, timer } = props, [ref, box] = useBoxSize<HTMLDivElement>(), label = kind === "defend" ? "Defend" : "Strike";
  const dots = Math.max(8, Math.floor((box.w - (kind === "defend" ? 48 : 74)) / 12));
  return (
    <div ref={ref} className={`pb-card pb-card--${kind} ${props.className ?? ""}`}>
      {box.w > 40 && box.h > 40 && (
        <PebbleCanvas className="pb-card__frame" width={box.w} height={box.h} cacheKey={`card-${kind}`} draw={(ctx) => { fillShape(ctx, cardShape(kind, box.w, box.h), kind === "defend" ? "#10181d" : "#1f0e0b"); drawLayout(ctx, cardLayout(kind, box.w, box.h)); }} />
      )}
      <div className="pb-card__head">
        <PebbleCanvas width={26} height={24} cacheKey={`glyph-${kind}`} draw={(ctx) => { drawLayout(ctx, glyphLayout(kind)); }} />
        <span className="pb-card__kind">{label}</span>
      </div>
      <div className="pb-card__body">{props.children}</div>
      {timer !== undefined && (
        <div className="pb-card__timer">
          <PebbleDots value={timer} n={dots} d={12} tone={kind === "defend" ? "slate" : "ochre"} trough={false} label={`${label} time left`} />
        </div>
      )}
    </div>
  );
}
