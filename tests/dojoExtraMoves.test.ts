// The Training Dojo's extra moves and styles (src/coach/extra): each move counts on its own motion, on either
// side, and on nothing less; the game's own moves done right do not set one off; none of them is in the game.
// Every sequence here is made up, the same way as tests/helpers/crossFire.ts: no detector was tried on a camera.
import { expect, test } from "vitest";
import dojoMovesDoc from "../docs/dojo-moves.md?raw";
import {
  EXTRA_GUIDES, EXTRA_MEASURES, EXTRA_MOVES, EXTRA_NEEDS_LEGS, EXTRA_STYLES, EXTRA_TIPS, extraGuideFor, extraMove, judgeExtraRep,
} from "../src/coach/extra";
import { guideFor, labelOf, liveChecks, poseAt } from "../src/coach/guide";
import { PRACTICE_TIPS } from "../src/coach/practice";
import type { MoveDef, PoseFrame } from "../src/core/types";
import { createPoseInput } from "../src/input/poseInput";
import { MOVES } from "../src/moves/registry";
import { EMPTY_HISTORY, pushFrame } from "../src/pose/signals";
import { STYLES } from "../src/styles/registry";
import { PERFORMANCES } from "./helpers/crossFire";
import type { Arm, Key, Leg, Pose } from "./helpers/poses";
import { ACROSS, COCKED, DOWN, LEG_CHAMBER, LEG_DOWN, PUNCH, histories, peak, pose, sequence, standing, withLegs } from "./helpers/poses";

// Arms and legs in left-side coordinates, as in tests/helpers/poses.ts: the left shoulder is at picture (.42, .35)
// and 3D (-.2, -.5, 0), the left hip at picture (.45, .65) and 3D (-.1, 0, 0). The right side is the mirror image.
/** Roundhouse wind-up: knee lifted out to the side of the hip, lower leg folded. */
const LEG_ROUND_UP: Leg = { knee: [0.33, 0.67], ankle: [0.28, 0.74], knee3: [-0.4, 0.05, -0.1], ankle3: [-0.45, 0.2, 0.2] };
/** Roundhouse finish: leg straight, foot round in front of the body at hip height. */
const LEG_ROUND: Leg = { knee: [0.4, 0.66], ankle: [0.44, 0.67], knee3: [-0.15, 0.05, -0.42], ankle3: [-0.05, 0.02, -0.85] };
/** Side kick finish: leg straight out to the side, foot far from the hip. */
const LEG_SIDE: Leg = { knee: [0.34, 0.7], ankle: [0.22, 0.72], knee3: [-0.5, 0.1, 0], ankle3: [-0.92, 0.15, 0] };
/** Low kick: leg straight, foot a little off the floor and out in front. */
const LEG_LOW: Leg = { knee: [0.45, 0.78], ankle: [0.45, 0.87], knee3: [-0.1, 0.42, -0.2], ankle3: [-0.1, 0.78, -0.45] };
/** A foot lifted on the spot to the same height, knee bent: a step, not a kick. */
const LEG_STEP: Leg = { knee: [0.45, 0.76], ankle: [0.45, 0.87], knee3: [-0.1, 0.36, -0.22], ankle3: [-0.1, 0.72, 0.05] };
/** Elbow strike wind-up: arm folded, elbow lifted out to the side at shoulder height. */
const ELBOW_WOUND: Arm = { elbow: [0.26, 0.36], wrist: [0.36, 0.33], elbow3: [-0.5, -0.5, 0], wrist3: [-0.3, -0.5, -0.15] };
/** Elbow strike finish: the same folded arm with the elbow in front of the chest. */
const ELBOW_ACROSS: Arm = { elbow: [0.44, 0.36], wrist: [0.5, 0.34], elbow3: [-0.1, -0.5, -0.28], wrist3: [0.05, -0.5, -0.1] };
/** Palm heel finish: arm pushed out with the hand at chin height. */
const PALM_UP: Arm = { elbow: [0.42, 0.32], wrist: [0.44, 0.26], elbow3: [-0.2, -0.55, -0.28], wrist3: [-0.18, -0.65, -0.52] };
/** High block: forearm level above the forehead, elbow out to the side. */
const ROOF: Arm = { elbow: [0.34, 0.2], wrist: [0.5, 0.14], elbow3: [-0.35, -0.7, -0.1], wrist3: [0, -0.85, -0.2] };
/** A hand raised straight up, forearm upright: the start of a chop, not a block. */
const RAISED: Arm = { elbow: [0.38, 0.2], wrist: [0.42, 0.08], elbow3: [-0.28, -0.65, 0], wrist3: [-0.2, -0.85, -0.05] };
/** Low block finish: arm straight, hand low and clear of the hip. */
const LOW_SWEPT: Arm = { elbow: [0.37, 0.47], wrist: [0.33, 0.57], elbow3: [-0.3, -0.25, -0.1], wrist3: [-0.4, -0.02, -0.2] };
/** The grabbed arm: held out in front, hand between waist and shoulder. */
const HELD_OUT: Arm = { elbow: [0.41, 0.42], wrist: [0.43, 0.47], elbow3: [-0.2, -0.35, -0.25], wrist3: [-0.2, -0.25, -0.5] };
/** The release: elbow folded forward, hand in at its own shoulder. */
const FOLDED_IN: Arm = { elbow: [0.42, 0.47], wrist: [0.42, 0.34], elbow3: [-0.2, -0.3, -0.22], wrist3: [-0.2, -0.52, -0.1] };

type Side = "left" | "right";
const arm = (shape: Arm, side: Side): Pose => (side === "left" ? pose(shape, DOWN) : pose(DOWN, shape));
const leg = (shape: Leg, side: Side): Pose =>
  side === "left" ? withLegs(pose(DOWN), shape, LEG_DOWN) : withLegs(pose(DOWN), LEG_DOWN, shape);
const stood = withLegs(pose(DOWN));
const keys = (...pairs: [number, Pose][]): Key[] => pairs.map(([t, p]) => ({ t, pose: p }));

/** Each extra move done right, on one side. */
const DONE: Record<string, (side: Side) => Key[]> = {
  roundhouse_kick: (side) => keys([0, stood], [100, stood], [300, leg(LEG_ROUND_UP, side)], [450, leg(LEG_ROUND, side)]),
  side_kick: (side) => keys([0, stood], [100, stood], [300, leg(LEG_CHAMBER, side)], [450, leg(LEG_SIDE, side)]),
  low_kick: (side) => keys([0, stood], [100, stood], [250, leg(LEG_LOW, side)], [400, leg(LEG_LOW, side)]),
  elbow_strike: (side) => keys([0, pose(DOWN)], [200, arm(ELBOW_WOUND, side)], [350, arm(ELBOW_ACROSS, side)]),
  palm_heel: (side) => keys([0, pose(DOWN)], [150, arm(COCKED, side)], [300, arm(PALM_UP, side)]),
  // The arm is reached out slowly and held, as a grabbed arm would be; pushed out fast it would be a punch as well.
  wrist_release: (side) => keys([0, pose(DOWN)], [600, arm(HELD_OUT, side)], [900, arm(HELD_OUT, side)], [1050, arm(FOLDED_IN, side)]),
  high_block: (side) => keys([0, pose(DOWN)], [250, arm(ROOF, side)], [450, arm(ROOF, side)]),
  low_block: (side) => keys([0, pose(DOWN)], [200, arm(ACROSS, side)], [450, arm(LOW_SWEPT, side)]),
};
const SIDES: readonly Side[] = ["left", "right"];
const EXTRA = new Map(EXTRA_MOVES.map((move) => [move.id, move]));
const done = (id: string, side: Side = "right"): PoseFrame[] => sequence(DONE[id]?.(side) ?? []);

/** What a pose input over `moves` reads on the frames: each strike as often as it was thrown, and every defend held. */
function read(frames: readonly PoseFrame[], moves: ReadonlyMap<string, MoveDef>): { struck: string[]; held: string[] } {
  const input = createPoseInput(moves);
  const struck: string[] = [];
  const held = new Set<string>();
  let history = EMPTY_HISTORY;
  for (const frame of frames) {
    history = pushFrame(history, frame);
    const now = input(history);
    struck.push(...now.struck.map((strike) => strike.move));
    now.held.forEach((id) => held.add(id));
  }
  return { struck: struck.sort(), held: [...held].sort() };
}

test("there are eight extra moves, each with a made-up performance, and none is in the game", () => {
  expect(EXTRA_MOVES.map((move) => move.id)).toEqual([
    "roundhouse_kick", "side_kick", "low_kick", "elbow_strike", "palm_heel", "wrist_release", "high_block", "low_block",
  ]);
  expect(Object.keys(DONE).sort()).toEqual([...EXTRA.keys()].sort());
  expect(EXTRA.size).toBe(EXTRA_MOVES.length);
  const keysUsed = [...MOVES.values(), ...EXTRA_MOVES].map((move) => move.key);
  expect(new Set(keysUsed).size).toBe(keysUsed.length);
  for (const move of EXTRA_MOVES) {
    expect(MOVES.has(move.id), move.id).toBe(false);
    expect([...MOVES.values()].some((game) => game.name === move.name || game.prompt === move.prompt), move.id).toBe(false);
    expect(extraMove(move.id)).toBe(move);
    // Not Escape, not q (the picture quality key) and not s (skip).
    expect(move.key, move.id).toMatch(/^[a-pt-z]$/);
    expect(move.hint.length, move.id).toBeGreaterThan(20);
    for (const point of Object.values(move.diagram)) {
      for (const value of typeof point === "number" ? [] : point) expect(value >= 0 && value <= 100, `${move.id} diagram`).toBe(true);
    }
  }
  expect(extraMove("jab")).toBeUndefined();
  expect(EXTRA_MOVES.filter((move) => move.kind === "defend").map((move) => move.id)).toEqual(["high_block", "low_block"]);
});

test("each extra move counts on its own motion, on either side, and is the only extra move that does", () => {
  for (const move of EXTRA_MOVES) {
    for (const side of SIDES) {
      const frames = done(move.id, side);
      expect(peak((history) => move.detect(history), frames), `${move.id} ${side}`).toBeGreaterThanOrEqual(0.7);
      const seen = read(frames, EXTRA);
      // A strike is thrown exactly once; a defend is held.
      expect(seen, `${move.id} ${side}`).toEqual(move.kind === "strike" ? { struck: [move.id], held: [] } : { struck: [], held: [move.id] });
    }
  }
});

test("a strike's quality is between 0 and 1 where it counts, and 0 standing still", () => {
  for (const move of EXTRA_MOVES.filter((each) => each.kind === "strike")) {
    const counted = histories(done(move.id)).find((history) => move.detect(history) >= 0.7);
    if (!counted) throw new Error(`${move.id} did not count`);
    const quality = move.quality?.(counted) ?? -1;
    expect(quality, move.id).toBeGreaterThan(0);
    expect(quality, move.id).toBeLessThanOrEqual(1);
    expect(move.quality?.(EMPTY_HISTORY), move.id).toBe(0);
    expect(move.quality?.(histories(standing(700)).at(-1) ?? EMPTY_HISTORY), move.id).toBe(0);
  }
});

test("standing still, with or without the legs in view, counts as none of them", () => {
  const still = [standing(), sequence(keys([0, stood], [1500, stood])), sequence(keys([0, pose(COCKED)], [1500, pose(COCKED)]))];
  for (const frames of still) {
    for (const move of EXTRA_MOVES) expect(peak((history) => move.detect(history), frames), move.id).toBe(0);
  }
  for (const move of EXTRA_MOVES) expect(move.detect(EMPTY_HISTORY), move.id).toBe(0);
});

test("a pose held with no wind-up, or half the motion, counts as nothing", () => {
  const detect = (id: string, ...pairs: [number, Pose][]): number => {
    const move = EXTRA.get(id);
    if (!move) throw new Error(`no move ${id}`);
    return peak((history) => move.detect(history), sequence(keys(...pairs)));
  };
  // The kicks: the wind-up alone, a straight leg swung up with no wind-up, and a kick with the legs out of view.
  expect(detect("roundhouse_kick", [0, stood], [200, leg(LEG_ROUND_UP, "right")], [500, leg(LEG_ROUND_UP, "right")])).toBe(0);
  expect(detect("side_kick", [0, stood], [200, leg(LEG_CHAMBER, "right")], [500, leg(LEG_CHAMBER, "right")])).toBe(0);
  const hidden = (frames: PoseFrame[]): PoseFrame[] =>
    frames.map((frame) => ({ ...frame, image: frame.image.map((point, index) => (index >= 25 ? { ...point, visibility: 0.2 } : point)) }));
  for (const id of EXTRA_NEEDS_LEGS) {
    const move = EXTRA.get(id);
    if (!move) throw new Error(`no move ${id}`);
    expect(peak((history) => move.detect(history), hidden(done(id))), id).toBe(0);
  }
  // A foot lifted on the spot with the knee bent is a step, not a low kick; a foot held out for a second fires once.
  expect(detect("low_kick", [0, stood], [150, leg(LEG_STEP, "right")], [400, leg(LEG_STEP, "right")])).toBe(0);
  expect(read(sequence(keys([0, stood], [150, leg(LEG_LOW, "right")], [1400, leg(LEG_LOW, "right")])), EXTRA).struck).toEqual(["low_kick"]);
  // An elbow lifted out and left there, and a folded arm that was in front of the chest all along.
  expect(detect("elbow_strike", [0, pose(DOWN)], [200, arm(ELBOW_WOUND, "left")], [600, arm(ELBOW_WOUND, "left")])).toBe(0);
  expect(detect("elbow_strike", [0, arm(ELBOW_ACROSS, "left")], [600, arm(ELBOW_ACROSS, "left")])).toBe(0);
  // A hand lifted slowly to face height, and both hands pushed out together.
  expect(detect("palm_heel", [0, pose(DOWN)], [200, arm(COCKED, "left")], [2600, arm(PALM_UP, "left")])).toBe(0);
  expect(detect("palm_heel", [0, pose(DOWN)], [150, pose(COCKED)], [300, pose(PALM_UP)])).toBe(0);
  // A punch pulled straight back is not a release: the arm was not held out first.
  expect(detect("wrist_release", [0, pose(DOWN)], [150, arm(COCKED, "left")], [300, arm(PUNCH, "left")], [450, arm(COCKED, "left")])).toBe(0);
  expect(detect("wrist_release", [0, pose(DOWN)], [150, arm(HELD_OUT, "left")], [250, arm(FOLDED_IN, "left")])).toBe(0);
  expect(detect("wrist_release", [0, pose(DOWN)], [200, arm(HELD_OUT, "left")], [900, arm(HELD_OUT, "left")])).toBe(0);
  // A hand raised straight up to chop, and both forearms up, are not the one-armed high block.
  expect(detect("high_block", [0, pose(DOWN)], [250, arm(RAISED, "left")], [600, arm(RAISED, "left")])).toBe(0);
  expect(detect("high_block", [0, pose(DOWN)], [250, pose(ROOF)], [600, pose(ROOF)])).toBe(0);
  // A hand dropped from the other shoulder to hang at the side, and a hand low with no sweep.
  expect(detect("low_block", [0, pose(DOWN)], [200, arm(ACROSS, "right")], [450, pose(DOWN)])).toBe(0);
  expect(detect("low_block", [0, pose(DOWN)], [300, arm(LOW_SWEPT, "right")], [900, arm(LOW_SWEPT, "right")])).toBe(0);
});

test("no extra move counts while a game move is done right", () => {
  expect(Object.keys(PERFORMANCES).sort()).toEqual([...MOVES.keys()].sort());
  for (const [id, performance] of Object.entries(PERFORMANCES)) {
    const frames = sequence(performance);
    for (const move of EXTRA_MOVES) expect(peak((history) => move.detect(history), frames), `${move.id} during ${id}`).toBe(0);
  }
});

/**
 * The game's moves that also count while an extra move is done right. The Dojo asks for one move at a time, so
 * these overlaps cost nothing there; they are why these moves cannot join a fight as they are.
 * - front_kick checks a lifted, folded knee and then a high, straight leg, not which way the foot went, so it
 *   reads the roundhouse and the side kick too.
 * - jab and cross read a fast straight arm at any height near the shoulder, so they read the palm heel too.
 * - knee was loosened with the game's other moves (a short lift now counts), so it reads the chamber of the roundhouse and the side kick too.
 * - The lenient gates (a move counts when the right arm moves) also let jab and cross read the wrist release's arm
 *   held out, and rising_palm and uppercut read the low block's hand coming up to start its sweep.
 */
const ALSO: Record<string, readonly string[]> = {
  roundhouse_kick: ["front_kick", "knee"],
  side_kick: ["front_kick", "knee"],
  low_kick: [],
  elbow_strike: [],
  palm_heel: ["cross", "jab"],
  wrist_release: ["cross", "jab"],
  high_block: [],
  low_block: ["rising_palm", "uppercut"],
};

test("the game's nearest move does not count on an extra move, except where the list above says so", () => {
  for (const move of EXTRA_MOVES) {
    const seen = new Set<string>();
    for (const side of SIDES) {
      const { struck, held } = read(done(move.id, side), MOVES);
      [...struck, ...held].forEach((id) => seen.add(id));
    }
    expect([...seen].sort(), move.id).toEqual(ALSO[move.id]);
  }
});

test("every extra move has a teaching line, a guide, a tip and a checklist that agrees with its detector", () => {
  const jargon = /\b(lead hand|rear hand|orthodox|southpaw|parry)\b/i;
  const rows = dojoMovesDoc.split("\n").filter((row) => row.startsWith("| "));
  for (const move of EXTRA_MOVES) {
    const line = move.teaches ?? "";
    expect(line.trim().length, move.id).toBeGreaterThan(20);
    expect(line.length, move.id).toBeLessThanOrEqual(90);
    expect(line, move.id).not.toMatch(jargon);
    // docs/dojo-moves.md lists the move with the same line and a source link, as docs/moves.md does for the game's.
    const row = rows.find((candidate) => candidate.includes(`(\`${move.id}\`) |`));
    expect(row, move.id).toBeDefined();
    expect(row, move.id).toContain(`| ${line} | [`);

    const guide = extraGuideFor(move);
    if (!guide) throw new Error(`${move.id} has no guide`);
    expect(EXTRA_GUIDES[move.id]).toBe(guide);
    expect(guideFor(move), `${move.id} is not in the game's guides`).toBeNull();
    expect(guide.title).toBe(move.name);
    const words = guide.how.split(/\s+/).length;
    expect(words >= 3 && words <= 6, `${move.id}: "${guide.how}"`).toBe(true);
    expect(guide.keyframes.length >= 2 && guide.keyframes.length <= 4, move.id).toBe(true);
    expect(guide.keyframes[0]?.t).toBe(0);
    guide.keyframes.forEach((key, index) => {
      if (index > 0) expect(key.t, move.id).toBeGreaterThan(guide.keyframes[index - 1]?.t ?? 0);
      expect(key.t, move.id).toBeLessThan(guide.loopMs);
    });
    expect(guide.moving.length, move.id).toBeGreaterThan(0);
    for (const ms of [0, 200, 480, 700, 959]) {
      for (const point of Object.values(poseAt(guide, ms).pose)) expect(point.every(Number.isFinite), move.id).toBe(true);
    }

    const tip = EXTRA_TIPS[move.id];
    if (!tip) throw new Error(`${move.id} has no tip`);
    expect(tip.part.length >= 1 && tip.part.length <= 20, `${move.id}: "${tip.part}"`).toBe(true);
    expect(tip.tip.length >= 20 && tip.tip.length <= 90, `${move.id}: "${tip.tip}" is ${String(tip.tip.length)}`).toBe(true);

    const options = EXTRA_MEASURES[move.id] ?? [];
    expect(options.length, move.id).toBe(2);
    for (const measures of options) {
      for (const measure of measures) {
        const { label } = labelOf(move.id, measure, measures);
        expect(label.length >= 4 && label.length <= 28, `${move.id}: "${label}"`).toBe(true);
        expect(label, move.id).not.toMatch(/\b(degrees|shoulder widths|ms)\b|\d/);
      }
    }
    // The checklist says "matched" on exactly the frames the detector counts.
    for (const side of SIDES) {
      for (const history of histories(done(move.id, side))) {
        const live = liveChecks(move, history, undefined, 4, EXTRA_MEASURES);
        expect(live.matched, `${move.id} ${side} at ${String(history.frames.at(-1)?.t)}`).toBe(move.detect(history) >= 0.7);
        expect(live.checks.length, move.id).toBeGreaterThan(0);
      }
    }
    expect(liveChecks(move, null, null, 4, EXTRA_MEASURES).matched).toBe(false);
  }
  expect(Object.keys(EXTRA_GUIDES).sort()).toEqual([...EXTRA.keys()].sort());
  expect(Object.keys(EXTRA_TIPS).sort()).toEqual([...EXTRA.keys()].sort());
  expect(Object.keys(EXTRA_MEASURES).sort()).toEqual([...EXTRA.keys()].sort());
});

test("practice judges an extra move and gives the move's own tip, or asks for the feet", () => {
  for (const move of EXTRA_MOVES) {
    const good = judgeExtraRep(move, done(move.id));
    expect(good.counted, move.id).toBe(true);
    expect(good.peak, move.id).toBeGreaterThanOrEqual(0.7);
    // Standing still is said as it is, not as a fault in the move; a kick with no legs in the picture asks for the feet.
    const still = judgeExtraRep(move, standing(1500));
    expect(still.counted, move.id).toBe(false);
    expect(still.tip, move.id).toBe(EXTRA_NEEDS_LEGS.includes(move.id) ? PRACTICE_TIPS.feet.tip : PRACTICE_TIPS.still.tip);
  }
  // Half a move: the move's own tip, never the one for any strike or any defend.
  const half = judgeExtraRep(EXTRA.get("elbow_strike") as MoveDef, sequence(keys([0, pose(DOWN)], [200, arm(ELBOW_WOUND, "left")], [600, arm(ELBOW_WOUND, "left")])));
  expect(half).toMatchObject({ counted: false, tip: EXTRA_TIPS.elbow_strike?.tip, part: EXTRA_TIPS.elbow_strike?.part });
  const raised = judgeExtraRep(EXTRA.get("high_block") as MoveDef, sequence(keys([0, pose(DOWN)], [250, arm(RAISED, "left")], [600, arm(RAISED, "left")])));
  expect(raised).toMatchObject({ counted: false, tip: EXTRA_TIPS.high_block?.tip });
  // A kick with the legs out of the picture: step back.
  expect(EXTRA_NEEDS_LEGS).toEqual(["roundhouse_kick", "side_kick", "low_kick"]);
  for (const id of EXTRA_NEEDS_LEGS) {
    const moved = sequence(keys([0, pose(DOWN)], [150, arm(COCKED, "left")], [300, arm(PUNCH, "left")]));
    expect(judgeExtraRep(EXTRA.get(id) as MoveDef, moved), id).toMatchObject({ counted: false, tip: PRACTICE_TIPS.feet.tip, part: PRACTICE_TIPS.feet.part });
  }
  // A game move is judged as before.
  const jab = MOVES.get("jab") as MoveDef;
  expect(judgeExtraRep(jab, sequence(PERFORMANCES.jab ?? [])).counted).toBe(true);
});

test("the Dojo's styles name real moves, have one short line each, and are not the game's styles", () => {
  expect(EXTRA_STYLES.map((style) => style.name)).toEqual(["Taekwondo kicks", "Self-defense basics", "Muay Thai", "Karate basics"]);
  const ids = EXTRA_STYLES.map((style) => style.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const style of EXTRA_STYLES) {
    expect(STYLES.some((game) => game.id === style.id || game.name === style.name), style.id).toBe(false);
    expect(style.id, style.id).toMatch(/^[a-z_]+$/);
    expect(style.strikes.length, style.id).toBeGreaterThan(0);
    expect(new Set(style.strikes).size, style.id).toBe(style.strikes.length);
    for (const id of style.strikes) expect(MOVES.get(id) ?? EXTRA.get(id), `${style.id}: ${id}`).toBeDefined();
    expect(style.line.length >= 10 && style.line.length <= 70, `${style.id}: ${String(style.line.length)}`).toBe(true);
    // One sentence: it ends with a full stop and has no other.
    expect(style.line.endsWith("."), style.id).toBe(true);
    expect(style.line.slice(0, -1), style.id).not.toMatch(/[.!?]/);
    expect(dojoMovesDoc, style.id).toContain(`| ${style.name} (\`${style.id}\`) | ${style.line} |`);
  }
  const strikesOf = (id: string): readonly string[] => EXTRA_STYLES.find((style) => style.id === id)?.strikes ?? [];
  expect(strikesOf("taekwondo_kicks")).toEqual(expect.arrayContaining(["front_kick", "roundhouse_kick", "side_kick", "knee"]));
  expect(strikesOf("self_defense")).toEqual(expect.arrayContaining(["palm_heel", "elbow_strike", "knee", "hammer_fist", "wrist_release"]));
  // Every extra move is trained by at least one style.
  for (const move of EXTRA_MOVES) expect(EXTRA_STYLES.some((style) => style.strikes.includes(move.id)), move.id).toBe(true);
});
