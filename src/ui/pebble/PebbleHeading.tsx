import { type ElementType, useMemo } from "react";
import { cachedBitmap, drawStone } from "./draw";
import { pixelRatio } from "./hooks";
import { HEADING_COLORS, type HeadingTone, maskStones, textMask } from "./mask";
import { PebbleCanvas } from "./PebbleCanvas";

export interface PebbleHeadingProps {
  text: string;
  /** Font size in px of the letters the stones are set into. Stone size follows (px / 8). */
  px?: number;
  tone?: HeadingTone;
  spacing?: number;
  as?: ElementType;
  className?: string;
}

/** Below this size, or above this length, stone letters break into dots, so the heading is set in solid type instead. */
export const PEBBLE_MIN_PX = 56;
export const PEBBLE_MAX_CHARS = 20;

/** True when `text` at `px` is set in stones; false when it is set in solid type. */
export function inStones(text: string, px: number): boolean {
  return px >= PEBBLE_MIN_PX && text.length <= PEBBLE_MAX_CHARS;
}

/**
 * Titles and headings only, never the move word or anything read in half a second. A short, large heading is rendered
 * once into stones (in capitals) and cached per string, size and tone; anything smaller or longer is solid type, as
 * written. The real text stays in the DOM for screen readers.
 */
export function PebbleHeading(props: PebbleHeadingProps) {
  const { text, px = 40, tone = "cream", spacing = px * 0.06, as: Tag = "h2" } = props;
  const stones = inStones(text, px), caps = text.toUpperCase();
  const size = Math.max(1.9, px / 13), key = `h|${caps}|${String(px)}|${String(spacing)}|${tone}`;
  const mask = useMemo(() => (stones ? textMask(caps, px, spacing) : null), [stones, caps, px, spacing]);
  const draw = useMemo(() => {
    if (!mask) return null;
    const c = HEADING_COLORS[tone];
    return maskStones(mask, { size, seed: 3 + text.length, col: c.col, rim: c.rim });
  }, [mask, tone, size, text]);
  if (!mask || !draw) return <Tag className={`pb-heading pb-heading--plain ${props.className ?? ""}`} style={{ fontSize: Math.min(px, 44) }}>{text}</Tag>;
  return (
    <Tag className={`pb-heading ${props.className ?? ""}`} aria-label={text} style={{ width: mask.w, maxWidth: "100%" }}>
      {/* Shrinks with its proportions kept when the panel is narrower than the heading (phone width). */}
      <PebbleCanvas width={mask.w} height={mask.h} style={{ width: "100%", height: "auto" }} cacheKey={key} draw={(ctx) => { for (const s of draw) drawStone(ctx, s); }} />
    </Tag>
  );
}

/** Cost probe for the dev page: draws a heading uncached and returns milliseconds. */
export function timeHeading(text: string, px: number): number {
  const t0 = performance.now(), mask = textMask(text, px, px * 0.06);
  if (!mask) return -1;
  const stones = maskStones(mask, { size: px / 8, seed: 3, col: HEADING_COLORS.cream.col, rim: HEADING_COLORS.cream.rim });
  cachedBitmap(`probe|${text}|${String(performance.now())}`, mask.w, mask.h, pixelRatio(), (ctx) => { for (const s of stones) drawStone(ctx, s); });
  return performance.now() - t0;
}
