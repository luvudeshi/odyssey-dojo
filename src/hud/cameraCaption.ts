// The camera panel's caption: is the body tracked, and which move did the detector just recognise.
import type { PoseFrame } from "../core/types";
import { presenceAt } from "../pose/presence";
import type { Presence } from "../pose/presence";

export const FLASH_SECONDS = 0.8;

/** The fight's own presence check on the newest frame, so the caption and the step-back pause cannot disagree. */
export function presenceOf(frame: PoseFrame | null, nowMs: number): Presence {
  return presenceAt({ frames: frame ? [frame] : [], baseline: null }, nowMs);
}

export interface Flash { readonly name: string; readonly at: number; readonly held: ReadonlySet<string>; readonly strikes: number }
export const NO_FLASH: Flash = { name: "", at: -Infinity, held: new Set(), strikes: 0 };

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => a.size === b.size && [...a].every((id) => b.has(id));

/**
 * A strike the panel has not shown yet (a new strike count, which no clock shift can change), or a defend that was not
 * held a moment ago, starts a flash. Seconds throughout. Returns `prev` itself when nothing changed.
 */
export function nextFlash(
  prev: Flash, seen: { held: ReadonlySet<string>; struckMove: string; strikes: number }, now: number, nameOf: (id: string) => string,
): Flash {
  const pressed = [...seen.held].find((id) => !prev.held.has(id));
  if (seen.strikes !== prev.strikes && seen.struckMove) return { name: nameOf(seen.struckMove), at: now, held: seen.held, strikes: seen.strikes };
  if (pressed) return { name: nameOf(pressed), at: now, held: seen.held, strikes: seen.strikes };
  if (seen.strikes === prev.strikes && sameSet(seen.held, prev.held)) return prev;
  return { ...prev, held: seen.held, strikes: seen.strikes };
}

export function flashText(flash: Flash, now: number): string {
  return now - flash.at < FLASH_SECONDS ? flash.name : "";
}
