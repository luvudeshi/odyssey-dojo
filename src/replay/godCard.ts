// The "god card": a Greek trading card of the player's fight, painted on a 2D canvas for them to keep.
import { log } from "../core/log";
import { BAND_CELLS, drawMeander } from "./meander";
import { inset } from "./rect";
import type { Rect } from "./rect";
import { fitFontSize, fitText, LINE_HEIGHT } from "./textFit";
import type { Measure } from "./textFit";

export interface GodCardData {
  readonly godName: string;
  readonly epithet: string;
  readonly domain: string;
  readonly enemyName: string;
  readonly fightTitle: string;
  readonly score: number;
  readonly won: boolean;
  /** Any CSS colour; the portrait ring falls back to gold if the browser cannot parse it. */
  readonly accent: string;
  readonly portrait: CanvasImageSource | null;
  readonly qr: CanvasImageSource | null;
  readonly footer: string;
}

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

const INK = "#140c22";
const GOLD = "#e8b84a";
const MARBLE = "#f1ead9";
const DEFEAT = "#e0685a";
const SERIF = '"Cinzel", "Trajan Pro", Georgia, serif';
const TAU = Math.PI * 2;
const FONT_WAIT_MS = 800;

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

// The score row holds a small "SCORE" label above the numerals.
const SCORE_LABEL_SHARE = 0.22;

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

/** How big a picture is in its own pixels, or null when it does not say (an SVG image). */
function sourceSize(source: CanvasImageSource): { width: number; height: number } | null {
  if ("naturalWidth" in source) return { width: source.naturalWidth, height: source.naturalHeight };
  if ("videoWidth" in source) return { width: source.videoWidth, height: source.videoHeight };
  if ("displayWidth" in source) return { width: source.displayWidth, height: source.displayHeight };
  const { width, height } = source;
  return typeof width === "number" && typeof height === "number" ? { width, height } : null;
}

/** The centred part of a source picture that fills a target of the given shape without stretching. */
export function coverCrop(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): Rect {
  const wider = sourceWidth * targetHeight > sourceHeight * targetWidth;
  const width = wider ? (sourceHeight * targetWidth) / targetHeight : sourceWidth;
  const height = wider ? sourceHeight : (sourceWidth * targetHeight) / targetWidth;
  return { x: (sourceWidth - width) / 2, y: (sourceHeight - height) / 2, width, height };
}

/** Draws a picture to fill `box`, cropping the overflow. False if the picture cannot be drawn (broken or empty). */
function drawCover(context: CanvasRenderingContext2D, source: CanvasImageSource, box: Rect): boolean {
  try {
    const size = sourceSize(source);
    if (!size) {
      context.drawImage(source, box.x, box.y, box.width, box.height);
      return true;
    }
    if (!(size.width > 0) || !(size.height > 0) || !(box.width > 0) || !(box.height > 0)) return false;
    const crop = coverCrop(size.width, size.height, box.width, box.height);
    context.drawImage(source, crop.x, crop.y, crop.width, crop.height, box.x, box.y, box.width, box.height);
    return true;
  } catch (error) {
    log("warn", "godCard.imageFailed", error);
    return false;
  }
}

interface TextStyle {
  readonly maxSize: number;
  readonly maxLines: number;
  readonly color: string;
  readonly italic?: boolean;
  readonly weight?: number;
  /** Extra space between letters, in ems. */
  readonly tracking?: number;
  readonly align?: "left" | "center";
  readonly alpha?: number;
}

function fontOf(style: TextStyle, size: number): string {
  return `${style.italic ? "italic" : "normal"} ${String(style.weight ?? 600)} ${String(size)}px ${SERIF}`;
}

/** A measure callback for the text-fitting maths that counts the letter spacing we add by hand. */
function measureWith(context: CanvasRenderingContext2D, style: TextStyle): Measure {
  return (text, size) => {
    context.font = fontOf(style, size);
    const gaps = Math.max(0, Array.from(text).length - 1);
    return context.measureText(text).width + gaps * size * (style.tracking ?? 0);
  };
}

/** fillText with letter spacing. Each glyph is placed after the measured text before it, so kerning survives. */
function fillTracked(context: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number): void {
  if (spacing === 0) {
    context.fillText(text, x, y);
    return;
  }
  let before = "";
  Array.from(text).forEach((glyph, index) => {
    context.fillText(glyph, x + context.measureText(before).width + spacing * index, y);
    before += glyph;
  });
}

function fillLines(
  context: CanvasRenderingContext2D,
  lines: readonly string[],
  size: number,
  box: Rect,
  style: TextStyle,
): void {
  const measure = measureWith(context, style);
  const pitch = size * LINE_HEIGHT;
  const top = box.y + (box.height - pitch * lines.length) / 2;
  context.save();
  context.fillStyle = style.color;
  context.globalAlpha = style.alpha ?? 1;
  context.textAlign = "left";
  context.textBaseline = "middle";
  lines.forEach((line, index) => {
    const width = measure(line, size);
    const x = style.align === "left" ? box.x : box.x + (box.width - width) / 2;
    fillTracked(context, line, x, top + pitch * (index + 0.5), size * (style.tracking ?? 0));
  });
  context.restore();
}

/** Draws `text` inside `box`, shrunk or wrapped so that it cannot overflow. */
function drawText(context: CanvasRenderingContext2D, text: string, box: Rect, style: TextStyle): void {
  const smallest = Math.min(style.maxSize, Math.max(8, Math.round(style.maxSize * 0.45)));
  const fitted = fitText(text, box, style.maxSize, smallest, style.maxLines, measureWith(context, style));
  fillLines(context, fitted.lines, fitted.size, box, style);
}

function drawBackground(context: CanvasRenderingContext2D, layout: CardLayout, width: number, height: number): void {
  context.fillStyle = INK;
  context.fillRect(0, 0, width, height);
  const face = layout.blocks.portrait;
  const glow = context.createRadialGradient(
    face.x + face.width / 2,
    face.y + face.height / 2,
    0,
    face.x + face.width / 2,
    face.y + face.height / 2,
    Math.max(width, height) * 0.7,
  );
  glow.addColorStop(0, "#2c1b4a");
  glow.addColorStop(1, INK);
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
}

/** The stand-in for a missing portrait: a ring of sun rays around the god's initial. */
function drawEmblem(context: CanvasRenderingContext2D, godName: string, box: Rect): void {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const radius = box.width / 2;
  context.save();
  context.strokeStyle = GOLD;
  context.fillStyle = GOLD;
  context.lineWidth = Math.max(1, radius * 0.014);
  context.globalAlpha = 0.45;
  const rays = 32;
  for (let ray = 0; ray < rays; ray++) {
    const angle = (ray / rays) * TAU;
    const reach = radius * (ray % 2 === 0 ? 0.9 : 0.78);
    context.beginPath();
    context.moveTo(cx + Math.cos(angle) * radius * 0.64, cy + Math.sin(angle) * radius * 0.64);
    context.lineTo(cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach);
    context.stroke();
  }
  context.beginPath();
  context.arc(cx, cy, radius * 0.58, 0, TAU);
  context.stroke();
  context.globalAlpha = 1;
  context.font = `normal 700 ${String(Math.round(radius * 0.72))}px ${SERIF}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(Array.from(godName.trim())[0]?.toUpperCase() ?? "Ω", cx, cy + radius * 0.03);
  context.restore();
}

function drawPortrait(context: CanvasRenderingContext2D, data: GodCardData, box: Rect): void {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const radius = box.width / 2;
  const ring = Math.max(2, radius * 0.045);
  if (!(radius > ring * 2)) return;

  context.save();
  context.beginPath();
  context.arc(cx, cy, radius - ring * 1.5, 0, TAU);
  context.clip();
  const disc = context.createRadialGradient(cx, cy - radius * 0.3, 0, cx, cy, radius);
  disc.addColorStop(0, "#3d2866");
  disc.addColorStop(1, "#1b1130");
  context.fillStyle = disc;
  context.fillRect(box.x, box.y, box.width, box.height);
  if (!data.portrait || !drawCover(context, data.portrait, box)) drawEmblem(context, data.godName, box);
  context.restore();

  context.save();
  context.lineWidth = ring;
  // An unparseable colour is ignored on assignment, which leaves the gold in place.
  context.strokeStyle = GOLD;
  context.strokeStyle = data.accent;
  context.shadowColor = GOLD;
  context.shadowColor = data.accent;
  context.shadowBlur = radius * 0.16;
  context.beginPath();
  context.arc(cx, cy, radius - ring * 1.5, 0, TAU);
  context.stroke();
  context.shadowBlur = 0;
  context.lineWidth = Math.max(1, ring * 0.3);
  context.strokeStyle = GOLD;
  context.beginPath();
  context.arc(cx, cy, radius - ring * 0.3, 0, TAU);
  context.stroke();
  context.restore();
}

/** A thin gold rule with a diamond at its middle, between the god and the result. */
function drawDivider(context: CanvasRenderingContext2D, box: Rect): void {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const half = box.width * 0.3;
  const gem = Math.max(2, box.height * 0.22);
  context.save();
  context.strokeStyle = GOLD;
  context.fillStyle = GOLD;
  context.globalAlpha = 0.8;
  context.lineWidth = Math.max(1, box.height * 0.05);
  context.beginPath();
  context.moveTo(cx - half, cy);
  context.lineTo(cx - gem * 2, cy);
  context.moveTo(cx + gem * 2, cy);
  context.lineTo(cx + half, cy);
  context.stroke();
  context.beginPath();
  context.moveTo(cx, cy - gem);
  context.lineTo(cx + gem, cy);
  context.lineTo(cx, cy + gem);
  context.lineTo(cx - gem, cy);
  context.closePath();
  context.fill();
  context.restore();
}

function drawScore(context: CanvasRenderingContext2D, score: number, box: Rect, maxSize: number): void {
  const label: Rect = { ...box, height: box.height * SCORE_LABEL_SHARE };
  const numerals: Rect = { ...box, y: box.y + label.height, height: box.height - label.height };
  drawText(context, "SCORE", label, {
    maxSize: Math.max(1, Math.round(maxSize * 0.2)),
    maxLines: 1,
    color: MARBLE,
    tracking: 0.3,
    alpha: 0.7,
  });
  const style: TextStyle = { maxSize, maxLines: 1, color: GOLD, weight: 700, tracking: 0.04 };
  const text = Math.round(Number.isFinite(score) ? score : 0).toLocaleString("en-US");
  const size = fitFontSize(text, numerals.width, maxSize, 1, measureWith(context, style));
  fillLines(context, [text], size, numerals, style);
}

/** Draws the QR on a white plate with a quiet zone, so it scans against the dark card. False if it cannot be drawn. */
function drawQr(context: CanvasRenderingContext2D, qr: CanvasImageSource, box: Rect): boolean {
  if (!(box.width > 0)) return false;
  context.save();
  try {
    const quiet = box.width * 0.07;
    context.fillStyle = "#ffffff";
    context.fillRect(box.x, box.y, box.width, box.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(qr, box.x + quiet, box.y + quiet, box.width - quiet * 2, box.height - quiet * 2);
    return true;
  } catch (error) {
    log("warn", "godCard.qrFailed", error);
    context.fillStyle = INK;
    context.fillRect(box.x, box.y, box.width, box.height);
    return false;
  } finally {
    context.restore();
  }
}

function paint(context: CanvasRenderingContext2D, data: GodCardData, width: number, height: number): void {
  const layout = cardLayout(width, height);
  const { blocks, fonts } = layout;
  drawBackground(context, layout, width, height);
  drawMeander(context, layout.border, layout.cell, GOLD);
  drawPortrait(context, data, blocks.portrait);

  drawText(context, data.godName.toUpperCase(), blocks.name, {
    maxSize: fonts.name,
    maxLines: 2,
    color: GOLD,
    weight: 700,
    tracking: 0.14,
  });
  drawText(context, data.epithet, blocks.epithet, { maxSize: fonts.epithet, maxLines: 2, color: MARBLE, italic: true, weight: 400 });
  drawText(context, data.domain, blocks.domain, { maxSize: fonts.domain, maxLines: 1, color: MARBLE, tracking: 0.06, alpha: 0.75 });
  drawDivider(context, blocks.divider);

  const outcome = data.won ? `Victory over ${data.enemyName}` : `Fell to ${data.enemyName}`;
  drawText(context, outcome, blocks.outcome, { maxSize: fonts.outcome, maxLines: 2, color: data.won ? GOLD : DEFEAT });
  drawText(context, data.fightTitle, blocks.fightTitle, { maxSize: fonts.fightTitle, maxLines: 1, color: MARBLE, alpha: 0.8 });
  drawScore(context, data.score, blocks.score, fonts.score);

  const footer: TextStyle = { maxSize: fonts.footer, maxLines: 3, color: MARBLE, weight: 400, alpha: 0.85 };
  if (data.qr && drawQr(context, data.qr, blocks.qr)) {
    drawText(context, data.footer, blocks.footer, { ...footer, align: "left" });
  } else {
    // With no QR the footer takes the whole bottom row, centred.
    const end = blocks.qr.x + blocks.qr.width;
    drawText(context, data.footer, { ...blocks.footer, width: end - blocks.footer.x }, footer);
  }
}

/** Paints the card over the whole `width` x `height` area. Never throws: a failure is logged and the card is left partly drawn. */
export function drawGodCard(context: CanvasRenderingContext2D, data: GodCardData, width: number, height: number): void {
  if (!(width > 0) || !(height > 0)) return;
  context.save();
  try {
    paint(context, data, width, height);
  } catch (error) {
    log("warn", "godCard.drawFailed", error);
  } finally {
    context.restore();
  }
}

/** Waits briefly for the page's serif to be ready, so the card is not set in a fallback font. */
async function fontsReady(): Promise<void> {
  const timeout = new Promise<void>((resolve) => {
    setTimeout(resolve, FONT_WAIT_MS);
  });
  const loaded = document.fonts.load(`700 48px ${SERIF}`).then(
    () => undefined,
    () => undefined,
  );
  await Promise.race([loaded, timeout]);
}

/** The card as a PNG, or null if this browser has no canvas or anything at all goes wrong. */
export async function godCardBlob(data: GodCardData, width = 1080, height = 1350): Promise<Blob | null> {
  try {
    if (typeof document === "undefined" || !(width > 0) || !(height > 0)) return null;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width);
    canvas.height = Math.round(height);
    const context = canvas.getContext("2d");
    if (!context) return null;
    await fontsReady();
    drawGodCard(context, data, canvas.width, canvas.height);
    // toBlob throws if the portrait or QR came from another origin without CORS; that lands in the catch below.
    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/png");
    });
  } catch (error) {
    log("warn", "godCard.blobFailed", error);
    return null;
  }
}
