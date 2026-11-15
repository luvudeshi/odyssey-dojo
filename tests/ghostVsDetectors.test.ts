// Would a player who copies the move ghost exactly have the move counted? All 26 moves, through the real pose input.
// The ghost (src/render/GhostFigure.tsx) is a still figure drawn from each move's prompt-card `diagram`; the
// detectors want motion and, for punches, a fist coming at the camera. docs/ghost-check.md explains each row.
// The table is pinned: a change to a diagram, the ghost's maths or a detector that moves a row fails here.
import { describe, expect, test } from "vitest";
import doc from "../docs/ghost-check.md?raw";
import type { MoveDef } from "../src/core/types";
import { flungWide, punch } from "../src/moves/handSignals";
import { MOVES } from "../src/moves/registry";
import { EMPTY_HISTORY, baselineOf, pushFrame } from "../src/pose/signals";
import { ghostCloseness } from "../src/render/ghost/ghostPose";
import { STYLES } from "../src/styles/registry";
import { armsAsDrawn, ghostFrame, idleSides, intendedCopy, literalCopy, watch } from "./helpers/ghostCopy";
import type { Limbs, Reading, Start } from "./helpers/ghostCopy";
import { frameOf, NEUTRAL } from "./helpers/poses";

const FAST_MS = 250;
const SLOW_MS = 600;

interface Row {
  /** Literal copy with the ghost's own arm, from arms hanging: counted when done in 250 ms / in 600 ms. */
  readonly down: string;
  /** The same from hands waiting at the chest. */
  readonly chest: string;
  /** Literal copy with the other arm (the figure read as somebody facing you), in 250 ms: from arms hanging / from the chest. */
  readonly otherArm: string;
  /** Not counted in the pose but counted while dropping back out of it, in 250 ms: from arms hanging / from the chest. */
  readonly letGo: string;
  /** The move's highest confidence over the four own-arm copies (the game needs 0.7). */
  readonly peak: number;
  /** Every other move thrown or held during the four own-arm copies. */
  readonly others: string;
  /** The four own-arm copies again on real-length limbs: arms down fast/slow, chest fast/slow. */
  readonly realLimbs: string;
  /** ghostCloseness of the move done right, at the frame its detector peaks. 1 is on the ghost. */
  readonly right: number;
  /** The same with any arm the clean performance never lifts put exactly where the ghost shows it. */
  readonly rightGuarded: number;
  /** The highest that second number gets at any frame of the move done right: does the ghost light up at any point? */
  readonly rightBest: number;
  /** ghostCloseness of a body held exactly in the ghost's pose, in the fixture's picture. */
  readonly inPose: number;
}

const yes = (value: boolean): string => (value ? "yes" : "no");
const round = (value: number): number => Math.round(value * 100) / 100;
const STANDING = baselineOf([frameOf(0, NEUTRAL)]);

function styleOf(def: MoveDef): string {
  const styles = STYLES.filter((style) => style.strikes.includes(def.id)).map((style) => style.name);
  if (styles.length > 0) return styles.join(", ");
  if (def.kind === "defend") return "defend";
  return def.id === "stake_thrust" ? "finisher" : "god power";
}

function measure(def: MoveDef): Row {
  const run = (ms: number, start: Start, reading: Reading = "same", limbs: Limbs = "exact") =>
    watch(literalCopy(def, { ms, start, reading, limbs }), def.id);
  const own = [run(FAST_MS, "down"), run(SLOW_MS, "down"), run(FAST_MS, "guard"), run(SLOW_MS, "guard")] as const;
  const real = [run(FAST_MS, "down", "same", "real"), run(SLOW_MS, "down", "same", "real"), run(FAST_MS, "guard", "same", "real"), run(SLOW_MS, "guard", "same", "real")] as const;
  const clean = intendedCopy(def.id);
  const done = watch(clean, def.id);
  const baseline = done.peakHistory?.baseline ?? null;
  const idle = idleSides(clean);
  const best = Math.max(...clean.frames.filter((frame) => frame.t > clean.from).map((frame) => ghostCloseness(armsAsDrawn(frame, def.diagram, idle), def.diagram, baseline)));
  return {
    down: `${yes(own[0].counted)}/${yes(own[1].counted)}`,
    chest: `${yes(own[2].counted)}/${yes(own[3].counted)}`,
    otherArm: `${yes(run(FAST_MS, "down", "swapped").counted)}/${yes(run(FAST_MS, "guard", "swapped").counted)}`,
    letGo: `${yes(!own[0].counted && own[0].countedOnRelease)}/${yes(!own[2].counted && own[2].countedOnRelease)}`,
    peak: round(Math.max(...own.map((outcome) => outcome.peak))),
    others: [...new Set(own.flatMap((outcome) => outcome.others))].sort().join(", "),
    realLimbs: `${yes(real[0].counted)}/${yes(real[1].counted)}, ${yes(real[2].counted)}/${yes(real[3].counted)}`,
    right: done.peakFrame ? round(ghostCloseness(done.peakFrame, def.diagram, baseline)) : 0,
    rightGuarded: done.peakFrame ? round(ghostCloseness(armsAsDrawn(done.peakFrame, def.diagram, idle), def.diagram, baseline)) : 0,
    rightBest: round(best),
    inPose: round(ghostCloseness(ghostFrame(def.diagram), def.diagram, STANDING)),
  };
}

const IDS = [...MOVES.keys()].sort();
const moveOf = (id: string): MoveDef => {
  const def = MOVES.get(id);
  if (!def) throw new Error(`no move ${id}`);
  return def;
};
const ROWS = new Map(IDS.map((id) => [id, measure(moveOf(id))]));
const rowOf = (id: string): Row => {
  const row = ROWS.get(id);
  if (!row) throw new Error(`no row for ${id}`);
  return row;
};

const HEAD = "| move | style | arms down, fast/slow | from the chest, fast/slow | other arm, down/chest | only on letting go, down/chest | peak | others fired | closeness done right (idle arm as drawn) | best closeness at any moment | closeness in the ghost's pose |";

function line(id: string, row: Row): string {
  const cells = [
    id, styleOf(moveOf(id)), row.down, row.chest, row.otherArm, row.letGo, row.peak.toFixed(2), row.others || "none",
    `${row.right.toFixed(2)} (${row.rightGuarded.toFixed(2)})`, row.rightBest.toFixed(2), row.inPose.toFixed(2),
  ];
  return `| ${cells.join(" | ")} |`;
}

/** The truth today, per move. Change a row only together with docs/ghost-check.md. */
const EXPECTED: Record<string, Row> = {
  aegis_push: { down: "no/no", chest: "no/no", otherArm: "no/no", letGo: "no/no", peak: 0, others: "", realLimbs: "no/no, no/no", right: 0.57, rightGuarded: 0.57, rightBest: 0.76, inPose: 0.72 },
  block: { down: "yes/yes", chest: "yes/yes", otherArm: "yes/yes", letGo: "no/no", peak: 1, others: "rising_palm, uppercut", realLimbs: "yes/yes, yes/yes", right: 0.7, rightGuarded: 0.7, rightBest: 0.74, inPose: 0.69 },
  chain_punch: { down: "no/no", chest: "no/no", otherArm: "no/no", letGo: "no/no", peak: 0, others: "", realLimbs: "no/no, no/no", right: 0, rightGuarded: 0, rightBest: 0.06, inPose: 0.79 },
  cross: { down: "no/no", chest: "no/no", otherArm: "no/no", letGo: "no/no", peak: 0, others: "rising_palm", realLimbs: "no/no, no/no", right: 0, rightGuarded: 0.42, rightBest: 0.47, inPose: 0.79 },
  dodge_left: { down: "yes/yes", chest: "yes/yes", otherArm: "no/no", letGo: "no/no", peak: 1, others: "swift_dash", realLimbs: "yes/yes, yes/yes", right: 0.81, rightGuarded: 0.94, rightBest: 0.98, inPose: 0.36 },
  dodge_right: { down: "yes/yes", chest: "yes/yes", otherArm: "no/no", letGo: "no/no", peak: 1, others: "swift_dash", realLimbs: "yes/yes, yes/yes", right: 0.81, rightGuarded: 0.94, rightBest: 0.98, inPose: 0.36 },
  double_palm: { down: "no/no", chest: "no/no", otherArm: "no/no", letGo: "no/no", peak: 0, others: "block, rising_palm, uppercut", realLimbs: "no/no, no/no", right: 0.56, rightGuarded: 0.56, rightBest: 0.61, inPose: 0.81 },
  duck: { down: "yes/yes", chest: "yes/yes", otherArm: "yes/yes", letGo: "no/no", peak: 1, others: "", realLimbs: "yes/yes, yes/yes", right: 0.85, rightGuarded: 0.97, rightBest: 0.97, inPose: 0 },
  front_kick: { down: "no/no", chest: "no/no", otherArm: "no/no", letGo: "no/no", peak: 0, others: "block, rising_palm, uppercut", realLimbs: "no/no, no/no", right: 0, rightGuarded: 1, rightBest: 1, inPose: 0.72 },
  hammer_fist: { down: "no/no", chest: "no/no", otherArm: "no/no", letGo: "yes/yes", peak: 0, others: "block, rising_palm, uppercut", realLimbs: "no/no, no/no", right: 0, rightGuarded: 0.26, rightBest: 0.87, inPose: 0.53 },
  hook: { down: "no/no", chest: "no/no", otherArm: "no/no", letGo: "no/no", peak: 0, others: "block, rising_palm, uppercut", realLimbs: "no/no, no/no", right: 0.25, rightGuarded: 0.85, rightBest: 0.88, inPose: 0.82 },
  jab: { down: "no/no", chest: "no/no", otherArm: "no/no", letGo: "no/no", peak: 0, others: "uppercut", realLimbs: "no/no, no/no", right: 0, rightGuarded: 0.42, rightBest: 0.47, inPose: 0.79 },
  jump: { down: "yes/yes", chest: "yes/yes", otherArm: "yes/yes", letGo: "no/no", peak: 1, others: "", realLimbs: "yes/yes, yes/yes", right: 0.62, rightGuarded: 0.96, rightBest: 0.96, inPose: 0.31 },
  knee: { down: "yes/yes", chest: "yes/yes", otherArm: "yes/yes", letGo: "no/no", peak: 1, others: "stake_thrust", realLimbs: "yes/yes, yes/yes", right: 0.47, rightGuarded: 1, rightBest: 1, inPose: 0.4 },
  knife_hand: { down: "no/no", chest: "no/no", otherArm: "no/no", letGo: "no/no", peak: 0, others: "rising_palm", realLimbs: "no/no, no/no", right: 0, rightGuarded: 0.49, rightBest: 0.69, inPose: 0.85 },
  moon_arrow: { down: "no/no", chest: "no/no", otherArm: "no/no", letGo: "yes/no", peak: 0, others: "uppercut", realLimbs: "no/no, no/no", right: 0.43, rightGuarded: 0.43, rightBest: 0.62, inPose: 0.92 },
  overhead_strike: { down: "no/no", chest: "no/no", otherArm: "no/no", letGo: "yes/yes", peak: 0, others: "block, rising_palm, uppercut", realLimbs: "no/no, no/no", right: 0, rightGuarded: 0.26, rightBest: 0.87, inPose: 0.53 },
  reverse_punch: { down: "no/no", chest: "yes/yes", otherArm: "no/no", letGo: "no/no", peak: 1, others: "", realLimbs: "no/no, yes/yes", right: 0.34, rightGuarded: 0.34, rightBest: 0.39, inPose: 0.6 },
  rising_palm: { down: "yes/yes", chest: "no/no", otherArm: "yes/no", letGo: "no/no", peak: 1, others: "block, uppercut", realLimbs: "yes/yes, no/no", right: 0, rightGuarded: 0.59, rightBest: 0.78, inPose: 0.64 },
  spear_thrust: { down: "no/no", chest: "yes/yes", otherArm: "no/yes", letGo: "no/no", peak: 1, others: "sun_burst", realLimbs: "no/no, yes/yes", right: 0, rightGuarded: 0, rightBest: 0, inPose: 0.86 },
  stake_thrust: { down: "no/no", chest: "yes/yes", otherArm: "no/yes", letGo: "no/no", peak: 1, others: "", realLimbs: "no/no, yes/yes", right: 0.45, rightGuarded: 0.45, rightBest: 0.59, inPose: 0.46 },
  sun_burst: { down: "no/no", chest: "yes/yes", otherArm: "no/yes", letGo: "no/no", peak: 1, others: "spear_thrust", realLimbs: "no/no, yes/yes", right: 0.13, rightGuarded: 0.13, rightBest: 0.31, inPose: 0.79 },
  swift_dash: { down: "yes/no", chest: "yes/no", otherArm: "yes/yes", letGo: "no/no", peak: 1, others: "dodge_right", realLimbs: "yes/no, yes/no", right: 0.6, rightGuarded: 0.98, rightBest: 0.98, inPose: 0.34 },
  thunderbolt: { down: "no/no", chest: "no/no", otherArm: "no/no", letGo: "yes/yes", peak: 0, others: "uppercut", realLimbs: "no/no, no/no", right: 0.03, rightGuarded: 0.16, rightBest: 0.73, inPose: 0.26 },
  trident_sweep: { down: "no/no", chest: "no/no", otherArm: "no/no", letGo: "no/no", peak: 0, others: "", realLimbs: "no/no, no/no", right: 0, rightGuarded: 0, rightBest: 0.37, inPose: 0.7 },
  uppercut: { down: "yes/yes", chest: "no/no", otherArm: "yes/no", letGo: "no/no", peak: 1, others: "block, rising_palm", realLimbs: "yes/yes, no/no", right: 0, rightGuarded: 0.59, rightBest: 0.78, inPose: 0.64 },
};

test("the table (printed; every row of it is in docs/ghost-check.md)", () => {
  const lines = IDS.map((id) => line(id, rowOf(id)));
  const table = [HEAD, `|${" --- |".repeat(11)}`, ...lines].join("\n");
  (globalThis as { process?: { stdout?: { write(text: string): void } } }).process?.stdout?.write(`\n${table}\n`);
  for (const text of [HEAD, ...lines]) expect(doc).toContain(text);
});

describe("what copying the ghost does today, per move", () => {
  test("every move is pinned", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(IDS);
    expect(IDS).toHaveLength(26);
  });
  test.each(IDS)("%s", (id) => {
    expect(rowOf(id)).toEqual(EXPECTED[id]);
  });
});

describe("how many moves a literal copy counts for", () => {
  const where = (pick: (row: Row) => boolean): string[] => IDS.filter((id) => pick(rowOf(id)));
  const strikes = IDS.filter((id) => moveOf(id).kind === "strike");

  test("in a quarter second from arms hanging: 9 of 26, and only 4 of the 21 strikes", () => {
    const counted = where((row) => row.down.startsWith("yes"));
    expect(counted).toEqual(["block", "dodge_left", "dodge_right", "duck", "jump", "knee", "rising_palm", "swift_dash", "uppercut"]);
    expect(counted.filter((id) => strikes.includes(id))).toHaveLength(4);
    expect(strikes).toHaveLength(21);
  });
  test("from either start at either speed: 13 of 26", () => {
    const counted = where((row) => `${row.down}/${row.chest}`.includes("yes"));
    expect(counted).toHaveLength(13);
    expect(counted.filter((id) => strikes.includes(id))).toEqual(
      ["knee", "reverse_punch", "rising_palm", "spear_thrust", "stake_thrust", "sun_burst", "swift_dash", "uppercut"],
    );
  });
  test("never while in the pose: 13, of which 4 count as the player drops out of it", () => {
    const never = where((row) => !`${row.down}/${row.chest}`.includes("yes"));
    expect(never).toEqual([
      "aegis_push", "chain_punch", "cross", "double_palm", "front_kick", "hammer_fist", "hook", "jab", "knife_hand",
      "moon_arrow", "overhead_strike", "thunderbolt", "trident_sweep",
    ]);
    expect(never.filter((id) => rowOf(id).letGo.includes("yes"))).toEqual(["hammer_fist", "moon_arrow", "overhead_strike", "thunderbolt"]);
  });
  test("real-length limbs change no answer", () => {
    for (const id of IDS) expect(rowOf(id).realLimbs, id).toBe(`${rowOf(id).down}, ${rowOf(id).chest}`);
  });
  test("copying the ghost sets off a different move for 19 of 26", () => {
    expect(where((row) => row.others !== "")).toHaveLength(19);
  });
});

describe("the clean performances and the copy itself", () => {
  test("every move done right is counted, so a miss above is the copy's and not the fixture's", () => {
    for (const id of IDS) expect(watch(intendedCopy(id), id).counted, id).toBe(true);
  });
  test("a body on the ghost's joints in a square picture is on the ghost, so the copy is built right", () => {
    // ghostCloseness measures across and down in the same unit: 0.4 of the picture per metre both ways.
    for (const id of IDS) expect(ghostCloseness(ghostFrame(moveOf(id).diagram, "exact", 0.4), moveOf(id).diagram, null), id).toBeGreaterThan(0.99);
  });
  test("the ghost does not light up for a strike done right: 13 of 21 score under 0.2 as the strike lands", () => {
    const strikes = IDS.filter((id) => moveOf(id).kind === "strike");
    expect(strikes.filter((id) => rowOf(id).right < 0.2)).toHaveLength(13);
    expect(strikes.filter((id) => rowOf(id).right >= 0.7)).toEqual([]);
  });
});

describe("why the straight punches miss", () => {
  test.each([["jab", "left"], ["cross", "right"]] as const)("%s: a full punch by the elbow, thrown away for being out to the side", (id, side) => {
    const recording = literalCopy(moveOf(id), { ms: FAST_MS, start: "guard" });
    let history = EMPTY_HISTORY;
    let punches = 0;
    for (const frame of recording.frames) {
      history = pushFrame(history, frame);
      if (frame.t <= recording.from || punch(history, side) < 1) continue;
      punches += 1;
      expect(flungWide(frame, side)).toBe(true);
      expect(moveOf(id).detect(history)).toBe(0);
    }
    expect(punches).toBeGreaterThan(0);
  });
});
