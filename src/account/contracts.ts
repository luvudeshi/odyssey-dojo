// What the account routes (/api/account/*) and the browser pass each other. Pure data and zod schemas: no DOM, no Node.
// The save is one document per account: the profile, the settings and the character of one player.
import { z } from "zod";

export const ACCOUNT_NAME_MIN = 3;
/** The same as NAME_MAX in ./store (tests/accountSave.test.ts checks). Not imported, so the server can read this file without React. */
export const ACCOUNT_NAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;
/** The whole body of a save, as JSON, may be at most this many bytes. */
export const SAVE_MAX_BYTES = 32 * 1024;

const id = z.string().min(1).max(60);
const tally = z.number().int().min(0).max(1e9);
/** A setting or a part of a character: a short plain value, nothing nested. */
const plain = z.union([z.string().max(200), z.number().min(-1e9).max(1e9), z.boolean(), z.null()]);
const plainObject = z.record(z.string().min(1).max(40), plain).refine((value) => Object.keys(value).length <= 40, "too many keys");

export const SaveSchema = z.object({
  version: z.literal(1),
  profile: z.object({
    name: z.string().max(ACCOUNT_NAME_MAX),
    cleared: z.array(id).max(100),
    moves: z.record(id, tally).refine((value) => Object.keys(value).length <= 200, "too many moves"),
    bestScore: tally,
    fights: tally,
    wins: tally,
  }),
  settings: plainObject,
  character: z.union([z.string().max(40), plainObject, z.null()]),
  achievements: z.array(id).max(200).optional(),
});
export type Save = z.infer<typeof SaveSchema>;

export const StatusResponseSchema = z.object({ available: z.boolean() });
export const SessionResponseSchema = z.object({ token: z.string().min(20).max(200), name: z.string().min(1).max(ACCOUNT_NAME_MAX) });
export const SaveResponseSchema = z.object({ save: z.unknown(), updatedAt: z.string().max(60).nullable() });
export const SavedResponseSchema = z.object({ updatedAt: z.string().max(60) });
