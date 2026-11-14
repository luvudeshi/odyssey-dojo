// The GLB hero candidates, picked with ?hero=<id>. Data only: file, fit, tint and which clip plays for each action.
import type { ModelFit } from "../models/fitModel";
import type { HeroRig } from "./heroClips";

export interface HeroCandidate {
  readonly id: string;
  readonly url: string;
  readonly fit: ModelFit;
  readonly rig: HeroRig;
  /** Multiplies a mesh's colour (by mesh name) toward bronze, white and crimson. */
  readonly tint?: Readonly<Record<string, string>>;
}

const A = "CharacterArmature|";

export const knight: HeroCandidate = {
  id: "knight",
  url: "/models/hero/knight.glb",
  fit: { targetHeight: 1.1, rotationY: Math.PI },
  tint: { Knight_Cape: "#c0313c", Knight_Helmet: "#d9a441" },
  rig: {
    idle: "Idle",
    poses: {
      block: ["Blocking", "Block"],
      duck: ["Jump_Land"], // stand-in: the landing crouch, frozen mid-way (see rig.duck)
      dodgeLeft: ["Dodge_Left"],
      dodgeRight: ["Dodge_Right"],
      punch: ["1H_Melee_Attack_Slice_Horizontal"],
      thrust: ["1H_Melee_Attack_Stab"],
      hurt: ["Hit_A", "Block_Hit"],
      victory: ["Cheer"],
      defeat: ["Death_A"],
    },
    byMove: { overhead_strike: "1H_Melee_Attack_Chop", hook: "1H_Melee_Attack_Slice_Diagonal", uppercut: "1H_Melee_Attack_Slice_Diagonal" },
    punch: { seconds: 0.7, hit: 0.45 },
    thrust: { seconds: 0.7, hit: 0.4 },
    hurt: { seconds: 0.5 },
    duck: { hold: 0.3 },
  },
};

export const adventurer: HeroCandidate = {
  id: "adventurer",
  url: "/models/hero/adventurer.glb",
  fit: { targetHeight: 1.5, rotationY: Math.PI },
  rig: {
    idle: `${A}Idle_Sword`,
    poses: {
      block: [`${A}Idle_Neutral`], // no guard clip: stand-in is a still stance
      duck: [`${A}Idle_Neutral`], // Roll has root motion (tumbles into the floor), so a still stance is squashed instead
      dodgeLeft: [`${A}Run_Left`],
      dodgeRight: [`${A}Run_Right`],
      punch: [`${A}Punch_Right`],
      thrust: [`${A}Sword_Slash`],
      hurt: [`${A}HitRecieve`],
      victory: [`${A}Wave`],
      defeat: [`${A}Death`],
    },
    byMove: { hook: `${A}Punch_Left`, uppercut: `${A}Kick_Right`, hammer_fist: `${A}Kick_Left` },
    punch: { seconds: 0.5, hit: 0.4 },
    thrust: { seconds: 0.6, hit: 0.4 },
    hurt: { seconds: 0.5 },
    duck: { squash: 0.75 },
  },
};

export const HERO_CANDIDATES: ReadonlyMap<string, HeroCandidate> = new Map([knight, adventurer].map((c) => [c.id, c]));
