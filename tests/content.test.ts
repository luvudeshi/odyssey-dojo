// Guards the content teammates add: every id an enemy or style names must be a real move of the right kind.
import { expect, test } from "vitest";
import { ENEMIES } from "../src/enemies/registry";
import { createPoseInput } from "../src/input/poseInput";
import { MOVES } from "../src/moves/registry";
import { EMPTY_HISTORY, pushFrame } from "../src/pose/signals";
import { JOINT } from "../src/pose/signals";
import { STYLES } from "../src/styles/registry";
import { frameAt } from "./poseFixture";

test("enemy counters, weak spots, phases and finishers name real moves and attacks", () => {
  expect(ENEMIES.length).toBeGreaterThan(0);
  for (const enemy of ENEMIES) {
    for (const attack of enemy.attacks) expect(MOVES.get(attack.counter)?.kind, attack.id).toBe("defend");
    for (const spot of enemy.weakSpots) {
      for (const move of spot.moves) expect(MOVES.get(move)?.kind, `${enemy.id}/${spot.id}/${move}`).toBe("strike");
    }
    const attackIds = enemy.attacks.map((attack) => attack.id);
    for (const phase of enemy.phases ?? []) {
      for (const id of phase.attackIds) expect(attackIds, `${enemy.id}/${phase.name}`).toContain(id);
    }
    if (enemy.finisher !== undefined) expect(MOVES.get(enemy.finisher)?.kind, `${enemy.id} finisher`).toBe("strike");
  }
});

test("style strikes are strike moves, and move keys are unique", () => {
  for (const style of STYLES) {
    for (const move of style.strikes) expect(MOVES.get(move)?.kind, `${style.id}/${move}`).toBe("strike");
  }
  const keys = [...MOVES.values()].map((move) => move.key);
  expect(new Set(keys).size).toBe(keys.length);
});

test("standing still triggers nothing; fists at the face is a block; bent-then-straight left arm is one jab", () => {
  const read = createPoseInput(MOVES);
  let history = EMPTY_HISTORY;
  for (let i = 0; i < 20; i++) history = pushFrame(history, frameAt(i * 33));
  const still = read(history);
  expect([...still.held, ...still.struck]).toEqual([]);

  const guard = frameAt(700, { [JOINT.leftWrist]: [0.47, 0.22], [JOINT.rightWrist]: [0.53, 0.22] });
  expect([...read(pushFrame(history, guard)).held]).toEqual(["block"]);

  const bent = frameAt(700, {}, { [JOINT.leftElbow]: [-0.3, -0.35, 0], [JOINT.leftWrist]: [-0.2, -0.45, -0.05] });
  const straight = frameAt(900, {}, { [JOINT.leftElbow]: [-0.2, -0.5, -0.3], [JOINT.leftWrist]: [-0.2, -0.5, -0.6] });
  const punched = pushFrame(pushFrame(history, bent), straight);
  expect(read(punched).struck.map((strike) => strike.move)).toEqual(["jab"]);
  expect(read(punched).struck).toEqual([]);
});
