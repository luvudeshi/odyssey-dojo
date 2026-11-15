// Pebble-set lettering: text is drawn off-screen, its alpha is read back as a mask, and the mask is filled with stones.
import { PAL, type Palette } from "./palette";
import { type Stone, makeRng, newLayout, pebble, pick } from "./stones";

export interface Mask { alpha: ArrayLike<number>; w: number; h: number }
export interface MaskOpts { size: number; seed: number; col: Palette; rim?: Palette | undefined }

/** Stones on a staggered grid wherever the mask is solid; stones on the letter's edge take the rim colours. Pure. */
export function maskStones(mask: Mask, o: MaskOpts): Stone[] {
  const { alpha, w, h } = mask, r = makeRng(o.seed), step = o.size * 0.9, l = newLayout();
  const A = (x: number, y: number): number => (x < 0 || y < 0 || x >= w || y >= h ? 0 : (alpha[Math.floor(y) * w + Math.floor(x)] ?? 0));
  let row = 0;
  for (let y = step / 2; y < h; y += step * 0.88, row++) {
    for (let x = (row % 2 ? step / 2 : 0) + step / 2; x < w; x += step) {
      if (A(x, y) < 150) continue;
      const edge = A(x - step * 0.85, y) < 100 || A(x + step * 0.85, y) < 100 || A(x, y - step * 0.8) < 100 || A(x, y + step * 0.8) < 100;
      const col = edge && o.rim ? pick(o.rim, r) : pick(o.col, r);
      pebble(l, r, x + (r() - 0.5) * o.size * 0.2, y + (r() - 0.5) * o.size * 0.2, o.size * (0.95 + r() * 0.15), col);
    }
  }
  return l.stones;
}

export const HEADING_FONT = 'Rockwell, "Rockwell Extra Bold", "Copperplate Gothic Bold", Copperplate, Georgia, serif';

export type HeadingTone = "cream" | "ochre" | "terra";
export const HEADING_COLORS: Record<HeadingTone, { col: Palette; rim: Palette }> = {
  cream: { col: PAL.cream, rim: PAL.ochre },
  ochre: { col: PAL.ochre, rim: PAL.cream },
  terra: { col: PAL.terra, rim: PAL.ochre },
};

export interface TextMask extends Mask { pad: number }

/** Draws the string in white on a throwaway canvas and reads its alpha back. Needs a DOM. */
export function textMask(text: string, px: number, spacing: number): TextMask | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas"), g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  const font = `700 ${String(px)}px ${HEADING_FONT}`, pad = 6;
  g.font = font; g.letterSpacing = `${String(spacing)}px`;
  const w = Math.ceil(g.measureText(text).width) + pad * 2, h = Math.ceil(px * 1.5);
  c.width = w; c.height = h;
  g.font = font; g.letterSpacing = `${String(spacing)}px`;
  g.fillStyle = "#fff"; g.strokeStyle = "#fff"; g.lineWidth = px * 0.04; g.lineJoin = "round";
  g.fillText(text, pad, px * 1.1); g.strokeText(text, pad, px * 1.1);
  const data = g.getImageData(0, 0, w, h).data, alpha = new Uint8Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3] ?? 0;
  return { alpha, w, h, pad };
}
