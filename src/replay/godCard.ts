// The "god card": a Greek trading card of the player's fight, painted on a 2D canvas for them to keep.
import { log } from "../core/log";
import { drawQr } from "./cardImage";
import { cardLayout } from "./cardLayout";
import { DEFEAT, GOLD, MARBLE, SERIF } from "./cardPalette";
import { drawBackground, drawDivider, drawPortrait, drawScore } from "./cardParts";
import { drawText } from "./cardText";
import type { TextStyle } from "./cardText";
import { drawMeander } from "./meander";

export { cardLayout } from "./cardLayout";
export type { CardBlock, CardLayout, CardText } from "./cardLayout";

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
  /** A picture that has not loaded, or is broken, is replaced by a placeholder emblem. */
  readonly portrait: CanvasImageSource | null;
  /** A code that has not loaded, or is broken, is left out and the footer takes its place. */
  readonly qr: CanvasImageSource | null;
  readonly footer: string;
}

const FONT_WAIT_MS = 800;
// Every style and weight of the serif that the card is set in.
const FACES = ["normal 700", "normal 600", "normal 400", "italic 400"] as const;

function paint(context: CanvasRenderingContext2D, data: GodCardData, width: number, height: number): void {
  const layout = cardLayout(width, height);
  const { blocks, fonts } = layout;
  drawBackground(context, blocks.portrait, width, height);
  drawMeander(context, layout.border, layout.cell, GOLD);
  drawPortrait(context, data.portrait, data.godName, data.accent, blocks.portrait);

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
  try {
    context.save();
    try {
      paint(context, data, width, height);
    } finally {
      context.restore();
    }
  } catch (error) {
    log("warn", "godCard.drawFailed", error);
  }
}

/**
 * Waits briefly for the page's serif, in every face the card uses, so the card is not set in a fallback font.
 * Never rejects: with no Font Loading API (some embedded webviews) the card is drawn in whatever serif there is.
 */
async function fontsReady(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const fonts = (document as { fonts?: FontFaceSet }).fonts;
    if (!fonts) return;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, FONT_WAIT_MS);
    });
    const loaded = Promise.all(FACES.map((face) => fonts.load(`${face} 48px ${SERIF}`)));
    await Promise.race([loaded, timeout]);
  } catch (error) {
    log("warn", "godCard.fontsFailed", error);
  } finally {
    clearTimeout(timer);
  }
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
