// Where everything on the god card goes: named rectangles and font sizes for a card of any size. Pure.
import { BAND_CELLS } from "./meander";
import { inset } from "./rect";
import type { Rect } from "./rect";

export type CardText = "name" | "epithet" | "domain" | "outcome" | "fightTitle" | "score" | "footer";
export type CardBlock = CardText | "portrait" | "divider" | "qr";

export interface CardLayout {
  /** Outer edge of the meander border. */
  readonly border: Rect;
  /** Grid step of the meander; the border band is BAND_CELLS of these thick. */
  readonly cell: number;
  /** Everything except the border is drawn inside this. */
  readonly content: Rect;
  /** Where each part goes. None of these overlap. */
  readonly blocks: Readonly<Record<CardBlock, Rect>>;
  /** Largest font size in pixels for each text block; long text is fitted down from it. */
  readonly fonts: Readonly<Record<CardText, number>>;
}

// Each row's top and bottom as fractions of the content height.
const ROWS = {
  portrait: [0, 0.35],
  name: [0.37, 0.465],
  epithet: [0.465, 0.515],
  domain: [0.515, 0.555],
  divider: [0.555, 0.585],
  outcome: [0.585, 0.64],
  fightTitle: [0.64, 0.68],
  score: [0.685, 0.815],
  bottom: [0.835, 0.99],
} as const;

export function cardLayout(width: number, height: number): CardLayout {
  const short = Math.min(width, height);
  const cell = Math.max(2, Math.round(short * 0.012));
  const border = inset({ x: 0, y: 0, width, height }, Math.round(short * 0.022));
  const content = inset(border, cell * BAND_CELLS + Math.round(short * 0.028));
  const row = ([from, to]: readonly [number, number]): Rect => {
    const top = Math.round(content.height * from);
    return { x: content.x, y: content.y + top, width: content.width, height: Math.round(content.height * to) - top };
  };

  const portraitRow = row(ROWS.portrait);
  const face = Math.min(portraitRow.height, content.width);
  const bottom = row(ROWS.bottom);
  const code = Math.min(bottom.height, Math.round(content.width * 0.4));
  const gap = Math.round(content.width * 0.04);
  const blocks = {
    portrait: { x: content.x + (content.width - face) / 2, y: portraitRow.y, width: face, height: face },
    name: row(ROWS.name),
    epithet: row(ROWS.epithet),
    domain: row(ROWS.domain),
    divider: row(ROWS.divider),
    outcome: row(ROWS.outcome),
    fightTitle: row(ROWS.fightTitle),
    score: row(ROWS.score),
    footer: { ...bottom, width: Math.max(0, bottom.width - code - gap) },
    qr: { x: bottom.x + bottom.width - code, y: bottom.y + bottom.height - code, width: code, height: code },
  };
  const size = (block: CardText, share: number): number => Math.max(1, Math.round(blocks[block].height * share));
  const fonts = {
    name: size("name", 0.78),
    epithet: size("epithet", 0.62),
    domain: size("domain", 0.6),
    outcome: size("outcome", 0.66),
    fightTitle: size("fightTitle", 0.62),
    score: size("score", 0.64),
    footer: size("footer", 0.2),
  };
  return { border, cell, content, blocks, fonts };
}
