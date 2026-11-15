import type { FightingStyle } from "../../core/types";

// Open hands only: a push with both to make room, the left palm up under the chin, the right hand chopped across.
export const style: FightingStyle = {
  id: "jiu_jitsu",
  name: "Jiu-jitsu",
  blurb: "The way of Theseus, who out-wrestled the strongman Cercyon by skill, not strength. Jiu-jitsu is known for technique that lets a smaller person break free.",
  strikes: ["double_palm", "rising_palm", "knife_hand"],
};
