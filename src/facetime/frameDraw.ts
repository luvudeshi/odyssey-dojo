// Draws one outgoing frame on a 2D canvas: the fight's picture, then the HUD the friend needs, large enough to read
// on a phone. Where things go is in frameLayout.ts and what they say is in frameHud.ts; this file only paints.
import type { MoveDiagram } from "../core/types";
import type { FrameHud, FrameTone } from "./frameHud";
import { barFill, coverCrop, figurePoint, fitFont } from "./frameLayout";
import type { FrameLayout, Rect } from "./frameLayout";

/** Anything drawImage takes that has a size: the scene's canvas, or a video playing its captured stream. */
export interface PictureSource {
  readonly image: CanvasImageSource;
  readonly width: number;
  readonly height: number;
}

const INK = "#17110d";
const BONE = "#f2e4c8";
const DIM = "#3a2c22";
const TONES: Readonly<Record<FrameTone, { readonly plate: string; readonly accent: string; readonly text: string }>> = {
  strike: { plate: "#f2e4c8", accent: "#c8612f", text: "#17110d" },
  finish: { plate: "#ffd9a0", accent: "#7a1f1a", text: "#17110d" },
  defend: { plate: "#221912", accent: "#6f8fb3", text: "#f2e4c8" },
  calm: { plate: "#221912", accent: "#e0a93b", text: "#f2e4c8" },
  won: { plate: "#221912", accent: "#e0a93b", text: "#ffd9a0" },
  lost: { plate: "#221912", accent: "#7a1f1a", text: "#f2e4c8" },
};
const DISPLAY = 'Optima, "Gill Sans", Candara, Palatino, Georgia, serif';
const LABEL = '"Gill Sans", "Gill Sans MT", "Trebuchet MS", sans-serif';

function bar(ctx: CanvasRenderingContext2D, box: Rect, share: number, colour: string): void {
  ctx.fillStyle = DIM;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  const fill = barFill(box, share);
  ctx.fillStyle = colour;
  ctx.fillRect(fill.x, fill.y, fill.w, fill.h);
  ctx.strokeStyle = BONE;
  ctx.lineWidth = 3;
  ctx.strokeRect(box.x, box.y, box.w, box.h);
}

/** Breaks `text` into at most `maxLines` lines that fit `width`; the last line ends in "..." when words are left over. */
export function wrapLines(text: string, width: number, measure: (line: string) => number, maxLines: number): string[] {
  const lines: string[] = [];
  let current = "";
  const words = text.split(/\s+/).filter((word) => word !== "");
  for (let index = 0; index < words.length; index++) {
    const word = words[index] ?? "";
    const next = current === "" ? word : `${current} ${word}`;
    if (current === "" || measure(next) <= width) {
      current = next;
      continue;
    }
    if (lines.length === maxLines - 1) {
      lines.push(`${current}...`);
      return lines;
    }
    lines.push(current);
    current = word;
  }
  if (current !== "") lines.push(current);
  return lines;
}

function figure(ctx: CanvasRenderingContext2D, box: Rect, diagram: MoveDiagram, colour: string, accent: string): void {
  const dx = diagram.shiftX ?? 0, dy = diagram.shiftY ?? 0;
  const at = (x: number, y: number): readonly [number, number] => figurePoint(box, x + dx, y + dy);
  const line = (points: readonly (readonly [number, number])[]): void => {
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      const [px, py] = at(x, y);
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  };
  const scale = Math.min(box.w, box.h) / 100;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = colour;
  ctx.lineWidth = 5 * scale;
  // The same body as the prompt card's stick figure (src/hud/Hud.tsx): the player's left is at the picture's left.
  line([[38, 32], [62, 32], [50, 62], [38, 32]]);
  line([[50, 62], diagram.leftKnee ?? [42, 80], diagram.leftFoot ?? [40, 96]]);
  line([[50, 62], diagram.rightKnee ?? [58, 80], diagram.rightFoot ?? [60, 96]]);
  const [hx, hy] = at(50, 18);
  ctx.beginPath();
  ctx.arc(hx, hy, 8 * scale, 0, Math.PI * 2);
  ctx.stroke();
  // The arms are what the move is about: drawn last, thicker, in the accent colour.
  ctx.strokeStyle = accent;
  ctx.lineWidth = 7 * scale;
  line([[38, 32], diagram.leftElbow, diagram.leftWrist]);
  line([[62, 32], diagram.rightElbow, diagram.rightWrist]);
  ctx.fillStyle = accent;
  for (const [x, y] of [diagram.leftWrist, diagram.rightWrist]) {
    const [px, py] = at(x, y);
    ctx.beginPath();
    ctx.arc(px, py, 5.5 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
}

function label(ctx: CanvasRenderingContext2D, text: string, box: Rect, size: number, font: string, colour: string, align: CanvasTextAlign = "left"): void {
  ctx.font = `700 ${String(size)}px ${font}`;
  ctx.fillStyle = colour;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  const x = align === "left" ? box.x : align === "right" ? box.x + box.w : box.x + box.w / 2;
  ctx.fillText(text, x, box.y + box.h / 2, box.w);
}

export function drawFrame(ctx: CanvasRenderingContext2D, layout: FrameLayout, hud: FrameHud, picture: PictureSource | null): void {
  const tone = TONES[hud.tone];
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, layout.width, layout.height);

  if (picture && picture.width > 0 && picture.height > 0) {
    // The hero stands a little left of the middle and the monster right of it: keep the middle.
    const from = coverCrop(picture.width, picture.height, layout.picture);
    ctx.drawImage(picture.image, from.x, from.y, from.w, from.h, layout.picture.x, layout.picture.y, layout.picture.w, layout.picture.h);
  }

  // A dark band behind the bars so they read over any scene.
  const top = Math.max(layout.enemyBar.y + layout.enemyBar.h, layout.clock.y + layout.clock.h) + 12;
  ctx.fillStyle = "rgba(23, 17, 13, 0.78)";
  if (layout.picture.y === 0) ctx.fillRect(0, 0, layout.picture.w, top);
  label(ctx, hud.enemyName.toUpperCase(), layout.enemyName, fitFont(hud.enemyName.length, layout.enemyName.w, 36), DISPLAY, BONE);
  if (hud.clock !== null) label(ctx, hud.clock, layout.clock, 36, LABEL, "#ffd9a0", "right");
  bar(ctx, layout.enemyBar, hud.enemyShare, "#c8612f");
  if (layout.picture.y === 0) {
    ctx.fillStyle = "rgba(23, 17, 13, 0.78)";
    ctx.fillRect(0, layout.heroLabel.y - 12, layout.picture.w, layout.height - layout.heroLabel.y + 12);
  }
  label(ctx, "HEROES", layout.heroLabel, 24, LABEL, BONE);
  bar(ctx, layout.heroBar, hud.heroShare, "#7fae5b");

  // The prompt card.
  ctx.fillStyle = tone.plate;
  ctx.fillRect(layout.card.x, layout.card.y, layout.card.w, layout.card.h);
  ctx.fillStyle = tone.accent;
  ctx.fillRect(layout.card.x, layout.card.y, layout.card.w, 8);
  label(ctx, hud.tag, layout.tag, fitFont(hud.tag.length, layout.tag.w, 40), LABEL, tone.accent, "center");

  const wide = hud.diagram === null;
  const wordBox: Rect = wide ? { x: layout.tag.x, y: layout.word.y, w: layout.tag.w, h: layout.word.h } : layout.word;
  const lineBox: Rect = wide ? { x: layout.tag.x, y: layout.line.y, w: layout.tag.w, h: layout.line.h } : layout.line;
  if (hud.diagram) figure(ctx, layout.figure, hud.diagram, tone.text, tone.accent);

  // The move's word, on up to two lines, as large as fits.
  const words = hud.word.split(" ");
  const twoLines = words.length > 1 && hud.word.length > 9;
  const half = Math.ceil(words.length / 2);
  const rows = twoLines ? [words.slice(0, half).join(" "), words.slice(half).join(" ")] : [hud.word];
  const longest = Math.max(...rows.map((row) => row.length));
  const wordSize = Math.min(fitFont(longest, wordBox.w, 120), Math.floor(wordBox.h / rows.length));
  rows.forEach((row, index) => {
    const rowBox: Rect = { x: wordBox.x, y: wordBox.y + (wordBox.h / rows.length) * index, w: wordBox.w, h: wordBox.h / rows.length };
    label(ctx, row, rowBox, wordSize, DISPLAY, tone.text, "center");
  });

  const lineSize = 30;
  ctx.font = `600 ${String(lineSize)}px ${LABEL}`;
  const lines = wrapLines(hud.line, lineBox.w, (text) => ctx.measureText(text).width, Math.max(1, Math.floor(lineBox.h / (lineSize * 1.25))));
  lines.forEach((text, index) => {
    ctx.font = `600 ${String(lineSize)}px ${LABEL}`;
    ctx.fillStyle = tone.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(text, lineBox.x + lineBox.w / 2, lineBox.y + index * lineSize * 1.25, lineBox.w);
  });

  if (hud.timer !== null) bar(ctx, layout.timer, hud.timer, tone.accent);

  if (hud.grade !== null) {
    ctx.font = `700 ${String(fitFont(hud.grade.length, layout.grade.w, 96))}px ${DISPLAY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 10;
    ctx.strokeStyle = INK;
    ctx.fillStyle = "#ffd9a0";
    const x = layout.grade.x + layout.grade.w / 2, y = layout.grade.y + layout.grade.h / 2;
    ctx.strokeText(hud.grade, x, y, layout.grade.w);
    ctx.fillText(hud.grade, x, y, layout.grade.w);
  }
}
