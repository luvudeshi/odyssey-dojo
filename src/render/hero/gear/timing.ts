// How long the spartan's strike and hurt clips last in the fight. Shared by the rig (which clip plays when) and the
// gear (which hand holds what), so a spear is drawn and stowed on exactly the frames the thrust clip plays.
import type { HeroRig } from "../heroClips";

export type StrikeTiming = Pick<HeroRig, "punch" | "thrust" | "hurt">;

export const THRUST_TIMING: StrikeTiming["thrust"] = { seconds: 0.55, hit: 0.5 };

export const TIMING: StrikeTiming = {
  punch: { seconds: 0.5, hit: 0.4 },
  thrust: THRUST_TIMING,
  hurt: { seconds: 0.5 },
};
