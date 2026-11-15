// The camera panel's pure parts: skeleton maths (mirror on and off), the tracking caption and the move flash.
import { expect, test } from "vitest";
import type { Landmark } from "../src/core/types";
import { FLASH_SECONDS, NO_FLASH, flashText, nextFlash, presenceOf } from "../src/hud/cameraCaption";
import { headStones, skeletonLines, stonesAlong } from "../src/hud/skeletonLines";
import { JOINT } from "../src/pose/signals";
import { shiftBattleTimes } from "../src/ui/pauseState";
import { noteInput, resetBattle } from "../src/render/battle";
import type { Battle } from "../src/render/battle";
import { frameAt } from "./poseFixture";

function image(visibility = 1, overrides: Readonly<Record<number, Partial<Landmark>>> = {}): Landmark[] {
  return Array.from({ length: 33 }, (_, i) => ({ x: 0.1 + i * 0.02, y: 0.2 + i * 0.01, z: 0, visibility, ...overrides[i] }));
}

test("mirror on keeps landmark x, mirror off flips it back to the raw picture", () => {
  const lm = image();
  const on = skeletonLines(lm, true, 200, 100);
  const off = skeletonLines(lm, false, 200, 100);
  const nose = lm[JOINT.nose];
  expect(on.dots[0]?.x).toBeCloseTo((nose?.x ?? NaN) * 200);
  expect(off.dots[0]?.x).toBeCloseTo((1 - (nose?.x ?? NaN)) * 200);
  expect(on.dots[0]?.y).toBeCloseTo((nose?.y ?? NaN) * 100);
});

test("12 bones plus the neck, 13 joint dots", () => {
  const { lines, dots } = skeletonLines(image(), true, 100, 100);
  expect(lines).toHaveLength(13);
  expect(dots).toHaveLength(13);
  expect(lines.every((l) => !l.faint)).toBe(true);
});

test("limbs under 0.5 visibility are faint, the rest are not", () => {
  const { lines, dots } = skeletonLines(image(1, { [JOINT.leftWrist]: { visibility: 0.2 } }), true, 100, 100);
  expect(lines.filter((l) => l.faint)).toHaveLength(1);
  expect(dots.filter((d) => d.faint)).toHaveLength(1);
});

test("a short landmark list draws only what exists", () => {
  expect(skeletonLines([], true, 100, 100)).toEqual({ lines: [], dots: [] });
});

test("legs under 0.5 visibility draw no line at all; faint arms still do", () => {
  const legs = skeletonLines(image(1, { [JOINT.leftKnee]: { visibility: 0.2 } }), true, 100, 100);
  expect(legs.lines).toHaveLength(11);
  expect(legs.lines.some((l) => l.faint)).toBe(false);
});

test("the caption uses the fight's own presence check: shoulders needed, a hidden wrist is fine", () => {
  const ok = frameAt(1000);
  expect(presenceOf(ok, 1100)).toEqual({ ok: true });
  expect(presenceOf(null, 1100)).toEqual({ ok: false, reason: "I can't see you" });
  expect(presenceOf(ok, 1400).ok).toBe(false); // older than the fight's 300 ms limit
  const hide = (joint: number) => ({ ...ok, image: ok.image.map((p, i) => (i === joint ? { ...p, visibility: 0.1 } : p)) });
  expect(presenceOf(hide(JOINT.leftWrist), 1100)).toEqual({ ok: true });
  expect(presenceOf(hide(JOINT.leftShoulder), 1100)).toEqual({ ok: false, reason: "I can't see you" });
  const close = frameAt(1000, { [JOINT.leftShoulder]: [0.1, 0.35], [JOINT.rightShoulder]: [0.9, 0.35] });
  expect(presenceOf(close, 1100)).toEqual({ ok: false, reason: "step back" });
});

test("a new strike or a newly held defend flashes its name for under a second", () => {
  const nameOf = (id: string): string => id.toUpperCase();
  const none = { held: new Set<string>(), struckMove: "", strikes: 0 };
  let flash = nextFlash(NO_FLASH, none, 1, nameOf);
  expect(flashText(flash, 1)).toBe("");
  flash = nextFlash(flash, { ...none, struckMove: "jab", strikes: 1 }, 2, nameOf);
  expect(flashText(flash, 2.1)).toBe("JAB");
  expect(flashText(flash, 2 + FLASH_SECONDS + 0.01)).toBe("");
  flash = nextFlash(flash, { held: new Set(["block"]), struckMove: "jab", strikes: 1 }, 5, nameOf);
  expect(flashText(flash, 5.1)).toBe("BLOCK");
  flash = nextFlash(flash, { held: new Set(["block"]), struckMove: "jab", strikes: 1 }, 6, nameOf);
  expect(flashText(flash, 6)).toBe("");
});

test("nothing changed returns the same flash object", () => {
  const seen = { held: new Set<string>(), struckMove: "", strikes: 0 };
  expect(nextFlash(NO_FLASH, seen, 1, String)).toBe(NO_FLASH);
});

test("resuming from a pause does not flash the last strike again", () => {
  const b: Battle = {
    state: null, enemyHitAt: 0, playerHitAt: 0, phaseAt: 0, wonAt: 0, lostAt: 0, heroX: 0, heroZ: 0, shakeX: 0, shakeY: 0,
    held: new Set(), struckMove: "", struckAt: -Infinity, strikes: 0, styleId: "",
  };
  resetBattle(b);
  const nameOf = (id: string): string => id.toUpperCase();
  noteInput({ held: new Set(), struck: [{ move: "jab", quality: 1, player: 0 }] }, 10, b);
  let flash = nextFlash(NO_FLASH, b, 10, nameOf);
  expect(flashText(flash, 10.1)).toBe("JAB");
  flash = nextFlash(flash, b, 11, nameOf);
  shiftBattleTimes(b, 30_000);
  expect(b.struckAt).toBe(40);
  const after = nextFlash(flash, b, 41, nameOf);
  expect(after).toBe(flash);
  expect(flashText(after, 41)).toBe("");
});

test("stones are laid between the joints, one per step, and a short bone gets none", () => {
  const row = stonesAlong({ x: 0, y: 0 }, { x: 100, y: 0 }, 20);
  expect(row).toHaveLength(4);
  expect(row[0]).toEqual({ x: 20, y: 0 });
  expect(stonesAlong({ x: 0, y: 0 }, { x: 5, y: 0 }, 20)).toEqual([]);
});

test("the head cluster is a centre and a ring of six, with an outer ring of twelve on a big head", () => {
  const small = headStones({ x: 10, y: 10 }, 5, 2);
  expect(small).toHaveLength(7);
  expect(small[0]).toEqual({ x: 10, y: 10 });
  expect(headStones({ x: 10, y: 10 }, 20, 2)).toHaveLength(19);
});
