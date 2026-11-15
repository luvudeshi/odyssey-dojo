// What the god scan must never say about a player (their body, age, looks or gender), how its lines are tidied
// for the screen, and the fixed lines used when one cannot be shown.
import type { GodId } from "../src/ai/contracts";
import { oneLine } from "../src/ai/revealText";

const WORDS = [
  "hair", "hairs", "haired", "blond", "blonde", "bald", "beard", "bearded",
  "skin", "skinned", "eye", "eyes", "eyed", "armed", "cheek", "cheeks", "cheeked", "face", "faced", "body", "bodied",
  "beautiful", "beauty", "handsome", "pretty", "lovely", "attractive", "gorgeous", "cute",
  "young", "youth", "youthful", "old", "aged", "elderly", "slim", "slender", "thin", "fat", "tall", "short",
  "lord", "lady", "maiden", "king", "queen", "prince", "princess", "sir", "girl", "boy", "man", "woman", "men", "women",
  "father", "mother", "son", "daughter",
] as const;

// Whole words only, so "command", "bold" and "striking" pass.
const FORBIDDEN = new RegExp(`\\b(?:${WORDS.join("|")})\\b`, "i");

/** True when the text names a body part, age, looks or gender. Errs on the side of yes: a false alarm only costs a fixed line. */
export const speaksOfThePlayer = (text: string): boolean => FORBIDDEN.test(text);

// The prompt asks for the reason to be written to the player as "you".
const TO_THE_PLAYER = /\byou(?:rs?|rself)?\b/i;
// The model saying that it found nobody in the picture. The scan always answers, and never says so.
const SEES_NOBODY =
  /\b(?:no (?:[a-z]+ ){0,2}(?:person|player|people|human|figure)|(?:no one|nobody|anyone|anybody) (?:is|was|can be|appears?|in|here|there|visible)|(?:cannot|can't|could not|couldn't|unable to|do not|don't|did not|didn't) (?:see|find|make out|detect)|not (?:visible|present|in (?:the |this )?(?:frame|photo|picture|image))|absent from|without (?:a|any) (?:person|player|figure)|(?:frame|photo|picture|image|scene) (?:is|was|stands?) empty|empty (?:frame|photo|picture|image|scene|room)|test pattern)\b/i;

/** The epithet as shown under the god's name: one line, no closing stop, comma or dash, lower case as the prompt asks. */
export function asEpithet(text: string, max: number): string {
  // Cut first, so that the cut cannot leave a comma, a dash or half an emoji at the end.
  const line = oneLine(text).slice(0, max).replace(/[\ud800-\udbff]$/, "").replace(/[\s.,;:!\-–—]+$/, "");
  // "Storm-Hearted, Unyielding" and "Slayer Of Argus" are lowered whole.
  if (!/(?:^|[\s-])[a-z]/.test(line)) return line.toLowerCase();
  // Otherwise a capital is kept only on a name after "of": "Quick-witted and Laughing" is lowered, "Slayer of Argus" keeps Argus.
  return line.replace(/(^|[\s-])(\p{Lu})/gu, (whole: string, gap: string, letter: string, at: number) =>
    /\bof $/i.test(line.slice(0, at + gap.length)) ? whole : gap + letter.toLowerCase());
}

/**
 * True when a tidied line cannot be shown. Either line: it is empty or speaks of the player's body, age, looks or gender. The
 * epithet: it names the god, whose name is already printed above it. The reason: it names the god twice, is not
 * written to the player as "you", or says that nobody is in the picture.
 */
export function unfit(god: GodId, field: "epithet" | "reason", text: string): boolean {
  if (text === "" || speaksOfThePlayer(text)) return true;
  const named = text.toLowerCase().split(god).length - 1;
  if (field === "epithet") return named > 0;
  return named > 1 || !TO_THE_PLAYER.test(text) || SEES_NOBODY.test(text);
}

/** One line per god about spirit and bearing only, used when the model's own line is unfit. */
export const SAFE_LINES: Readonly<Record<GodId, { readonly epithet: string; readonly reason: string }>> = {
  zeus: { epithet: "cloud-gathering, steadfast", reason: "You hold your ground like one used to command, and the storm waits on your word." },
  poseidon: { epithet: "earth-shaking, restless", reason: "Your stance surges like a rising tide that nothing can hold back." },
  athena: { epithet: "quick-witted, unyielding", reason: "Your stance is calm and measured, the poise of one who has already planned the win." },
  hermes: { epithet: "light-stepping, laughing", reason: "There is a quick, playful energy in your pose, as if you are already a step ahead." },
  artemis: { epithet: "far-ranging, sure-aimed", reason: "Your pose is poised and alert, ready to spring the moment the fight begins." },
  apollo: { epithet: "far-shooting, radiant", reason: "Your pose is bright and at ease, with the grace of one who makes it look simple." },
};
