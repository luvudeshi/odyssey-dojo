// The one table of what each quest stop sounds like: the ambience that loops under its fight, and the clip it plays
// for a combat event in place of the game's usual sound. Clip names are files: public/audio/stops/<enemy id>/<clip>.mp3.
// A stop with no entry, an attack that is not listed and an event that is not listed all keep the usual sounds.
import type { CombatEvent } from "../core/types";

/** The events a stop can give its own sound, besides an attack's warning and its landing, which go by attack id. */
export type StopEventType = Exclude<CombatEvent["type"], "telegraph" | "playerHit">;

export interface StopSounds {
  /** The clip that loops for the whole fight. */
  readonly ambience: string;
  /** The sound of each attack winding up, by attack id. */
  readonly telegraph: Readonly<Record<string, string>>;
  /** The sound of each attack landing on the player, by attack id. */
  readonly playerHit: Readonly<Record<string, string>>;
  /** The sound of any other event. */
  readonly events: Readonly<Partial<Record<StopEventType, string>>>;
}

/** Keyed by enemy id. Polyphemus is left out on purpose: his fight keeps the sounds it has. */
export const STOP_SOUNDS: Readonly<Record<string, StopSounds>> = {
  // Her hall: a fire indoors and the forest at night outside.
  circe: {
    ambience: "ambience",
    telegraph: { wand_left: "wand", wand_right: "wand", spell: "wand" },
    // Her wand turns men into swine.
    playerHit: { wand_left: "squeal", wand_right: "squeal", spell: "squeal" },
    events: { enemyHit: "hurt", finished: "defeat" },
  },
  // Their meadow: a calm sea and a song with no words.
  sirens: {
    ambience: "ambience",
    telegraph: { song: "note", swoop_left: "swoop", swoop_right: "swoop", talons: "swoop" },
    playerHit: { song: "wave", swoop_left: "wave", swoop_right: "wave", talons: "wave" },
    events: { enemyHit: "hurt" },
  },
  // Her strait: wind between the cliffs and water on rock.
  scylla: {
    ambience: "ambience",
    telegraph: { head_left: "snarl", head_right: "snarl", head_high: "snarl", head_center: "snarl" },
    playerHit: { head_left: "snap", head_right: "snap", head_high: "snap", head_center: "snap" },
    events: { enemyHit: "hurt", phaseChanged: "howl" },
  },
  // The whirlpool itself.
  charybdis: {
    ambience: "ambience",
    telegraph: { undertow: "gulp", spout: "spout", surge_left: "spout", surge_right: "spout" },
    playerHit: { undertow: "crash", spout: "crash", surge_left: "crash", surge_right: "crash" },
    events: { enemyHit: "hurt" },
  },
  // The hall of Ithaca: a hearth and a crowd of men.
  suitors: {
    ambience: "ambience",
    telegraph: { spear_left: "throw", spear_right: "throw", ox_hoof: "throw", sword_rush: "sword" },
    playerHit: { spear_left: "jeer", spear_right: "jeer", ox_hoof: "jeer", sword_rush: "jeer" },
    events: { enemyHit: "hurt", finished: "hurt", phaseChanged: "jeer" },
  },
};

function soundsOf(enemyId: string): StopSounds | null {
  return Object.hasOwn(STOP_SOUNDS, enemyId) ? (STOP_SOUNDS[enemyId] ?? null) : null;
}

function pick(table: Readonly<Partial<Record<string, string>>>, key: string): string | null {
  return Object.hasOwn(table, key) ? (table[key] ?? null) : null;
}

/** The ambience clip of a stop, or null for a stop with none. */
export function stopAmbience(enemyId: string): string | null {
  return soundsOf(enemyId)?.ambience ?? null;
}

/** The clip a stop plays for a combat event, or null when the usual sound should play. */
export function stopClipFor(enemyId: string, event: CombatEvent): string | null {
  const sounds = soundsOf(enemyId);
  if (!sounds) return null;
  if (event.type === "telegraph") return pick(sounds.telegraph, event.attack.id);
  if (event.type === "playerHit") return pick(sounds.playerHit, event.attack.id);
  return pick(sounds.events, event.type);
}

/** Every clip a stop uses, each once, the ambience first. Empty for a stop with no entry. */
export function stopClips(enemyId: string): readonly string[] {
  const sounds = soundsOf(enemyId);
  if (!sounds) return [];
  const names = [sounds.ambience, ...Object.values(sounds.telegraph), ...Object.values(sounds.playerHit), ...Object.values(sounds.events)];
  return [...new Set(names)];
}

/** The name a clip goes by in public/audio/stops/index.json, which is also its path there without ".mp3". */
export function stopClipKey(enemyId: string, clip: string): string {
  return `${enemyId}/${clip}`;
}
