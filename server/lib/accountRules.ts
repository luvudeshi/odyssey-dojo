// What the account routes accept: the hero name, the password and the saved game. Pure rules and zod schemas:
// no database, no crypto, no Node, so a browser test can hold them against src/account/store.ts (tests/accountRules.test.ts).
import { z } from "zod";

export const NAME_MIN = 3;
/** The same as NAME_MAX in src/account/store.ts. Not imported: that file needs React and the browser. */
export const NAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;
/** A sign-up or sign-in body: a name and a password. 200 characters of the widest kind, written as JSON escapes, still fit. */
export const CREDENTIALS_BODY_BYTES = 2048;
/** The whole body of a save, as JSON. */
export const SAVE_BODY_BYTES = 32 * 1024;

/** Half of a character that needs two halves. Postgres refuses it inside a JSON document. */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

const printable = (ch: string): boolean => ch >= " " && ch !== "\u007f";

/** True when the text has no control character and no half character, so Postgres can store it as it is. */
export function isPlainText(text: string): boolean {
  return [...text].every(printable) && text.search(LONE_SURROGATE) < 0;
}

/** The text with control characters dropped and each half character turned into the replacement mark. */
export function tidy(text: string): string {
  return [...text].filter(printable).join("").replace(LONE_SURROGATE, "\ufffd");
}

/**
 * The hero name of an account, or null when it cannot be one. The cleaning is cleanName's (src/account/store.ts):
 * control characters dropped, cut to NAME_MAX. Then the spaces at both ends go, because a phone keyboard adds one
 * after a word and "Odysseus " must sign in as "Odysseus". What is left must be NAME_MIN characters or more.
 */
export function accountName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = [...raw].filter(printable).join("").slice(0, NAME_MAX).trim();
  // The cut can leave half a character at the end. Such a name is refused, not mended: it is what the player signs in with.
  return name.length >= NAME_MIN && isPlainText(name) ? name : null;
}

/**
 * What makes two names the same account: case, the way an accent was typed (one character or two) and the number
 * of spaces between words do not count.
 */
export function nameKey(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

export interface Credentials {
  readonly name: string;
  readonly password: string;
}

export interface Invalid {
  readonly field: "body" | "name" | "password";
}

const credentialsSchema = z.object({ name: z.string(), password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX) });

/** A sign-up or sign-in body, with the name cleaned, or which part of it is wrong. */
export function parseCredentials(body: unknown): Credentials | Invalid {
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.path[0];
    return { field: first === "name" || first === "password" ? first : "body" };
  }
  const name = accountName(parsed.data.name);
  return name === null ? { field: "name" } : { name, password: parsed.data.password };
}

// The save. The bounds are those of the browser's own check of what it sends, and the 32 KB body limit holds the whole.
// A string value is tidied, not refused, so a name cut in the middle of an emoji cannot stop a player's game from being saved.
const text = (max: number): z.ZodType<string> => z.string().max(max).transform(tidy);
/** The id of a stop, a move or an achievement, also used as a key. Ids are written in code, so an odd one is refused. */
const id = z.string().min(1).max(60).refine(isPlainText, "not plain text");
const tally = z.number().int().min(0).max(1e9);
const key = z.string().min(1).max(40).refine(isPlainText, "not plain text");
/** A setting or a part of a character: a short plain value, nothing nested. */
const plain = z.union([text(200), z.number().min(-1e9).max(1e9), z.boolean(), z.null()]);
const atMost = (keys: number) => (value: Readonly<Record<string, unknown>>): boolean => Object.keys(value).length <= keys;
const plainObject = z.record(key, plain).refine(atMost(40), "too many keys");

export const saveSchema = z.object({
  version: z.literal(1),
  profile: z.object({
    name: text(NAME_MAX),
    cleared: z.array(id).max(100),
    moves: z.record(id, tally).refine(atMost(200), "too many moves"),
    bestScore: tally,
    fights: tally,
    wins: tally,
  }),
  settings: plainObject,
  character: z.union([text(40), plainObject, z.null()]),
  achievements: z.array(id).max(200).optional(),
});
export type Save = z.infer<typeof saveSchema>;

const saveBodySchema = z.object({ save: saveSchema });

/** The save in a PUT body, with unknown fields left out, or null when it is not a save. */
export function parseSaveBody(body: unknown): Save | null {
  const parsed = saveBodySchema.safeParse(body);
  return parsed.success ? parsed.data.save : null;
}
