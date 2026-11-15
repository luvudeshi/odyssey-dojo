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

/**
 * Characters that take no room on the screen: the second block of control characters, format characters (zero-width
 * space and joiners, soft hyphen, the marks that turn text right to left) and the fillers that draw as nothing.
 */
const UNSEEN = /[\u0080-\u009f\p{Cf}\u034f\u115f\u1160\u17b4\u17b5\u180b-\u180f\u2800\u3164\uffa0]/gu;

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
 * control characters dropped, cut to NAME_MAX. Characters nobody can see are dropped too, so two accounts cannot
 * have names that look the same and a name cannot be blank on the screen. Then the spaces at both ends go, because a
 * phone keyboard adds one after a word and "Odysseus " must sign in as "Odysseus". What is left must be NAME_MIN
 * characters or more. Letters of two alphabets that look alike are not told apart from each other: docs/accounts.md.
 */
export function accountName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = [...raw].filter(printable).join("").replace(UNSEEN, "").slice(0, NAME_MAX).trim();
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

// The save. The profile, the settings and the character are stored as whole objects and given back as they came,
// so a field the game adds later needs no change here and is never dropped on the way through. What is checked is
// size and shape only: how deep, how many keys, how long a list or a text, how large a number, and that Postgres
// can store every text. The 32 KB body limit holds the whole. A text value is tidied, not refused, so a name cut in
// the middle of an emoji cannot stop a player's game from being saved.
/** Keys in one object, entries in one list, and how many objects or lists may sit inside each other below a part. */
export const SAVE_KEYS_MAX = 200;
export const SAVE_LIST_MAX = 200;
export const SAVE_DEPTH = 3;
export const SAVE_TEXT_MAX = 200;
export const SAVE_NUMBER_MAX = 1e12;

const text = (max: number): z.ZodType<string> => z.string().max(max).transform(tidy);
/** The id of an achievement. Ids are written in code, so an odd one is refused. */
const id = z.string().min(1).max(60).refine(isPlainText, "not plain text");
/** The name of a field, a move or a setting. It becomes a key in the stored document, so an odd one is refused. */
const key = z.string().min(1).max(60).refine(isPlainText, "not plain text");
const leaf = z.union([text(SAVE_TEXT_MAX), z.number().min(-SAVE_NUMBER_MAX).max(SAVE_NUMBER_MAX), z.boolean(), z.null()]);
const atMost = (keys: number) => (value: Readonly<Record<string, unknown>>): boolean => Object.keys(value).length <= keys;

/** A JSON value with at most `depth` objects or lists inside each other. */
function bounded(depth: number): z.ZodType<unknown> {
  if (depth === 0) return leaf;
  const below = bounded(depth - 1);
  return z.union([leaf, z.array(below).max(SAVE_LIST_MAX), z.record(key, below).refine(atMost(SAVE_KEYS_MAX), "too many keys")]);
}

/** One part of a save: an object of any fields, each a bounded value. */
const part = z.record(key, bounded(SAVE_DEPTH)).refine(atMost(SAVE_KEYS_MAX), "too many keys");

export const saveSchema = z.object({
  version: z.literal(1),
  profile: part,
  settings: part,
  character: z.union([text(60), part, z.null()]),
  achievements: z.array(id).max(SAVE_LIST_MAX).optional(),
});
export type Save = z.infer<typeof saveSchema>;

const saveBodySchema = z.object({ save: saveSchema });

/** The save in a PUT body, or null when it is not a save. Fields beside the four parts of a save are left out; fields inside a part are kept. */
export function parseSaveBody(body: unknown): Save | null {
  const parsed = saveBodySchema.safeParse(body);
  return parsed.success ? parsed.data.save : null;
}

export interface Renaming {
  readonly name: string;
}

export interface PasswordChange {
  readonly current: string;
  readonly next: string;
}

const renameSchema = z.object({ name: z.string() });
const passwordChangeSchema = z.object({ current: z.string().max(PASSWORD_MAX), next: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX) });

/** The new sign-in name in a rename body, cleaned by the rule a sign-up name goes by, or which part is wrong. */
export function parseRename(body: unknown): Renaming | { readonly field: "body" | "name" } {
  const parsed = renameSchema.safeParse(body);
  if (!parsed.success) return { field: "body" };
  const name = accountName(parsed.data.name);
  return name === null ? { field: "name" } : { name };
}

/** The two passwords in a change-password body. `current` is only checked to be text: whether it is right is for the account to say. */
export function parsePasswordChange(body: unknown): PasswordChange | { readonly field: "body" | "current" | "next" } {
  const parsed = passwordChangeSchema.safeParse(body);
  if (parsed.success) return parsed.data;
  const first = parsed.error.issues[0]?.path[0];
  return { field: first === "current" || first === "next" ? first : "body" };
}
