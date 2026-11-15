// The margins report (tools/recorder/report.ts) and the table it reads (src/moves/measures.ts).
// The table only describes the detectors, so the last test moves a made-up body about at random and checks
// that the two never disagree about a frame.
import { expect, test } from "vitest";
import { DEFEND_ON } from "../../src/input/poseInput";
import { MEASURES, readMeasure } from "../../src/moves/measures";
import { MOVES } from "../../src/moves/registry";
import { measureTrace, reportText } from "../../tools/recorder/report";
import { loadTrace } from "../../tools/recorder/trace";
import type { StoredTrace } from "../../tools/recorder/trace";
import { GOD_GOOD } from "../godMoveSequences";
import {
  ACROSS, CHOP, COCKED, DOWN, GUARD, HIP, HOOK_IN, HOOK_OUT, LATERAL, LEG_CHAMBER, LEG_DOWN, LEG_HALF, LEG_KICK,
  LEG_KNEE, OVERHEAD, PALM, PUNCH, STAKE_CHEST, STAKE_DOWN, histories, pose, sequence, withLegs,
} from "../helpers/poses";
import type { Key } from "../helpers/poses";

const FILES = import.meta.glob<StoredTrace>("../fixtures/poses/*.json", { eager: true, import: "default" });
function fixture(name: string) {
  const stored = Object.entries(FILES).find(([path]) => path.endsWith(`/${name}`))?.[1];
  if (!stored) throw new Error(`no fixture called ${name}`);
  return loadTrace(stored);
}

test("every move has its measures listed, and every list is for a move", () => {
  expect(Object.keys(MEASURES).sort()).toEqual([...MOVES.keys()].sort());
  for (const [id, options] of Object.entries(MEASURES)) {
    expect(options.length, id).toBeGreaterThan(0);
    for (const option of options) expect(option.length, id).toBeGreaterThan(0);
  }
});

test("a trace that fires is reported with its frame and every margin, smallest first", () => {
  const text = reportText("jab-madeup-1.json", fixture("jab-madeup-1.json"), MOVES);
  const lines = text.split("\n");
  expect(lines[0]).toBe("jab-madeup-1.json: jab FIRED on frame 46 of 92 (1485 ms)");
  expect(lines[1]).toMatch(/^\s+margin\s+measured\s+threshold\s+condition$/);
  expect(lines[2]).toMatch(/^\s+\+5%\s+152\s+> {2}145\s+left elbow straight, degrees$/);
  expect(text).toMatch(/\+67%\s+66\s+<= 200\s+ms since left elbow was bent under 115/);
  expect(text).toMatch(/clear\s+never\s+> {2}500\s+ms since left hand was over the nose/);
  expect(text).not.toMatch(/first failed/);

  const report = measureTrace(fixture("jab-madeup-1.json"), MOVES);
  expect(report?.readings.length).toBe(MEASURES.jab?.[0]?.length);
  expect(report?.readings.every((reading) => reading.passed)).toBe(true);
  const margins = lines.slice(2).map((line) => line.trim().split(/\s+/)[0]).filter((cell) => cell?.endsWith("%")).map((cell) => parseInt(cell ?? "", 10));
  expect(margins).toEqual([...margins].sort((a, b) => a - b));

  // A defend move fires on the first frame it is held, from 0.5.
  expect(reportText("block-madeup-1.json", fixture("block-madeup-1.json"), MOVES)).toMatch(/^block-madeup-1\.json: block FIRED on frame 49 of 92/);
  expect(reportText("idle-madeup-1.json", fixture("idle-madeup-1.json"), MOVES)).toBe("idle-madeup-1.json: idle: nothing fired, as it should");
});

test("a trace that misses is reported with its closest frame and the first condition that failed", () => {
  // The move comes from the file name: the made-up jab under a cross's name, and standing still under a block's.
  const cross = reportText("cross-madeup-1.json", fixture("jab-madeup-1.json"), MOVES).split("\n");
  expect(cross[0]).toMatch(/^cross-madeup-1\.json: cross DID NOT FIRE \(peak confidence 0\.00, needs 0\.70\); closest on frame \d+ of 92 \(\d+ ms\)$/);
  expect(cross[1]).toMatch(/^ {2}first failed: .+: \S+, needs (>=|<=|> |< ) \S+ \((-\d+%|missed)\)$/);
  expect(cross[3]).toMatch(/^\s+(-\d+%|missed)\s/);
  expect(measureTrace(fixture("jab-madeup-1.json"), MOVES, "cross")).toMatchObject({ fired: false, peak: 0 });

  const block = reportText("block-madeup-2.json", fixture("idle-madeup-1.json"), MOVES).split("\n");
  expect(block[0]).toMatch(/block DID NOT FIRE \(peak confidence 0\.00/);
  expect(block[1]).toBe(`  first failed: guard confidence (1 is both fists within 1 shoulder width of the nose, 0.2 below the shoulder line or higher, forearms standing): 0.00, needs >= 0.50 (-100%)`);

  expect(reportText("no_such_move-ana-1.json", fixture("idle-madeup-1.json"), MOVES)).toMatch(/there is no move with that name/);
  expect(reportText("jab-ana-1.json", { ...fixture("idle-madeup-1.json"), move: "idle" }, MOVES)).toMatch(/^jab-ana-1\.json: jab DID NOT FIRE/);
});

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ARMS = [DOWN, COCKED, PUNCH, LATERAL, PALM, GUARD, HIP, OVERHEAD, CHOP, ACROSS, HOOK_OUT, HOOK_IN, STAKE_CHEST, STAKE_DOWN];
const LEGS = [LEG_DOWN, LEG_DOWN, LEG_HALF, LEG_CHAMBER, LEG_KICK, LEG_KNEE];

/** Two seconds of a made-up body going from one pose to the next at random speeds, sometimes with a step or a drop. */
function wander(random: () => number): Key[] {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
  const keys: Key[] = [];
  for (let t = 0; t < 2000; t += 60 + Math.floor(random() * 400)) {
    const shift = random() < 0.3 ? (random() - 0.5) * 0.3 : 0;
    const arms = pose(pick(ARMS), pick(ARMS), shift, random() < 0.2 ? (random() - 0.5) * 0.25 : 0);
    keys.push({ t, pose: random() < 0.4 ? withLegs(arms, pick(LEGS), pick(LEGS)) : arms });
  }
  return keys;
}

test("the table agrees with the detectors on every frame of made-up motion", () => {
  const random = rng(192);
  const takes = [...Object.values(GOD_GOOD), ...Array.from({ length: 150 }, () => wander(random))];
  const fired = new Set<string>();
  for (const keys of takes) {
    for (const history of histories(sequence(keys))) {
      for (const move of MOVES.values()) {
        const counts = move.detect(history) >= (move.kind === "defend" ? DEFEND_ON : 0.7);
        const options = MEASURES[move.id] ?? [];
        const says = options.some((option) => option.every((measure) => readMeasure(measure, history).passed));
        if (counts) fired.add(move.id);
        if (says !== counts) {
          const readings = options.flat().map((measure) => readMeasure(measure, history)).map((r) => `${r.name} ${String(r.value)} (${String(r.margin)})`);
          expect.fail(`${move.id}: the detector says ${String(counts)}, the table says ${String(says)}\n${readings.join("\n")}`);
        }
      }
    }
  }
  // The check means little for a move that never fired here.
  expect([...fired].sort()).toEqual([...MOVES.keys()].sort());
});
