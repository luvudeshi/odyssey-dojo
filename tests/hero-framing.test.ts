// The whole hero, feet included, stays in frame in every camera state, and never stands in front of a weak spot.
import { expect, test } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import type { CombatPhase, EnemySpec } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { startFight } from "../src/combat/engine";
import { battle, resetBattle } from "../src/render/battle";
import type { Battle } from "../src/render/battle";
import { MONSTER_Z, cameraShot, makeShot } from "../src/render/cameraShots";

const ASPECT = 16 / 9;
/** The spartan's group mark (HOME_Z 1.2) less the 0.8 m it is stepped back inside its turned group. */
const HERO_Z = 0.55;
const HERO_TOP = 1.95;
const HALF_WIDTH = 0.45;
/** Normalised device coordinates: the frame is -1..1, so this keeps a margin from every edge. */
const MARGIN = 0.94;
/** Every half second for a full sway and orbit cycle. */
const TIMES = Array.from({ length: 34 }, (_, i) => i * 0.5);

interface Scene {
  readonly label: string;
  readonly heroX: number;
  readonly heroZ: number;
  readonly phase: (enemy: EnemySpec) => CombatPhase;
  readonly hitAgo?: number;
}

const SCENES: readonly Scene[] = [
  { label: "rest", heroX: 0, heroZ: 0, phase: () => ({ kind: "recover", msLeft: 1000 }) },
  { label: "defend start", heroX: 0, heroZ: 0, phase: (e) => ({ kind: "defend", attack: e.attacks[0], msLeft: 1000, totalMs: 1000 }) },
  { label: "defend end", heroX: 0, heroZ: 0, phase: (e) => ({ kind: "defend", attack: e.attacks[0], msLeft: 0, totalMs: 1000 }) },
  { label: "defend, dodging left", heroX: -0.7, heroZ: 0, phase: (e) => ({ kind: "defend", attack: e.attacks[0], msLeft: 0, totalMs: 1000 }) },
  { label: "defend, dodging right", heroX: 0.7, heroZ: 0, phase: (e) => ({ kind: "defend", attack: e.attacks[0], msLeft: 0, totalMs: 1000 }) },
  { label: "defend, knocked back", heroX: 0, heroZ: 0.6, phase: (e) => ({ kind: "defend", attack: e.attacks[0], msLeft: 0, totalMs: 1000 }) },
  { label: "strike", heroX: 0, heroZ: -0.15, phase: (e) => ({ kind: "strike", weakSpot: e.weakSpots[0], move: "jab", msLeft: 500, totalMs: 1000 }) },
  { label: "strike, hit lands", heroX: 0, heroZ: -0.15, hitAgo: 0.05, phase: (e) => ({ kind: "strike", weakSpot: e.weakSpots[0], move: "jab", msLeft: 500, totalMs: 1000 }) },
  { label: "finisher", heroX: 0, heroZ: -0.15, phase: () => ({ kind: "finisher", move: "jab", msLeft: 500, totalMs: 1000 }) },
  { label: "won", heroX: 0, heroZ: -0.3, phase: () => ({ kind: "won" }) },
  { label: "lost", heroX: 0, heroZ: 0.4, phase: () => ({ kind: "lost" }) },
];

function project(shot: ReturnType<typeof makeShot>, point: Vector3): Vector3 {
  const camera = new PerspectiveCamera(shot.fov + shot.fovKick, ASPECT, 0.1, 100);
  const look = new Vector3(shot.lx, shot.ly, shot.lz);
  camera.position.set(shot.px, shot.py, shot.pz).lerp(look, shot.kick);
  camera.lookAt(look);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return point.clone().project(camera);
}

function battleFor(enemy: EnemySpec, scene: Scene, now: number): Battle {
  resetBattle();
  const b: Battle = { ...battle, heroX: scene.heroX, heroZ: scene.heroZ };
  b.state = { ...startFight(enemy, 1), phase: scene.phase(enemy) };
  b.wonAt = now - 0.5;
  if (scene.hitAgo !== undefined) b.enemyHitAt = now - scene.hitAgo;
  return b;
}

test("the hero's feet, head and shoulders are inside the frame in every camera state", () => {
  const enemy = ENEMIES[0];
  if (!enemy) throw new Error("no enemies registered");
  for (const scene of SCENES) {
    for (const now of TIMES) {
      const shot = cameraShot(makeShot(), battleFor(enemy, scene, now), now, false);
      const z = HERO_Z + scene.heroZ;
      // His stance is deep: one foot 0.26 m ahead of the mark and the other 0.25 m behind it, plus 0.15 m of boot (measured from the foot bones).
      const points = [
        ...[-0.4, 0, 0.4].flatMap((dz) => [-HALF_WIDTH, 0, HALF_WIDTH].map((dx) => new Vector3(scene.heroX + dx, 0, z + dz))),
        new Vector3(scene.heroX, HERO_TOP, z),
      ];
      for (const p of points) {
        const ndc = project(shot, p);
        const where = `${scene.label} t=${now.toFixed(1)} point ${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)} -> ${ndc.x.toFixed(2)},${ndc.y.toFixed(2)}`;
        expect(Math.abs(ndc.x), where).toBeLessThan(MARGIN);
        expect(ndc.y, where).toBeGreaterThan(-MARGIN);
        expect(ndc.y, where).toBeLessThan(MARGIN);
      }
    }
  }
});

test("the hero never covers a weak spot while it is the target", () => {
  for (const enemy of ENEMIES) {
    for (const spot of enemy.weakSpots) {
      const scene: Scene = { label: spot.id, heroX: 0, heroZ: -0.15, phase: () => ({ kind: "strike", weakSpot: spot, move: "jab", msLeft: 500, totalMs: 1000 }) };
      for (const now of TIMES) {
        const shot = cameraShot(makeShot(), battleFor(enemy, scene, now), now, false);
        const [sx, sy, sz] = spot.position;
        const target = project(shot, new Vector3(sx, sy, MONSTER_Z + sz));
        const z = HERO_Z + scene.heroZ;
        const low = project(shot, new Vector3(-HALF_WIDTH, 0, z));
        const high = project(shot, new Vector3(HALF_WIDTH, HERO_TOP, z));
        const inside = target.x > low.x && target.x < high.x && target.y > low.y && target.y < high.y;
        expect(inside, `${enemy.id} ${spot.id} t=${now.toFixed(1)}: spot at ${target.x.toFixed(2)},${target.y.toFixed(2)}, hero ${low.x.toFixed(2)}..${high.x.toFixed(2)}, ${low.y.toFixed(2)}..${high.y.toFixed(2)}`).toBe(false);
        expect(Math.abs(target.x), `${enemy.id} ${spot.id} off the side`).toBeLessThan(1);
        expect(Math.abs(target.y), `${enemy.id} ${spot.id} off the top`).toBeLessThan(1);
      }
    }
  }
});
