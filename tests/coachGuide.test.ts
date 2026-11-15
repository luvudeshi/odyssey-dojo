// The move guide (src/coach/guide.ts): every move has a figure and a checklist, the figure shows what the detector
// counts, and the checklist agrees with the detector frame by frame.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { LABELS, guideFor, liveChecks, poseAt, poseOf, startPose, toScreen, towardOf } from "../src/coach/guide";
import type { GuideJoint } from "../src/coach/guide";
import { MoveGuide } from "../src/coach/ui/MoveGuide";
import type { MoveDef, PoseFrame } from "../src/core/types";
import { createPoseInput } from "../src/input/poseInput";
import { SIDES } from "../src/moves/legSignals";
import { MEASURES } from "../src/moves/measures";
import { MOVES } from "../src/moves/registry";
import { EMPTY_HISTORY, pushFrame } from "../src/pose/signals";
import { following } from "../tools/guide/body";
import { PERFORMANCES } from "./helpers/crossFire";
import { histories, sequence, standing } from "./helpers/poses";

const ALL = [...MOVES.values()];
function moveOf(id: string): MoveDef {
  const move = MOVES.get(id);
  if (!move) throw new Error(`no move ${id}`);
  return move;
}
const guide = (move: MoveDef) => {
  const found = guideFor(move);
  if (!found) throw new Error(`${move.id} has no entry in GUIDES in src/coach/guide.ts`);
  return found;
};
/** The frames on which the game counts `move`: a strike thrown, or a defend held, through the real pose input. */
function countedOn(move: MoveDef, frames: readonly PoseFrame[]): number[] {
  const read = createPoseInput(MOVES);
  let history = EMPTY_HISTORY;
  return frames.flatMap((frame, index) => {
    history = pushFrame(history, frame);
    const input = read(history);
    return input.held.has(move.id) || input.struck.some((strike) => strike.move === move.id) ? [index] : [];
  });
}

test("every move in the registry has a guide, a short instruction, and a label for each condition", () => {
  expect(ALL.length).toBe(26);
  for (const move of ALL) {
    const { title, how } = guide(move);
    expect(title, move.id).toBe(move.name);
    const words = how.split(/\s+/).length;
    expect(words, `${move.id}: "${how}"`).toBeGreaterThanOrEqual(3);
    expect(words, `${move.id}: "${how}"`).toBeLessThanOrEqual(6);
    const options = MEASURES[move.id] ?? [];
    options.forEach((measures, index) => {
      const labels = LABELS[move.id]?.(SIDES[index] ?? "left") ?? [];
      expect(labels.length, `${move.id}: one label per condition`).toBe(measures.length);
      expect(labels.some(([, rank]) => rank > 0), `${move.id}: something to show`).toBe(true);
      for (const [label] of labels) {
        expect(label.length, `${move.id}: "${label}"`).toBeLessThanOrEqual(28);
        expect(label, move.id).not.toMatch(/degrees|shoulder widths|\bms\b|torso lengths|confidence/);
      }
    });
  }
});

test("the keyframes start standing ready, reach the diagram's pose, and stay finite all round the loop", () => {
  for (const move of ALL) {
    const { keyframes, loopMs } = guide(move);
    expect(keyframes.length, move.id).toBeGreaterThanOrEqual(2);
    expect(keyframes.length, move.id).toBeLessThanOrEqual(4);
    expect(loopMs).toBeGreaterThanOrEqual(800);
    expect(loopMs).toBeLessThanOrEqual(1100);
    expect(keyframes.map((key) => key.t), move.id).toEqual([...keyframes.map((key) => key.t)].sort((a, b) => a - b));
    expect(keyframes[0]?.t).toBe(0);
    expect(keyframes.at(-1)?.t).toBeLessThan(loopMs);
    // Strikes start from a guard at the chest, defends with the hands down; nobody starts leaning or crouched.
    expect(keyframes[0]?.pose, move.id).toEqual(startPose(move));
    expect(keyframes[0]?.pose.leftFoot[1]).toBe(0);
    // Every joint the move does not point at the camera is where the diagram draws it, at some keyframe.
    const drawn = poseOf(move.diagram);
    const reached = keyframes.some((key) => (Object.keys(drawn) as GuideJoint[]).every((name) => {
      const limb = name.replace(/Elbow|Wrist/, "Wrist").replace(/Knee|Foot/, "Foot");
      const forward = key.forward.some((end) => end === limb);
      return forward || (key.pose[name][0] === drawn[name][0] && key.pose[name][1] === drawn[name][1]);
    }));
    expect(reached, `${move.id} reaches its diagram`).toBe(true);
    for (let ms = -50; ms < loopMs * 2; ms += 17) {
      const { pose: at, toward } = poseAt(guide(move), ms);
      const screen = toScreen(at, toward);
      for (const value of [...Object.values(screen.at).flat(), ...Object.values(screen.size)]) expect(Number.isFinite(value), move.id).toBe(true);
    }
    expect(poseAt(guide(move), loopMs).pose, `${move.id} comes back to the start`).toEqual(keyframes[0]?.pose);
  }
});

test("moves at the camera are drawn at the camera: a grown fist or foot near its own shoulder or hip, never an arm out to the side", () => {
  for (const id of ["jab", "cross", "chain_punch", "spear_thrust", "aegis_push", "double_palm", "reverse_punch", "stake_thrust", "front_kick"]) {
    const move = moveOf(id);
    const forward = guide(move).keyframes.filter((key) => key.toward > 0);
    expect(forward.length, id).toBeGreaterThan(0);
    for (const key of forward) {
      const screen = toScreen(key.pose, towardOf(key));
      for (const end of key.forward) {
        expect(screen.size[end], `${id} ${end} grows`).toBeGreaterThan(2);
        if (!end.endsWith("Wrist")) continue;
        // The detectors throw a punch away when the fist is more than 1.2 shoulder widths (0.48 m) from the middle.
        expect(Math.abs(key.pose[end][0]), `${id} ${end} out to the side`).toBeLessThan(0.4);
      }
    }
  }
  // The other way round, for a player facing the figure like a teacher: left and right swap, nothing else changes.
  const jab = guide(moveOf("jab")).keyframes[1];
  if (!jab) throw new Error("the jab has a second keyframe");
  const [mirror, facing] = [toScreen(jab.pose, towardOf(jab), true), toScreen(jab.pose, towardOf(jab), false)];
  expect(mirror.at.leftWrist[0]).toBeLessThan(mirror.at.head[0]);
  expect(facing.at.leftWrist[0]).toBeGreaterThan(facing.at.head[0]);
  expect(facing.at.leftWrist[1]).toBe(mirror.at.leftWrist[1]);
});

test("a body that copies the figure exactly is counted, for every move", () => {
  const missed = ALL.filter((move) => countedOn(move, following(guide(move), 2)).length === 0).map((move) => move.id);
  expect(missed).toEqual([]);
});

test("the checklist is all met on the frame a clean performance fires, and not while standing still", () => {
  expect(Object.keys(PERFORMANCES).sort()).toEqual([...MOVES.keys()].sort());
  for (const move of ALL) {
    const frames = sequence(PERFORMANCES[move.id] ?? []);
    const fired = countedOn(move, frames)[0];
    if (fired === undefined) throw new Error(`${move.id}: the clean performance did not fire`);
    const all = histories(frames);
    const at = liveChecks(move, all[fired] ?? null);
    expect(at.matched, move.id).toBe(true);
    expect(at.overall, move.id).toBe(1);
    expect(at.checks.length, move.id).toBeGreaterThan(0);
    expect(at.checks.length, move.id).toBeLessThanOrEqual(4);
    expect(at.checks.every((check) => check.met && check.progress === 1), move.id).toBe(true);
    // Before it fires the match never shows, and the meter stays under 1.
    for (const history of all.slice(0, fired)) {
      const before = liveChecks(move, history);
      expect(before.matched && move.kind === "strike", move.id).toBe(false);
      expect(before.overall).toBeGreaterThanOrEqual(0);
      for (const check of before.checks) {
        expect(check.progress).toBeGreaterThanOrEqual(0);
        expect(check.progress).toBeLessThanOrEqual(check.met ? 1 : 0.95);
      }
    }
    for (const history of histories(standing())) {
      const still = liveChecks(move, history);
      expect(still.matched, `${move.id} standing still`).toBe(false);
      expect(still.overall).toBeLessThan(1);
    }
  }
});

test("with no frames the checklist is the list of what to do, all unmet, and nothing throws", () => {
  for (const move of ALL) {
    for (const nothing of [null, EMPTY_HISTORY]) {
      const empty = liveChecks(move, nothing, null);
      expect(empty.matched).toBe(false);
      expect(empty.overall).toBe(0);
      expect(empty.checks.length, move.id).toBeGreaterThan(0);
      expect(empty.checks.every((check) => !check.met && check.progress === 0), move.id).toBe(true);
    }
  }
  // A baseline handed in is used in place of the history's own: a duck needs one to measure the drop from.
  const duck = moveOf("duck");
  const ducked = histories(sequence(PERFORMANCES.duck ?? [])).at(-1) ?? null;
  expect(liveChecks(duck, ducked).matched).toBe(true);
  expect(liveChecks(duck, ducked, null).matched).toBe(false);
});

test("the component shows the instruction, the time bar and the checklist: three rows on the card, four and the name when larger", () => {
  for (const id of ["jab", "block", "front_kick"]) {
    const move = moveOf(id);
    const card = renderToStaticMarkup(createElement(MoveGuide, { move, history: () => null, msLeft: 1500, msTotal: 3000 }));
    expect(card).toContain("move-guide card");
    expect(card).toContain(guide(move).how);
    expect(card).toContain("mg-time-fill");
    expect(card.match(/<li[ >]/g)?.length).toBe(3);
    expect(card).toContain(liveChecks(move, null).checks[0]?.label);
    expect(card).toContain("mg-lit");
    const large = renderToStaticMarkup(createElement(MoveGuide, { move, history: () => null, size: "large" }));
    expect(large).toContain(`>${move.name}</h2>`);
    expect(large.match(/<li[ >]/g)?.length).toBe(4);
    expect(large).not.toContain("mg-time-fill");
  }
  // Three rows at most on the card, for every move, and still the ones that matter first.
  for (const move of ALL) {
    const three = liveChecks(move, null, null, 3).checks;
    expect(three.length, move.id).toBeLessThanOrEqual(3);
    expect(three).toEqual(liveChecks(move, null).checks.slice(0, 3));
  }
});
