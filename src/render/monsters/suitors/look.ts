// What the suitors look like and who does what, as plain data and pure functions so tests can check it without a browser.
// The figures are the Quaternius mannequin (CC0) dressed in code: Antinous in front, larger than life, and four more
// suitors behind him who throw spears on their side of the hall and fall as the fight goes on.
import type { MonsterClipConfig } from "../../models/clipMap";
import type { ModelFit } from "../../models/fitModel";

export const SUITOR_URL = "/models/suitors/suitor.glb";

/** The mannequin's mesh is this tall (metres) and its bone box, which fitModel measures, is BONE_BOX tall. */
export const MESH_HEIGHT = 1.8292;
export const BONE_BOX = 1.5687;

/** Fit for a figure whose mesh should stand `meshHeight` metres tall. The bone box is shorter than the mesh, so scale for it. */
export function fitFor(meshHeight: number): ModelFit {
  return { targetHeight: (meshHeight * BONE_BOX) / MESH_HEIGHT, rotationY: 0 };
}

/** Metres per mesh unit for a figure of that height: gear is drawn in mesh units and wrapped in this scale. */
export function gearScale(meshHeight: number): number {
  return meshHeight / MESH_HEIGHT;
}

export const ANTINOUS_HEIGHT = 3.4;

/** Clip names inside suitor.glb. */
export const CLIP = {
  throw: "OverhandThrow",
  dash: "Sword_Dash",
  combo: "Sword_Heavy_Combo",
  slash: "Sword_Regular_A",
  hook: "Melee_Hook",
  guard: "Idle_Shield_Loop",
  block: "Sword_Block",
  knock: "Hit_Knockback",
  drink: "Consume",
  folded: "Idle_FoldArms_Loop",
} as const;

export const CLIP_NAMES: readonly string[] = Object.values(CLIP);

export type FigureId = "antinous" | "left" | "right" | "rear" | "rearB";

export interface Palette {
  /** The mannequin's body material (everything but the joints), seen at the hands, neck and face. */
  readonly body: string;
  /** Its joint material. */
  readonly joints: string;
  /** Tunic, skirt and cloak. */
  readonly cloth: string;
  /** Hem, cloak border and plume. */
  readonly trim: string;
}

/** Antinous is dark purple and gold, never the hoplite's bronze and crimson. */
export const ANTINOUS_PALETTE: Palette = { body: "#c9966e", joints: "#c9966e", cloth: "#3a1c63", trim: "#e3b24a" };

export interface Extra {
  readonly id: Exclude<FigureId, "antinous">;
  /** Where he stands, relative to the monster's origin: +x is the hero's right, +z toward the hero. */
  readonly x: number;
  readonly z: number;
  /** Mesh height in metres. */
  readonly height: number;
  /** Turn about Y toward the middle of the hall, radians. */
  readonly yaw: number;
  readonly palette: Palette;
  /** The spear attack this man throws, if any. */
  readonly throws: "spear_left" | "spear_right" | null;
  /** He falls once the fight reaches this phase index. Infinity: only when Antinous falls. */
  readonly fallsAtPhase: number;
}

export const EXTRAS: readonly Extra[] = [
  { id: "left", x: -3.4, z: -1.2, height: 2.35, yaw: 0.28, throws: "spear_left", fallsAtPhase: Infinity, palette: { body: "#c58f68", joints: "#c58f68", cloth: "#2b6670", trim: "#d8d0b8" } },
  { id: "right", x: 3.5, z: -1.5, height: 2.3, yaw: -0.3, throws: "spear_right", fallsAtPhase: Infinity, palette: { body: "#b9845f", joints: "#b9845f", cloth: "#9a4b2a", trim: "#e8d9a8" } },
  { id: "rear", x: -1.6, z: -4.4, height: 2.2, yaw: 0.15, throws: null, fallsAtPhase: 1, palette: { body: "#c99a74", joints: "#c99a74", cloth: "#5d6b34", trim: "#d9c58a" } },
  { id: "rearB", x: 1.9, z: -4.9, height: 2.25, yaw: -0.15, throws: null, fallsAtPhase: 2, palette: { body: "#b98c68", joints: "#b98c68", cloth: "#6a4a7a", trim: "#d8c8a0" } },
];

/** Whether a suitor is lying on the floor in this phase. Antinous falls only when he is defeated. */
export function isFallen(figure: Extra | null, phaseIndex: number, defeated: boolean): boolean {
  if (defeated) return true;
  return figure !== null && phaseIndex >= figure.fallsAtPhase;
}

/** How Antinous is dressed in each phase: feast robes, then armed from the storeroom, then behind an upturned table. */
export interface AntinousLook {
  readonly cuirass: boolean;
  readonly sword: boolean;
  readonly guard: "cup" | "round" | "table";
  /** Plume size multiplier. */
  readonly plume: number;
  readonly cloak: boolean;
}

export function antinousLook(phaseIndex: number): AntinousLook {
  if (phaseIndex <= 0) return { cuirass: false, sword: false, guard: "cup", plume: 0.7, cloak: true };
  if (phaseIndex === 1) return { cuirass: true, sword: true, guard: "round", plume: 1, cloak: true };
  return { cuirass: true, sword: true, guard: "table", plume: 1.3, cloak: true };
}

/** What Antinous holds in his right hand while winding up this attack. */
export type HandProp = "hoof" | "spear" | "sword" | "none";

export function handProp(attackId: string | null, look: AntinousLook): HandProp {
  if (attackId === "ox_hoof") return "hoof";
  if (attackId === "spear_left" || attackId === "spear_right") return "spear";
  if (attackId === "sword_rush") return "sword";
  return look.sword ? "sword" : "none";
}

/** Which way Antinous turns his shoulders for an attack, as a yaw in radians: toward the side the spear flies from. */
export function turnFor(attackId: string | null): number {
  if (attackId === "spear_left") return -0.5;
  if (attackId === "spear_right") return 0.5;
  return 0;
}

const SPEEDS = [1, 1.1, 1.3] as const;

/** One clip config per phase for Antinous: the playback speed is part of the config. */
export const ANTINOUS_CLIPS: readonly MonsterClipConfig[] = SPEEDS.map((timeScale, phase) => ({
  idle: phase === 0 ? CLIP.folded : CLIP.guard,
  windup: {
    default: CLIP.slash,
    byAttackId: { ox_hoof: CLIP.throw, spear_left: CLIP.hook, spear_right: CLIP.hook, sword_rush: CLIP.dash },
  },
  hit: CLIP.knock,
  death: CLIP.knock,
  timeScale,
}));

/** A flanking suitor: arms folded, on guard or drinking (never the neutral idle, which leaves the arms hanging out like a T-pose) until his spear attack, then the overhand throw, scrubbed by the windup. */
export function extraClips(extra: Extra): MonsterClipConfig {
  return {
    idle: extra.id === "right" ? CLIP.drink : extra.id === "left" ? CLIP.guard : CLIP.folded,
    windup: { default: CLIP.throw },
    hit: CLIP.knock,
    death: CLIP.knock,
  };
}

export function antinousClips(phaseIndex: number): MonsterClipConfig {
  return ANTINOUS_CLIPS[Math.min(Math.max(phaseIndex, 0), ANTINOUS_CLIPS.length - 1)] ?? { idle: CLIP.guard, windup: { default: CLIP.slash }, hit: CLIP.knock, death: CLIP.knock };
}
