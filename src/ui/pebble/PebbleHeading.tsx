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

/**
 * Titles and headings only, never the move word or anything read in half a second. The text is rendered once into stones
 * and cached per string, size and tone; the real text stays in the DOM for screen readers and as the fallback.
 */
export function PebbleHeading(props: PebbleHeadingProps) {
  const { text, px = 40, tone = "cream", spacing = px * 0.06, as: Tag = "h2" } = props;
  const size = Math.max(2.6, px / 8), key = `h|${text}|${String(px)}|${String(spacing)}|${tone}`;
  const mask = useMemo(() => textMask(text, px, spacing), [text, px, spacing]);
  const draw = useMemo(() => {
    if (!mask) return null;
    const c = HEADING_COLORS[tone];
    return maskStones(mask, { size, seed: 3 + text.length, col: c.col, rim: c.rim });
  }, [mask, tone, size, text]);
  if (!mask || !draw) return <Tag className={`pb-heading pb-heading--plain ${props.className ?? ""}`}>{text}</Tag>;
  return (
    <Tag className={`pb-heading ${props.className ?? ""}`} aria-label={text} style={{ width: mask.w, height: mask.h }}>
      <PebbleCanvas width={mask.w} height={mask.h} cacheKey={key} draw={(ctx) => { for (const s of draw) drawStone(ctx, s); }} />
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
