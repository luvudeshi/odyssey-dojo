// What a camera that sees the player from the waist up does to every move (issue #220). Each move's correct
// performance from tests/helpers/crossFire.ts is replayed three ways: as the suite has it, with the hips and
// everything below them unseen, and with those points also frozen where they were while standing. The four defends
// are replayed again at a seated framing. tests/moves/waistUp.test.ts asserts on the result and docs/waist-up.md
// holds the tables this file draws.
import type { Landmark, PoseFrame } from "../../src/core/types";
import { MOVES } from "../../src/moves/registry";
import { legsVisible } from "../../src/moves/legSignals";
import { JOINT, baselineOf, shoulderCenter, shoulderWidth } from "../../src/pose/signals";
import { replay } from "../../tools/recorder/replay";
import { CALIBRATION_FRAMES, FIXTURE_SHOULDERS } from "./anyBody";
import { DEFENDS, ORDER, PERFORMANCES } from "./crossFire";
import type { Key } from "./poses";
import { DOWN, pose, sequence } from "./poses";

/** MediaPipe's landmarks for the hips and everything below them: hips 23 and 24, knees, ankles, heels, toes. */
export const LOWER_FIRST = 23;
export const LOWER_LAST = 32;
/** The visibility the tracker gives a point it is guessing. Anything under 0.5 is treated as unseen everywhere. */
export const UNSEEN = 0.1;

const lower = (index: number): boolean => index >= LOWER_FIRST && index <= LOWER_LAST;

/** The frames with the hips and below unseen. The points stay where the performance drew them. */
export function unseenBelow(frames: readonly PoseFrame[]): PoseFrame[] {
  const hide = (list: readonly Landmark[]): Landmark[] =>
    list.map((point, index) => (lower(index) ? { ...point, visibility: UNSEEN } : point));
  return frames.map((frame) => ({ t: frame.t, image: hide(frame.image), world: hide(frame.world) }));
}

/** The same, with those points also held where they were on the first, standing frame: a guess that never moves. */
export function frozenBelow(frames: readonly PoseFrame[]): PoseFrame[] {
  const first = frames[0];
  if (!first) return [];
  const hold = (list: readonly Landmark[], stood: readonly Landmark[]): Landmark[] =>
    list.map((point, index) => (lower(index) ? { ...(stood[index] ?? point), visibility: UNSEEN } : point));
  return frames.map((frame) => ({ t: frame.t, image: hold(frame.image, first.image), world: hold(frame.world, first.world) }));
}

export interface Reading {
  /** True when the game read the move: a strike thrown, or a defend held, at 0.7 through the real pose input. */
  readonly counts: boolean;
  /** The highest confidence the move's own detector reached. */
  readonly peak: number;
}

/** What the game reads of move `id` over the frames, with the baseline from the standing frames as at calibration. */
export function read(id: string, frames: readonly PoseFrame[]): Reading {
  const baseline = baselineOf(frames.slice(0, CALIBRATION_FRAMES));
  const result = replay({ move: id, person: "made up", n: 1, baseline, frames }, MOVES);
  return { counts: result.strikes.includes(id) || result.held.includes(id), peak: result.peaks[id] ?? 0 };
}

/** The one condition this file can name for a move that stops counting: the kicks' own check that the legs are seen. */
export const LEGS_IN_VIEW =
  "legs in view: `legsVisible` in `src/moves/legSignals.ts` wants both knees and both ankles at visibility 0.5 or more, inside the picture";

export interface WaistUpRow {
  readonly move: string;
  readonly full: Reading;
  readonly unseen: Reading;
  readonly frozen: Reading;
  /** Why the move does not count waist-up, or null when it counts both ways. */
  readonly fails: string | null;
}

export function waistUpRow(id: string): WaistUpRow {
  const frames = sequence(PERFORMANCES[id] ?? []);
  const hidden = unseenBelow(frames);
  const held = frozenBelow(frames);
  const full = read(id, frames);
  const unseen = read(id, hidden);
  const frozen = read(id, held);
  const lostLegs = frames.some(legsVisible) && ![...hidden, ...held].some(legsVisible);
  const counted = unseen.counts && frozen.counts;
  return { move: id, full, unseen, frozen, fails: counted ? null : lostLegs ? LEGS_IN_VIEW : "not known" };
}

/** Every move in the registry, in the cross-fire table's order. */
export function waistUpTable(): WaistUpRow[] {
  return ORDER.map(waistUpRow);
}

const yes = (reading: Reading): string => `${reading.counts ? "yes" : "no"} (${reading.peak.toFixed(2)})`;

/** The table as Markdown. A cell is yes or no and, in brackets, the highest confidence the detector reached. */
export function waistUpMarkdown(rows: readonly WaistUpRow[]): string {
  const head = "| move | full body | waist up: hips and legs unseen | waist up: unseen and frozen | what fails |";
  const rule = "|---|---|---|---|---|";
  const lines = rows.map((row) => `| ${row.move} | ${yes(row.full)} | ${yes(row.unseen)} | ${yes(row.frozen)} | ${row.fails ?? "-"} |`);
  return [head, rule, ...lines].join("\n");
}

// The seated framing: a player at a table, close to the camera.

/** Shoulder width as a share of the picture width. */
export const SEATED_WIDTH = 0.6;
/**
 * Height of the shoulder line in the picture (0 is the top). About the highest that keeps the fixture's nose inside
 * the picture at this width: the nose sits 0.94 shoulder widths above the shoulders, so 0.56 of the picture.
 */
export const SEATED_SHOULDER_Y = 0.65;
/** The detectors hold a duck or a dodge from 0.7 confidence, which is 0.42 baseline shoulder widths of movement. */
export const SMALLEST_SHIFT = 0.42;
/** A little over the smallest, so the row does not sit on the threshold. */
export const JUST_ENOUGH = 0.45;
/** The suite's own duck and dodge move the shoulders 0.75 shoulder widths (0.12 of the picture at 0.16 wide). */
export const PERFORMED_SHIFT = 0.75;

/**
 * The presence limits PR #217 sets in src/pose/presence.ts, written out here so the table does not change with
 * the order the two PRs merge in: both shoulders seen, shoulders at most 0.7 of the picture wide, and the middle
 * of the shoulders between 0.25 and 0.75 across the picture.
 */
export const PRESENCE = { maxWidth: 0.7, centre: [0.25, 0.75] } as const;

/**
 * The frames as a close camera gives them: the picture scaled about the standing shoulder line so the shoulders
 * are SEATED_WIDTH wide and sit at SEATED_SHOULDER_Y, with the hips and below unseen. Points pushed outside the
 * picture are left there, as the tracker leaves them. The 3D body is metres from the hips and does not change.
 */
export function seated(frames: readonly PoseFrame[]): PoseFrame[] {
  const first = frames[0];
  if (!first) return [];
  const scale = SEATED_WIDTH / shoulderWidth(first);
  const stood = shoulderCenter(first);
  const closer = frames.map((frame) => ({
    ...frame,
    image: frame.image.map((point) => ({
      ...point,
      x: 0.5 + (point.x - stood.x) * scale,
      y: SEATED_SHOULDER_Y + (point.y - stood.y) * scale,
    })),
  }));
  return unseenBelow(closer);
}

/** A duck or dodge of `widths` shoulder widths, reached in 300 ms and held for 200 ms, like the suite's own. */
function shifted(id: string, widths: number): Key[] {
  const by = widths * FIXTURE_SHOULDERS;
  const dx = id === "dodge_left" ? -by : id === "dodge_right" ? by : 0;
  const dy = id === "duck" ? by : 0;
  const end = pose(DOWN, DOWN, dx, dy);
  return [{ t: 0, pose: pose(DOWN) }, { t: 300, pose: end }, { t: 500, pose: end }];
}

export interface SeatedRow {
  readonly move: string;
  /** How big the move was, in words. */
  readonly size: string;
  readonly reading: Reading;
  /** Where the middle of the shoulders is at the end of the move, as shares of the picture. */
  readonly ends: { readonly x: number; readonly y: number };
  /** What goes wrong at the end of the move, in the order found; empty when nothing does. */
  readonly trips: readonly string[];
}

const outside = (point: Landmark | undefined): boolean =>
  !point || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1;

export const TRIP_BOTTOM = "a shoulder is out of the bottom of the picture";
export const TRIP_SIDE = "a shoulder is out of the side of the picture";
export const TRIP_CENTRE = "presence: move into view (middle of the shoulders outside 0.25 to 0.75)";
export const TRIP_WIDTH = "presence: step back (shoulders wider than 0.7)";

/** What the last frame breaks: a shoulder outside the picture, or one of the presence limits above. */
function tripsAt(frame: PoseFrame): string[] {
  const found: string[] = [];
  const left = frame.image[JOINT.leftShoulder];
  const right = frame.image[JOINT.rightShoulder];
  const centre = shoulderCenter(frame);
  if (outside(left) || outside(right)) found.push(Math.max(left?.y ?? 0, right?.y ?? 0) > 1 ? TRIP_BOTTOM : TRIP_SIDE);
  if (centre.x < PRESENCE.centre[0] || centre.x > PRESENCE.centre[1]) found.push(TRIP_CENTRE);
  if (shoulderWidth(frame) > PRESENCE.maxWidth) found.push(TRIP_WIDTH);
  return found;
}

function seatedRow(id: string, size: string, keys: readonly Key[]): SeatedRow {
  const frames = seated(sequence(keys));
  const last = frames.at(-1);
  const centre = last ? shoulderCenter(last) : { x: 0, y: 0 };
  return { move: id, size, reading: read(id, frames), ends: centre, trips: last ? tripsAt(last) : [] };
}

export const SIZE_SMALL = `just enough to count (${String(JUST_ENOUGH)} widths)`;
export const SIZE_PERFORMED = `as performed (${String(PERFORMED_SHIFT)} widths)`;

/** The four defends at the seated framing: the block once, the duck and the dodges at two sizes. */
export function seatedTable(): SeatedRow[] {
  return DEFENDS.flatMap((id) => {
    if (id === "block") return [seatedRow(id, "as performed", PERFORMANCES[id] ?? [])];
    return [seatedRow(id, SIZE_SMALL, shifted(id, JUST_ENOUGH)), seatedRow(id, SIZE_PERFORMED, shifted(id, PERFORMED_SHIFT))];
  });
}

export function seatedMarkdown(rows: readonly SeatedRow[]): string {
  const head = "| defend | size of the move | counts | shoulders end at (across, down) | what it trips |";
  const rule = "|---|---|---|---|---|";
  const lines = rows.map((row) =>
    `| ${row.move} | ${row.size} | ${yes(row.reading)} | ${row.ends.x.toFixed(2)}, ${row.ends.y.toFixed(2)} | ${row.trips.length > 0 ? row.trips.join("; ") : "-"} |`,
  );
  return [head, rule, ...lines].join("\n");
}
