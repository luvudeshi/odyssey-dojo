// Would a player who copies the move ghost exactly have the move counted? All 26 moves, through the real pose input.
// The ghost (src/render/GhostFigure.tsx) is a still figure drawn from each move's prompt-card `diagram`; the
// detectors want motion and, for punches, a fist coming at the camera. docs/ghost-check.md explains each row.
// The table is pinned: a change to a diagram, the ghost's maths or a detector that moves a row fails here.
// The pins are a measurement, not a requirement: when a detector changes, measure again and write down what it gives.
// Second half: the same question for the move guide's looping figure (src/coach/guide.ts), side by side.
import { describe, expect, test } from "vitest";
import doc from "../docs/ghost-check.md?raw";
import type { MoveDef } from "../src/core/types";
import { flungWide, punch } from "../src/moves/handSignals";
import { MOVES } from "../src/moves/registry";
import { EMPTY_HISTORY, baselineOf, pushFrame } from "../src/pose/signals";
import { ghostCloseness } from "../src/render/ghost/ghostPose";
import { STYLES } from "../src/styles/registry";
import { armsAsDrawn, ghostFrame, guideCopy, idleSides, intendedCopy, literalCopy, watch } from "./helpers/ghostCopy";
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
  /** Every other move thrown or held during the four own-arm copies, up to letting go. */
  readonly others: string;
  /** The same with the drop back out of the pose counted too, to set beside the guide's figure, which shows the way back. */
  readonly othersInAll: string;
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
    othersInAll: [...new Set(own.flatMap((outcome) => [...outcome.others, ...outcome.othersOnRelease]))].sort().join(", "),
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
  aegis_push: { down: "no/no", chest: "no/no", otherArm: "no/no", letGo: "no/no", peak: 0, others: "", othersInAll: "", realLimbs: "no/no, no/no", right: 0.63, rightGuarded: 0.63, rightBest: 0.76, inPose: 0.72 },
  block: { down: "yes/yes", chest: "yes/yes", otherArm: "yes/yes", letGo: "no/no", peak: 1, others: "", othersInAll: "hammer_fist, overhead_strike, thunderbolt", realLimbs: "yes/yes, yes/yes", right: 0.7, rightGuarded: 0.7, rightBest: 0.74, inPose: 0.69 },
  chain_punch: { down: "no/no", chest: "no/no", otherArm: "no/no", letGo: "no/no", peak: 0, others: "", othersInAll: "moon_arrow", realLimbs: "no/no, no/no", right: 0, rightGuarded: 0, rightBest: 0.06, inPose: 0.79 },
  cross: { down: "no/no", chest: "no/no", otherArm: "no/no", letGo: "no/no", peak: 0, others: "", othersInAll: "", realLimbs: "no/no, no/no", right: 0, rightGuarded: 0.46, rightBest: 0.47, inPose: 0.79 },
  dodge_left: { down: "yes/yes", chest: "yes/yes", otherArm: "no/no", letGo: "no/no", peak: 1, others: "swift_dash", othersInAll: "swift_dash", realLimbs: "yes/yes, yes/yes", right: 0.81, rightGuarded: 0.94, rightBest: 0.98, inPose: 0.36 },
  dodge_right: { down: "yes/yes", chest: "yes/yes", otherArm: "no/no", letGo: "no/no", peak: 1, others: "swift_dash", othersInAll: "swift_dash", realLimbs: "yes/yes, yes/yes", right: 0.81, rightGuarded: 0.94, rightBest: 0.98, inPose: 0.36 },
  double_palm: { down: "no/no", chest: "no/no", otherArm: "no/no", letGo: "no/no", peak: 0, others: "block", othersInAll: "block", realLimbs: "no/no, no/no", right: 0.56, rightGuarded: 0.56, rightBest: 0.61, inPose: 0.81 },
  duck: { down: "yes/yes", chest: "yes/yes", otherArm: "yes/yes", letGo: "no/no", peak: 1, others: "", othersInAll: "", realLimbs: "yes/yes, yes/yes", right: 0.81, rightGuarded: 0.94, rightBest: 0.97, inPose: 0 },
  front_kick: { down: "no/no", chest: "no/no", otherArm: "no/no", letGo: "no/no", peak: 0, others: "block", othersInAll: "block", realLimbs: "no/no, no/no", right: 0, rightGuarded: 1, rightBest: 1, inPose: 0.72 },
  hammer_fist: { down: "no/no", chest: "no/no", otherArm: "no/no", letGo: "yes/yes", peak: 0, others: "block, jab, rising_palm, uppercut", othersInAll: "block, jab, rising_palm, thunderbolt, uppercut", realLimbs: "no/no, no/no", right: 0, rightGuarded: 0.26, rightBest: 0.87, inPose: 0.53 },
  hook: { down: "no/no", chest: "no/no", otherArm: "no/no", letGo: "no/no", peak: 0, others: "", othersInAll: "", realLimbs: "no/no, no/no", right: 0.25, rightGuarded: 0.85, rightBest: 0.88, inPose: 0.82 },
  jab: { down: "no/no", chest: "no/no", otherArm: "no/no", letGo: "no/no", peak: 0, others: "", othersInAll: "", realLimbs: "no/no, no/no", right: 0, rightGuarded: 0.46, rightBest: 0.47, inPose: 0.79 },
  jump: { down: "yes/yes", chest: "yes/yes", otherArm: "yes/yes", letGo: "no/no", peak: 1, others: "", othersInAll: "", realLimbs: "yes/yes, yes/yes", right: 0.62, rightGuarded: 0.96, rightBest: 0.96, inPose: 0.31 },
  knee: { down: "yes/yes", chest: "yes/yes", otherArm: "yes/yes", letGo: "no/no", peak: 1, others: "stake_thrust", othersInAll: "stake_thrust", realLimbs: "yes/yes, yes/yes", right: 0.47, rightGuarded: 1, rightBest: 1, inPose: 0.4 },
  knife_hand: { down: "no/no", chest: "no/no", otherArm: "no/no", letGo: "no/no", peak: 0, others: "", othersInAll: "", realLimbs: "no/no, no/no", right: 0, rightGuarded: 0.49, rightBest: 0.69, inPose: 0.85 },
  moon_arrow: { down: "no/no", chest: "no/no", otherArm: "no/no", letGo: "yes/no", peak: 0, others: "", othersInAll: "", realLimbs: "no/no, no/no", right: 0.43, rightGuarded: 0.43, rightBest: 0.62, inPose: 0.92 },
  overhead_strike: { down: "no/no", chest: "no/no", otherArm: "no/no", letGo: "yes/yes", peak: 0, others: "block, cross, rising_palm, uppercut", othersInAll: "block, cross, rising_palm, thunderbolt, uppercut", realLimbs: "no/no, no/no", right: 0, rightGuarded: 0.26, rightBest: 0.87, inPose: 0.53 },
  reverse_punch: { down: "no/no", chest: "yes/yes", otherArm: "no/no", letGo: "no/no", peak: 1, others: "", othersInAll: "", realLimbs: "no/no, yes/yes", right: 0.34, rightGuarded: 0.34, rightBest: 0.39, inPose: 0.6 },
  rising_palm: { down: "no/no", chest: "no/no", otherArm: "yes/no", letGo: "no/no", peak: 0, others: "block, uppercut", othersInAll: "block, hammer_fist, thunderbolt, uppercut", realLimbs: "no/no, no/no", right: 0.13, rightGuarded: 0.74, rightBest: 0.78, inPose: 0.64 },
  spear_thrust: { down: "no/no", chest: "no/no", otherArm: "no/no", letGo: "no/no", peak: 0, others: "sun_burst", othersInAll: "sun_burst", realLimbs: "no/no, no/no", right: 0, rightGuarded: 0, rightBest: 0, inPose: 0.86 },
  stake_thrust: { down: "no/no", chest: "yes/yes", otherArm: "no/yes", letGo: "no/no", peak: 1, others: "", othersInAll: "", realLimbs: "no/no, yes/yes", right: 0.43, rightGuarded: 0.43, rightBest: 0.59, inPose: 0.46 },
  sun_burst: { down: "no/no", chest: "yes/yes", otherArm: "no/yes", letGo: "no/no", peak: 1, others: "", othersInAll: "", realLimbs: "no/no, yes/yes", right: 0, rightGuarded: 0, rightBest: 0.31, inPose: 0.79 },
  swift_dash: { down: "yes/no", chest: "yes/no", otherArm: "yes/yes", letGo: "no/no", peak: 1, others: "dodge_right", othersInAll: "dodge_right", realLimbs: "yes/no, yes/no", right: 0.6, rightGuarded: 0.98, rightBest: 0.98, inPose: 0.34 },
  thunderbolt: { down: "no/no", chest: "no/no", otherArm: "no/no", letGo: "yes/yes", peak: 0, others: "cross, uppercut", othersInAll: "cross, overhead_strike, uppercut", realLimbs: "no/no, no/no", right: 0.03, rightGuarded: 0.16, rightBest: 0.73, inPose: 0.26 },
  trident_sweep: { down: "no/no", chest: "no/no", otherArm: "no/no", letGo: "no/no", peak: 0, others: "", othersInAll: "hook", realLimbs: "no/no, no/no", right: 0, rightGuarded: 0, rightBest: 0.37, inPose: 0.7 },
  uppercut: { down: "no/no", chest: "no/no", otherArm: "yes/no", letGo: "no/no", peak: 0, others: "block, rising_palm", othersInAll: "block, overhead_strike, rising_palm, thunderbolt", realLimbs: "no/no, no/no", right: 0.13, rightGuarded: 0.74, rightBest: 0.78, inPose: 0.64 },
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

  test("in a quarter second from arms hanging: 7 of 26, and only 2 of the 21 strikes", () => {
    const counted = where((row) => row.down.startsWith("yes"));
    expect(counted).toEqual(["block", "dodge_left", "dodge_right", "duck", "jump", "knee", "swift_dash"]);
    expect(counted.filter((id) => strikes.includes(id))).toEqual(["knee", "swift_dash"]);
    expect(strikes).toHaveLength(21);
  });
  test("from either start at either speed: 10 of 26", () => {
    const counted = where((row) => `${row.down}/${row.chest}`.includes("yes"));
    expect(counted).toHaveLength(10);
    expect(counted.filter((id) => strikes.includes(id))).toEqual(["knee", "reverse_punch", "stake_thrust", "sun_burst", "swift_dash"]);
  });
  test("never while in the pose: 16, of which 4 count as the player drops out of it", () => {
    const never = where((row) => !`${row.down}/${row.chest}`.includes("yes"));
    expect(never).toEqual([
      "aegis_push", "chain_punch", "cross", "double_palm", "front_kick", "hammer_fist", "hook", "jab", "knife_hand",
      "moon_arrow", "overhead_strike", "rising_palm", "spear_thrust", "thunderbolt", "trident_sweep", "uppercut",
    ]);
    expect(never.filter((id) => rowOf(id).letGo.includes("yes"))).toEqual(["hammer_fist", "moon_arrow", "overhead_strike", "thunderbolt"]);
  });
  test("real-length limbs change no answer", () => {
    for (const id of IDS) expect(rowOf(id).realLimbs, id).toBe(`${rowOf(id).down}, ${rowOf(id).chest}`);
  });
  test("copying the ghost sets off a different move for 12 of 26, and for 15 with the drop back out counted", () => {
    const some = where((row) => row.others !== "");
    expect(some).toHaveLength(12);
    expect(some.filter((id) => strikes.includes(id))).toHaveLength(10);
    const inAll = where((row) => row.othersInAll !== "");
    expect(inAll).toHaveLength(15);
    expect(inAll.filter((id) => strikes.includes(id))).toHaveLength(12);
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

// The move guide (src/coach/guide.ts, drawn by src/coach/ui/MoveGuide.tsx) is a looping figure: start pose, the move,
// back to the start, with a fist or foot that comes at the camera drawn growing. The same question for it.
interface GuideRow {
  /** A body following the figure exactly: counted the first time round the loop / within two times round. */
  readonly counted: string;
  /** Every other move thrown or held in those two loops, the way back to the start included. */
  readonly others: string;
}

function measureGuide(def: MoveDef): GuideRow {
  const once = watch(guideCopy(def, 1), def.id);
  const twice = watch(guideCopy(def, 2), def.id);
  return { counted: `${yes(once.counted)}/${yes(twice.counted)}`, others: twice.others.join(", ") };
}

const GUIDE_ROWS = new Map(IDS.map((id) => [id, measureGuide(moveOf(id))]));
const guideRowOf = (id: string): GuideRow => {
  const row = GUIDE_ROWS.get(id);
  if (!row) throw new Error(`no guide row for ${id}`);
  return row;
};

const GUIDE_HEAD = "| move | style | still ghost: counted, arms down fast | still ghost: counted from any start, any speed | guide's figure: counted, first loop/within two | still ghost: others fired, way out included | guide's figure: others fired |";

function guideLine(id: string): string {
  const ghost = rowOf(id);
  const figure = guideRowOf(id);
  const cells = [
    id, styleOf(moveOf(id)), ghost.down.split("/")[0] ?? "", yes(`${ghost.down}/${ghost.chest}`.includes("yes")), figure.counted,
    ghost.othersInAll || "none", figure.others || "none",
  ];
  return `| ${cells.join(" | ")} |`;
}

/** The truth today for the guide's figure, per move. Change a row only together with docs/ghost-check.md. */
const GUIDE_EXPECTED: Record<string, GuideRow> = {
  aegis_push: { counted: "yes/yes", others: "double_palm, spear_thrust" },
  block: { counted: "yes/yes", others: "overhead_strike, thunderbolt" },
  chain_punch: { counted: "yes/yes", others: "cross, jab, trident_sweep" },
  cross: { counted: "yes/yes", others: "" },
  dodge_left: { counted: "yes/yes", others: "swift_dash" },
  dodge_right: { counted: "yes/yes", others: "swift_dash" },
  double_palm: { counted: "yes/yes", others: "aegis_push, spear_thrust" },
  duck: { counted: "yes/yes", others: "" },
  front_kick: { counted: "yes/yes", others: "block, knee" },
  hammer_fist: { counted: "yes/yes", others: "block, thunderbolt, uppercut" },
  hook: { counted: "yes/yes", others: "block, thunderbolt, uppercut" },
  jab: { counted: "yes/yes", others: "" },
  jump: { counted: "yes/yes", others: "" },
  knee: { counted: "yes/yes", others: "stake_thrust" },
  knife_hand: { counted: "yes/yes", others: "block" },
  moon_arrow: { counted: "yes/yes", others: "" },
  overhead_strike: { counted: "yes/yes", others: "block, rising_palm, thunderbolt" },
  reverse_punch: { counted: "yes/yes", others: "cross" },
  rising_palm: { counted: "yes/yes", others: "block, hammer_fist, thunderbolt" },
  spear_thrust: { counted: "yes/yes", others: "" },
  stake_thrust: { counted: "yes/yes", others: "" },
  sun_burst: { counted: "yes/yes", others: "knife_hand, overhead_strike, thunderbolt" },
  swift_dash: { counted: "yes/yes", others: "dodge_right" },
  thunderbolt: { counted: "yes/yes", others: "overhead_strike" },
  trident_sweep: { counted: "yes/yes", others: "hook, knife_hand" },
  uppercut: { counted: "yes/yes", others: "block, overhead_strike, thunderbolt" },
};

describe("the still ghost beside the move guide's figure", () => {
  const strikes = IDS.filter((id) => moveOf(id).kind === "strike");

  test("the side-by-side table (printed; every row of it is in docs/ghost-check.md)", () => {
    const lines = IDS.map(guideLine);
    const table = [GUIDE_HEAD, `|${" --- |".repeat(7)}`, ...lines].join("\n");
    (globalThis as { process?: { stdout?: { write(text: string): void } } }).process?.stdout?.write(`\n${table}\n`);
    for (const text of [GUIDE_HEAD, ...lines]) expect(doc).toContain(text);
  });
  test("every move is pinned", () => {
    expect(Object.keys(GUIDE_EXPECTED).sort()).toEqual(IDS);
  });
  test.each(IDS)("%s", (id) => {
    expect(guideRowOf(id)).toEqual(GUIDE_EXPECTED[id]);
  });
  test("copying the guide's figure counts for 26 of 26, the first time round; copying the still ghost for 7, or 10 at best", () => {
    const first = IDS.filter((id) => guideRowOf(id).counted.startsWith("yes"));
    expect(first).toEqual(IDS);
    expect(first.filter((id) => strikes.includes(id))).toHaveLength(21);
    expect(IDS.filter((id) => rowOf(id).down.startsWith("yes"))).toHaveLength(7);
    expect(IDS.filter((id) => `${rowOf(id).down}/${rowOf(id).chest}`.includes("yes"))).toHaveLength(10);
    // The doc's summary lines say the same.
    expect(doc).toContain("| counted, the natural way (ghost: fast from arms hanging; guide: first time round the loop) | 7 of 26 | 26 of 26 |");
    expect(doc).toContain("| ...of the 21 strikes | 2 of 21 | 21 of 21 |");
    expect(doc).toContain("| counted at best (ghost: any start, any speed; guide: within two loops) | 10 of 26 | 26 of 26 |");
    expect(doc).toContain("| also sets off some other move, way back out included | 15 of 26 | 19 of 26 |");
  });
  test("following the guide's figure sets off a different move too, for 19 of 26", () => {
    const some = IDS.filter((id) => guideRowOf(id).others !== "");
    expect(some).toHaveLength(19);
    expect(some.filter((id) => strikes.includes(id))).toHaveLength(16);
  });
});
