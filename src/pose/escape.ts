// Ways out of a webcam that never delivers: calibration gives up, and a key press during a pause takes over.
import type { CombatInput } from "../core/types";

/** Calibration offers up the keyboard after this long without finishing. */
export const CALIBRATION_GIVE_UP_MS = 10000;

export function calibrationStalled(waitedMs: number): boolean {
  return waitedMs >= CALIBRATION_GIVE_UP_MS;
}

/** Once the player uses the keyboard while paused, the presence gate stops pausing for the rest of the fight. */
export function keyboardTakesOver(already: boolean, paused: boolean, keys: CombatInput): boolean {
  return already || (paused && (keys.struck.length > 0 || keys.held.size > 0));
}
