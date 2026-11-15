// Waist-up play (issue #239): the list of moves that need the legs, the vote on whether the legs are in view, and
// the swap the fight makes when they are not. The list is checked against the waist-up table of issue #220, both
// as tests/helpers/waistUp.ts measures it today and as docs/waist-up.md prints it.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { FightingStyle, PoseFrame, PoseHistory } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { MOVES } from "../src/moves/registry";
import { NEEDS_LEGS, askable, legsInFrame, legsInView, swapFor } from "../src/moves/waistUp";
import { JOINT } from "../src/pose/signals";
import { STYLES } from "../src/styles/registry";
import { waistUpTable } from "./helpers/waistUp";
import { frameAt } from "./poseFixture";

const J = JOINT;
const FRAME_MS = 33;
const KNEES = { [J.leftKnee]: [0.44, 0.8], [J.rightKnee]: [0.56, 0.8] } as const;
const ANKLES = { [J.leftAnkle]: [0.44, 0.95], [J.rightAnkle]: [0.56, 0.95] } as const;

/** A standing frame with the knees and ankles in the picture, and the listed joints at this visibility instead. */
function frame(t: number, unsure: readonly number[] = [], visibility = 0.1): PoseFrame {
  const whole = frameAt(t, { ...KNEES, ...ANKLES });
  return { ...whole, image: whole.image.map((point, index) => (unsure.includes(index) ? { ...point, visibility } : point)) };
}

const LEGS = [J.leftKnee, J.rightKnee, J.leftAnkle, J.rightAnkle];
const full = (t: number): PoseFrame => frame(t);
const waistUp = (t: number): PoseFrame => frame(t, LEGS);

/** One second of frames; `legsAt(i)` says whether frame i has the legs. */
function second(legsAt: (index: number) => boolean, count = 30): PoseHistory {
  return { frames: Array.from({ length: count }, (_, i) => (legsAt(i) ? full(i * FRAME_MS) : waistUp(i * FRAME_MS))), baseline: null };
}

/** The answers frame by frame as the game would get them: a one-second history, each answer fed back as `was`. */
function played(count: number, legsAt: (index: number) => boolean, start: boolean, carry = true): boolean[] {
  const out: boolean[] = [];
  let was = start;
  let frames: PoseFrame[] = [];
  for (let i = 0; i < count; i++) {
    const t = i * FRAME_MS;
    frames = [...frames, legsAt(i) ? full(t) : waistUp(t)].filter((old) => t - old.t <= 1000);
    was = legsInView({ frames, baseline: null }, carry ? was : false);
    out.push(was);
  }
  return out;
}

const changesIn = (list: readonly boolean[]): number[] => list.flatMap((value, at) => (at > 0 && value !== list[at - 1] ? [at] : []));

describe("the list of moves that need the legs", () => {
  test("is the two kicks", () => {
    expect([...NEEDS_LEGS]).toEqual(["front_kick", "knee"]);
    for (const id of NEEDS_LEGS) expect(MOVES.get(id)?.kind, id).toBe("strike");
  });

  test("is exactly the moves the waist-up table measures as not counting, unseen or frozen", () => {
    const table = waistUpTable();
    const cannot = table.filter((row) => !row.unseen.counts || !row.frozen.counts).map((row) => row.move);
    expect(cannot.sort()).toEqual([...NEEDS_LEGS].sort());
    // Every move in the registry is in the table, so a new move cannot slip past the list.
    expect(table.map((row) => row.move).sort()).toEqual([...MOVES.keys()].sort());
  });

  test("is exactly the rows docs/waist-up.md prints with a no", () => {
    const doc = readFileSync("docs/waist-up.md", "utf8").replace(/\r\n/g, "\n");
    const start = doc.indexOf("| move | full body |");
    expect(start).toBeGreaterThan(-1);
    const rows = doc.slice(start).split("\n\n")[0]?.split("\n").slice(2) ?? [];
    expect(rows.length).toBe(MOVES.size);
    const cannot = rows
      .map((row) => row.split("|").map((cell) => cell.trim()))
      .filter((cells) => cells[3]?.startsWith("no") === true || cells[4]?.startsWith("no") === true)
      .map((cells) => cells[1]);
    expect(cannot.sort()).toEqual([...NEEDS_LEGS].sort());
  });
});

describe("askable", () => {
  test("with the legs in view, every move is", () => {
    for (const id of MOVES.keys()) expect(askable(id, true), id).toBe(true);
  });

  test("with the legs out of view, every move but the two kicks is", () => {
    for (const id of MOVES.keys()) expect(askable(id, false), id).toBe(!NEEDS_LEGS.includes(id));
    expect(askable("front_kick", false)).toBe(false);
    expect(askable("knee", false)).toBe(false);
    for (const id of ["duck", "jump", "block", "dodge_left", "dodge_right"]) expect(askable(id, false), id).toBe(true);
  });
});

describe("legsInView", () => {
  test("one frame: both knees and at least one ankle, seen and inside the picture", () => {
    expect(legsInFrame(full(0))).toBe(true);
    expect(legsInFrame(frame(0, [J.leftAnkle]))).toBe(true);
    expect(legsInFrame(frame(0, [J.rightAnkle]))).toBe(true);
    expect(legsInFrame(frame(0, [J.leftAnkle, J.rightAnkle]))).toBe(false);
    expect(legsInFrame(frame(0, [J.leftKnee]))).toBe(false);
    expect(legsInFrame(frame(0, [J.rightKnee]))).toBe(false);
    expect(legsInFrame(frame(0, [J.leftKnee], 0.49))).toBe(false);
    expect(legsInFrame(frame(0, [J.leftKnee], 0.5))).toBe(true);
    // A sure knee that is below the picture is not in view.
    expect(legsInFrame(frameAt(0, { ...KNEES, ...ANKLES, [J.leftKnee]: [0.44, 1.05] }))).toBe(false);
    expect(legsInFrame(waistUp(0))).toBe(false);
  });

  test("true for a second of whole-body frames, false for a second waist up, false with nothing to go on", () => {
    expect(legsInView(second(() => true))).toBe(true);
    expect(legsInView(second(() => false))).toBe(false);
    expect(legsInView({ frames: [], baseline: null })).toBe(false);
    expect(legsInView(second(() => true, 4))).toBe(false);
    expect(legsInView(second(() => true, 5))).toBe(true);
  });

  test("most of the second decides: more than half the frames", () => {
    expect(legsInView(second((i) => i < 16))).toBe(true);
    expect(legsInView(second((i) => i < 15))).toBe(false);
    expect(legsInView(second((i) => i < 14))).toBe(false);
    // Which frames they are does not matter, only how many.
    expect(legsInView(second((i) => i >= 14))).toBe(true);
  });

  test("one ankle hidden behind the other leg all second long is still in view", () => {
    const frames = Array.from({ length: 30 }, (_, i) => frame(i * FRAME_MS, [J.leftAnkle]));
    expect(legsInView({ frames, baseline: null })).toBe(true);
  });

  test("given its last answer it holds: in view until under three frames in ten, out until over half", () => {
    expect(legsInView(second((i) => i < 15), true)).toBe(true);
    expect(legsInView(second((i) => i < 9), true)).toBe(true);
    expect(legsInView(second((i) => i < 8), true)).toBe(false);
    expect(legsInView(second((i) => i < 15), false)).toBe(false);
    expect(legsInView(second(() => false), true)).toBe(false);
    expect(legsInView(second(() => true), false)).toBe(true);
  });

  test("a knee that flickers every other frame does not flip the answer every frame", () => {
    // Legs seen on every other frame, so each new frame moves the share of the last second across one half.
    const flicker = (i: number): boolean => i % 2 === 0;
    expect(changesIn(played(120, flicker, true)).length).toBeLessThanOrEqual(1);
    expect(changesIn(played(120, flicker, false)).length).toBeLessThanOrEqual(1);
    // Without the last answer the same frames do flip, which is what `was` is for.
    expect(changesIn(played(120, flicker, false, false)).length).toBeGreaterThan(10);
  });

  test("walking out of view and back: one change each way", () => {
    const changes = changesIn(played(240, (i) => i < 60 || i >= 150, false));
    expect(changes.length).toBe(3);
    // In after 5 frames, out about 0.7 s after the legs left, back in about half a second after they returned.
    expect(changes[0]).toBe(4);
    expect(changes[1]).toBeGreaterThan(60);
    expect(changes[1]).toBeLessThan(90);
    expect(changes[2]).toBeGreaterThan(150);
    expect(changes[2]).toBeLessThan(180);
  });
});

const kindOf = (id: string): string | undefined => MOVES.get(id)?.kind;

function styleCalled(id: string): FightingStyle {
  const found = STYLES.find((each) => each.id === id);
  if (!found) throw new Error(`no style ${id}`);
  return found;
}

describe("swapFor", () => {
  test("a move that counts waist up comes back as it is, in every style", () => {
    for (const style of STYLES) {
      for (const id of MOVES.keys()) {
        if (askable(id, false)) expect(swapFor(id, style), `${style.id}/${id}`).toBe(id);
      }
    }
  });

  test.each(NEEDS_LEGS.flatMap((id) => STYLES.map((style) => [id, style.id, style] as const)))(
    "%s in %s becomes an askable strike from that style",
    (id, _name, style) => {
      const swap = swapFor(id, style);
      expect(askable(swap, false)).toBe(true);
      expect(kindOf(swap)).toBe("strike");
      expect(style.strikes).toContain(swap);
    },
  );

  test("the nearest hand strike is chosen: a straight one for the front kick, a rising one for the knee", () => {
    expect(swapFor("front_kick", styleCalled("taekwondo"))).toBe("uppercut");
    expect(swapFor("knee", styleCalled("taekwondo"))).toBe("uppercut");
    expect(swapFor("front_kick", styleCalled("boxer"))).toBe("cross");
    expect(swapFor("knee", styleCalled("boxer"))).toBe("uppercut");
    expect(swapFor("front_kick", styleCalled("jiu_jitsu"))).toBe("double_palm");
    expect(swapFor("knee", styleCalled("jiu_jitsu"))).toBe("rising_palm");
    expect(swapFor("front_kick", styleCalled("karate"))).toBe("reverse_punch");
    expect(swapFor("knee", styleCalled("karate"))).toBe("hammer_fist");
  });

  test("given the weak spot's strikes, the swap fits the spot when the style has a hand strike that does", () => {
    const jiuJitsu = styleCalled("jiu_jitsu");
    expect(swapFor("front_kick", jiuJitsu, ["knife_hand", "cross", "front_kick"])).toBe("knife_hand");
    // Nothing on the spot is in the style: the nearest hand strike of the style.
    expect(swapFor("front_kick", jiuJitsu, ["hook", "front_kick"])).toBe("double_palm");
  });

  test("a style of only kicks has nothing to swap to, and the move comes back unchanged", () => {
    const kicksOnly: FightingStyle = { id: "kicks", name: "Kicks", blurb: "", strikes: ["front_kick", "knee"] };
    expect(swapFor("front_kick", kicksOnly)).toBe("front_kick");
  });

  test("no defend needs swapping today, and a defend is never swapped for a strike", () => {
    for (const [id, move] of MOVES) {
      if (move.kind !== "defend") continue;
      for (const style of STYLES) expect(kindOf(swapFor(id, style)), id).toBe("defend");
    }
  });
});

describe("every style at every stop, with the legs out of view", () => {
  test("there are five styles and six stops", () => {
    expect(STYLES.length).toBe(5);
    expect(ENEMIES.length).toBe(6);
  });

  test.each(STYLES.map((style) => [style.id, style] as const))("%s has an askable strike", (_name, style) => {
    expect(style.strikes.some((id) => askable(id, false) && kindOf(id) === "strike")).toBe(true);
  });

  const pairs = STYLES.flatMap((style) => ENEMIES.map((enemy) => [style.id, enemy.id, style, enemy] as const));

  test.each(pairs)("%s at %s: an askable strike for every weak spot, and it fits the spot when one can", (_s, _e, style, enemy) => {
    for (const spot of enemy.weakSpots) {
      // The engine's own pool: the spot's strikes the style has, or the whole style when none fit.
      const fitting = spot.moves.filter((id) => style.strikes.includes(id));
      const pool = fitting.length > 0 ? fitting : style.strikes;
      const handsOnSpot = fitting.filter((id) => askable(id, false));
      for (const picked of pool) {
        const asked = askable(picked, false) ? picked : swapFor(picked, style, spot.moves);
        const where = `${style.id}/${enemy.id}/${spot.id}/${picked}`;
        expect(askable(asked, false), where).toBe(true);
        expect(kindOf(asked), where).toBe("strike");
        expect(style.strikes, where).toContain(asked);
        if (handsOnSpot.length > 0) expect(spot.moves, where).toContain(asked);
      }
    }
  });

  test.each(ENEMIES.map((enemy) => [enemy.id, enemy] as const))("%s: every attack, in every phase, is stopped by an askable defend", (_name, enemy) => {
    for (const attack of enemy.attacks) {
      const asked = swapFor(attack.counter, styleCalled("boxer"));
      expect(asked, attack.id).toBe(attack.counter);
      expect(askable(asked, false), attack.id).toBe(true);
      expect(kindOf(asked), attack.id).toBe("defend");
    }
    for (const phase of enemy.phases ?? []) {
      const counters = phase.attackIds.map((id) => enemy.attacks.find((attack) => attack.id === id)?.counter);
      expect(counters.some((id) => id !== undefined && askable(id, false)), phase.name).toBe(true);
    }
  });

  test.each(ENEMIES.map((enemy) => [enemy.id, enemy] as const))("%s: the finishing strike, if there is one, is askable", (_name, enemy) => {
    if (enemy.finisher !== undefined) expect(askable(enemy.finisher, false)).toBe(true);
  });
});
