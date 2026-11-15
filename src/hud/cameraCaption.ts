// The camera panel's caption: is the body tracked, and which move did the detector just recognise.
import type { PoseFrame } from "../core/types";
import { JOINT, joint } from "../pose/signals";

/** A frame older than this and the tracker has lost the player. */
const STALE_MS = 500;
export const FLASH_SECONDS = 0.8;
const BODY = [JOINT.leftShoulder, JOINT.rightShoulder, JOINT.leftHip, JOINT.rightHip] as const;

export function isTracking(frame: PoseFrame | null, nowMs: number): boolean {
  if (!frame || nowMs - frame.t > STALE_MS) return false;
  return BODY.every((index) => joint(frame.image, index).visibility >= 0.5);
}

export interface Flash { readonly name: string; readonly at: number; readonly held: ReadonlySet<string>; readonly struckAt: number }
export const NO_FLASH: Flash = { name: "", at: -Infinity, held: new Set(), struckAt: -Infinity };

/** A strike with a new timestamp, or a defend that was not held a moment ago, starts a flash. Seconds throughout. */
export function nextFlash(
  prev: Flash, seen: { held: ReadonlySet<string>; struckMove: string; struckAt: number }, now: number, nameOf: (id: string) => string,
): Flash {
  const pressed = [...seen.held].find((id) => !prev.held.has(id));
  if (seen.struckAt > prev.struckAt && seen.struckMove) return { name: nameOf(seen.struckMove), at: now, held: seen.held, struckAt: seen.struckAt };
  if (pressed) return { name: nameOf(pressed), at: now, held: seen.held, struckAt: seen.struckAt };
  return { ...prev, held: seen.held, struckAt: seen.struckAt };
}

export function flashText(flash: Flash, now: number): string {
  return now - flash.at < FLASH_SECONDS ? flash.name : "";
}
