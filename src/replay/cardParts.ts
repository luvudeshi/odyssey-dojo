// The painted parts of the god card: background glow, portrait in its ring, divider and score.
import { drawCover } from "./cardImage";
import { GOLD, INK, MARBLE, SERIF } from "./cardPalette";
import { drawText, fillLines, measureWith } from "./cardText";
import type { TextStyle } from "./cardText";
import type { Rect } from "./rect";
import { fitFontSize } from "./textFit";

const TAU = Math.PI * 2;
// The score row holds a small "SCORE" label above the numerals.
const SCORE_LABEL_SHARE = 0.22;

/** Dark ink over the whole card, lit faintly from behind the portrait at `face`. */
export function drawBackground(context: CanvasRenderingContext2D, face: Rect, width: number, height: number): void {
  context.fillStyle = INK;
  context.fillRect(0, 0, width, height);
  const cx = face.x + face.width / 2;
  const cy = face.y + face.height / 2;
  const glow = context.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.7);
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

/** The circular portrait, or the emblem when there is none to draw, inside a ring of the accent colour. */
export function drawPortrait(
  context: CanvasRenderingContext2D,
  portrait: CanvasImageSource | null,
  godName: string,
  accent: string,
  box: Rect,
): void {
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
  if (!portrait || !drawCover(context, portrait, box)) drawEmblem(context, godName, box);
  context.restore();

  context.save();
  context.lineWidth = ring;
  // An unparseable colour is ignored on assignment, which leaves the gold in place.
  context.strokeStyle = GOLD;
  context.strokeStyle = accent;
  context.shadowColor = GOLD;
  context.shadowColor = accent;
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
export function drawDivider(context: CanvasRenderingContext2D, box: Rect): void {
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

/** A small "SCORE" label over the numerals, which shrink as far as they must to stay on one line inside `box`. */
export function drawScore(context: CanvasRenderingContext2D, score: number, box: Rect, maxSize: number): void {
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
