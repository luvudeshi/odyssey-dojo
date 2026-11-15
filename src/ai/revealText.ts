// How the reveal's reason is made to read as a sentence. The server's guard and the browser's own scan share this rule.
import { GOD_IDS, RevealSchema } from "./contracts";

export const REASON_MAX = RevealSchema.shape.reason.maxLength ?? 240;

// Quotation marks around the whole line and none inside it.
const QUOTED = /^["“]([^"“”]*)["”]$/;
const CLOSING_MARKS = /[\s.,;:!?…]+$/;
// The prompt lists the gods by their lower-case ids, and the model sometimes writes a name that way ("of apollo").
const GOD_NAME = new RegExp(`\\b(?:${GOD_IDS.join("|")})\\b`, "gi");
const proper = (name: string): string => `${name.charAt(0).toUpperCase()}${name.slice(1).toLowerCase()}`;

/** Single spaces, none before a comma or a stop, and no quotation marks around the whole line. */
export const oneLine = (text: string): string =>
  text.replace(/\s+/g, " ").replace(/ ([,.;:!?])/g, "$1").trim().replace(QUOTED, "$1").trim();

/** The reason as shown on its own line: a capital to start and on each god's name, one full stop at the end, at most `max` long. */
export function asSentence(text: string, max = REASON_MAX): string {
  let body = oneLine(text).replace(CLOSING_MARKS, "").replace(GOD_NAME, proper);
  if (body.length > max - 1) {
    // Cut between words when that keeps most of the line, and leave room for the full stop.
    const cut = body.slice(0, max);
    const space = cut.lastIndexOf(" ");
    body = (space > max / 2 ? cut.slice(0, space) : cut.slice(0, max - 1)).replace(CLOSING_MARKS, "");
  }
  return body === "" ? "" : `${body.charAt(0).toUpperCase()}${body.slice(1)}.`;
}
