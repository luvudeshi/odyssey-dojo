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

// The bounds of a save. The server holds the same ones (server/lib/accountRules.ts; tests/accountRules.test.ts keeps
// the two alike). They say how large a save may be, never which fields it has: the profile and the settings travel
// as whole objects, so a field added to either needs no change here or on the server.
/** Keys in one object, entries in one list, and how many objects or lists may sit inside each other below a part. */
export const SAVE_KEYS_MAX = 200;
export const SAVE_LIST_MAX = 200;
export const SAVE_DEPTH = 3;
export const SAVE_TEXT_MAX = 200;
export const SAVE_NUMBER_MAX = 1e12;

const id = z.string().min(1).max(60);
const key = z.string().min(1).max(60);
const leaf = z.union([z.string().max(SAVE_TEXT_MAX), z.number().min(-SAVE_NUMBER_MAX).max(SAVE_NUMBER_MAX), z.boolean(), z.null()]);
const atMost = (keys: number) => (value: Readonly<Record<string, unknown>>): boolean => Object.keys(value).length <= keys;

/** A JSON value with at most `depth` objects or lists inside each other. */
function bounded(depth: number): z.ZodType<unknown> {
  if (depth === 0) return leaf;
  const below = bounded(depth - 1);
  return z.union([leaf, z.array(below).max(SAVE_LIST_MAX), z.record(key, below).refine(atMost(SAVE_KEYS_MAX), "too many keys")]);
}

/** One part of a save: an object of any fields, each a bounded value. */
const part = z.record(key, bounded(SAVE_DEPTH)).refine(atMost(SAVE_KEYS_MAX), "too many keys");

export const SaveSchema = z.object({
  version: z.literal(1),
  /** The whole Profile of ./store, read back through parseProfile. */
  profile: part,
  /** The settings that go with the player (SYNCED_SETTINGS in ./snapshot), read back through parseSettings. */
  settings: part,
  character: z.union([z.string().max(60), part, z.null()]),
  achievements: z.array(id).max(SAVE_LIST_MAX).optional(),
});
export type Save = z.infer<typeof SaveSchema>;

export const StatusResponseSchema = z.object({ available: z.boolean() });
export const SessionResponseSchema = z.object({ token: z.string().min(20).max(200), name: z.string().min(1).max(ACCOUNT_NAME_MAX) });
export const SaveResponseSchema = z.object({ save: z.unknown(), updatedAt: z.string().max(60).nullable() });
export const SavedResponseSchema = z.object({ updatedAt: z.string().max(60) });
export const RenamedResponseSchema = z.object({ name: z.string().min(1).max(ACCOUNT_NAME_MAX) });
