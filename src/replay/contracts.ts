// What the replay share passes between the browser and the server. Pure data and zod schemas: no DOM, no Node.
import { z } from "zod";

export const CARD_PREFIX = "data:image/png;base64,";
/** The server reads JSON bodies up to 6 MB, and base64 makes a picture a third bigger, so a card must stay under this. */
export const MAX_CARD_BYTES = 4_000_000;
export const MAX_VIDEO_BYTES = 64 * 1024 * 1024;

const PNG_SIGNATURE: readonly number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** True when the bytes start the way every PNG file does. The card is always sent and stored as one. */
export function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

/** What the phone page says about the fight. */
export const ReplayMetaSchema = z.object({
  godName: z.string().max(60),
  epithet: z.string().max(120),
  enemyName: z.string().max(60),
  fightTitle: z.string().max(120),
  score: z.number().min(-1e9).max(1e9),
  won: z.boolean(),
});
export type ReplayMeta = Readonly<z.infer<typeof ReplayMetaSchema>>;

export const CreateReplayRequestSchema = z.object({
  meta: ReplayMetaSchema,
  /** The god card as a PNG data URL, or null when there is no picture. */
  card: z.string().startsWith(CARD_PREFIX).max(6_000_000).nullable(),
});
export type CreateReplayRequest = Readonly<z.infer<typeof CreateReplayRequestSchema>>;

export const CreateReplayResponseSchema = z.object({
  id: z.string().min(1).max(40),
  /** The absolute address a phone should open. */
  page_url: z.string().min(1),
  /** A path on this server that draws page_url as a QR code. */
  qr_url: z.string().min(1),
});
export type CreateReplayResponse = Readonly<z.infer<typeof CreateReplayResponseSchema>>;
