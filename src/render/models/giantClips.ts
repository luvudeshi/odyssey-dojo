// Clip names and fit for the Quaternius Giant candidate. Plain data, so a test can check it against the real file.
import { useGLTF } from "@react-three/drei";
import type { MonsterClipConfig } from "./clipMap";
import type { ModelFit } from "./fitModel";

export const GIANT_URL = "/models/polyphemus/giant.glb";

/** Starts the download at import, so the file is usually cached before the fight opens. */
export function preloadGiant(): void {
  useGLTF.preload(GIANT_URL);
}

/** About 2.6 hero heights (the hero is 1.8 m); the bone box puts his head at the weak spot's height. */
export const GIANT_FIT: ModelFit = { targetHeight: 4.6, rotationY: 0 };

/** The pack names every clip with this prefix. */
const P = "EnemyArmature|EnemyArmature|EnemyArmature|";

/** Attack raises both arms overhead and slams down: it reads as a club swing, a boulder lift and a grab, so all attacks share it. Jump did not read. */
const SPEEDS = [1, 1.15, 1.5] as const;

/** One config per phase, since the playback speed is part of the config. Blinded walks about wildly and faster. */
export const GIANT_CLIPS: readonly MonsterClipConfig[] = SPEEDS.map((timeScale) => ({
  idle: `${P}Idle`,
  windup: { default: `${P}Attack` },
  hit: `${P}HitRecieve`,
  death: `${P}Death`,
  byPhase: { 2: { idle: `${P}Walk` } },
  timeScale,
}));
