// Which gear is in the spartan's hands right now. Pure, so it is unit-tested alone. At rest both hands are empty (the
// round shield rides on his back), because a fighter punches and blocks with bare fists. The stake is drawn only for the
// stake finisher and stowed when that move's clip ends. No style carries a spear any more.
import { chooseHeroPose } from "./heroClips";
import type { HeroInput } from "./heroClips";
import type { StrikeTiming } from "./gear/timing";

export type Held = "none" | "stake";

export function heldGear(timing: StrikeTiming, input: HeroInput): Held {
  const pose = chooseHeroPose(timing, input);
  if (pose !== "punch" && pose !== "thrust") return "none";
  return input.struckMove === "stake_thrust" ? "stake" : "none";
}
