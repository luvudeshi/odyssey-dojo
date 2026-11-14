// What the god scan must never say about a player (their body, age, looks or gender), and the fixed lines used instead.
import type { GodId } from "../src/ai/contracts";

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

/** One line per god about spirit and bearing only, used when the model's own line fails the check above. */
export const SAFE_LINES: Readonly<Record<GodId, { readonly epithet: string; readonly reason: string }>> = {
  zeus: { epithet: "cloud-gathering, steadfast", reason: "You hold your ground like one used to command, and the storm waits on your word." },
  poseidon: { epithet: "earth-shaking, restless", reason: "Your stance surges like a rising tide that nothing can hold back." },
  athena: { epithet: "quick-witted, unyielding", reason: "Your stance is calm and measured, the poise of one who has already planned the win." },
  hermes: { epithet: "light-stepping, laughing", reason: "There is a quick, playful energy in your pose, as if you are already a step ahead." },
  artemis: { epithet: "far-ranging, sure-aimed", reason: "Your pose is poised and alert, ready to spring the moment the fight begins." },
  apollo: { epithet: "far-shooting, radiant", reason: "Your pose is bright and at ease, with the grace of one who makes it look simple." },
};
