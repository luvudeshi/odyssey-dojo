// Which gear is in the spartan's hands right now. Pure, so it is unit-tested alone. At rest both hands are empty (the
// round shield rides on his back; in the Hoplite style so does the spear), because a fighter punches and blocks with
// bare fists. Gear is drawn only for the move that needs it and stowed when that move's clip ends.
import { chooseHeroPose } from "./heroClips";
import type { HeroInput } from "./heroClips";
import type { StrikeTiming } from "./gear/timing";

export type Held = "none" | "spear" | "stake";

/** The one style that fights with a spear; every other style has none, not even on its back. */
export const SPEAR_STYLE = "hoplite";

export function heldGear(timing: StrikeTiming, input: HeroInput, styleId: string): Held {
  const pose = chooseHeroPose(timing, input);
  if (pose !== "punch" && pose !== "thrust") return "none";
  if (input.struckMove === "stake_thrust") return "stake";
  const spearMove = input.struckMove === "spear_thrust" || input.struckMove === "overhead_strike";
  return spearMove && styleId === SPEAR_STYLE ? "spear" : "none";
}

/** The spear rides on his back whenever he is a Hoplite and it is not in his hand. */
export function spearSlung(styleId: string, held: Held): boolean {
  return styleId === SPEAR_STYLE && held !== "spear";
}
