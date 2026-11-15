// Which gear is in the spartan's hands right now. Pure, so it is unit-tested alone. At rest both hands are empty (the
// round shield rides on his back), because a fighter punches and blocks with bare fists. Gear is drawn only for the
// move that needs it and stowed when that move's clip ends.
//
// No style fights with a spear. The Hoplite style did; Jiu-jitsu took its place and is open hands only, and Taekwondo
// is feet and empty hands. So the spear is never held and never slung, in any style: only the stake is ever drawn.
// `styleId` stays in both signatures because gear/carriedGear.tsx passes it, and "spear" stays in Held because that
// file still has the spear's mesh; a style that carries one again needs only these two functions changed.
import { chooseHeroPose } from "./heroClips";
import type { HeroInput } from "./heroClips";
import type { StrikeTiming } from "./gear/timing";

export type Held = "none" | "spear" | "stake";

/** What is in his right hand. The style makes no difference now, so the function does not take it in. */
export const heldGear: (timing: StrikeTiming, input: HeroInput, styleId: string) => Held = (timing, input) => {
  const pose = chooseHeroPose(timing, input);
  if (pose !== "punch" && pose !== "thrust") return "none";
  return input.struckMove === "stake_thrust" ? "stake" : "none";
};

/** Whether the spear rides on his back. No style carries one now, so it never does. */
export const spearSlung: (styleId: string, held: Held) => boolean = () => false;
