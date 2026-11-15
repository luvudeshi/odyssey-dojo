// Ways out of a webcam that never delivers: calibration says what is wrong, and a key press during a pause takes over.
import type { CombatInput } from "../core/types";

/** Calibration starts telling the player what to fix, and shows the keyboard button, after this long without finishing. */
export const CALIBRATION_GIVE_UP_MS = 10000;

export function calibrationStalled(waitedMs: number): boolean {
  return waitedMs >= CALIBRATION_GIVE_UP_MS;
}

/** Once the player uses the keyboard while paused, the presence gate stops pausing for the rest of the fight. */
export function keyboardTakesOver(already: boolean, paused: boolean, keys: CombatInput): boolean {
  return already || (paused && (keys.struck.length > 0 || keys.held.size > 0));
}

/** Stalled and still not seen: the screen asks the player to step back. It never switches to the keyboard on its own. */
export function calibrationNeedsHelp(waitedMs: number, seen: boolean): boolean {
  return !seen && calibrationStalled(waitedMs);
}
