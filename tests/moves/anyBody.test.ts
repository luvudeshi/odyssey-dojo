// Every move's made-up sequence replayed on other bodies: child-sized to tall, far to near, left and right of
// the frame (issue #129). Each replay goes through the real pose input, so "fires" means what the game means.
//
// What each change means (tests/helpers/anyBody.ts):
// - body size scales the picture about the body centre AND the 3D points: a child has shorter limbs in metres;
// - distance scales the picture only: 3D points are metres from the hips, whatever the distance;
// - a shift moves the picture sideways;
// and all of them apply from the first frame, the standing frames that set the baseline included.
//
// "No other move may fire" uses the allowance the existing tests already make: several gestures set off a
// second move by design (tests/godMoves.test.ts lists them under `also`, tests/moves/detectors.test.ts under
// KNOWN_CONFUSIONS). So the rule here is: nothing may fire on another body that does not also fire on the
// fixture's own body. No overlap is added to that list and none is forbidden that was accepted before.
import { describe, expect, test } from "vitest";
import type { PoseFrame } from "../../src/core/types";
import { KICK_IDS, legsVisible } from "../../src/moves/legSignals";
import { MOVES } from "../../src/moves/registry";
import type { Body } from "../helpers/anyBody";
import {
  CALIBRATION_FRAMES, body, fired, frameOn, recordingOn, recordingTurned, shouldersAt,
} from "../helpers/anyBody";
import type { Arm, Key, Leg } from "../helpers/poses";
import {
  ACROSS, CHOP, COCKED, DOWN, GUARD, HIP, HOOK_IN, HOOK_OUT, LATERAL, LEG_CHAMBER, LEG_DOWN, LEG_KICK, LEG_KNEE,
  OVERHEAD, PALM, PUNCH, STAKE_CHEST, STAKE_DOWN, pose, sequence, withLegs,
} from "../helpers/poses";
import { GOD_GOOD } from "../godMoveSequences";

const both = (arm: Arm) => pose(arm, arm);
const left = (arm: Arm) => pose(arm, DOWN);
const right = (arm: Arm) => pose(DOWN, arm);
const keys = (...pairs: [number, ReturnType<typeof pose>][]): Key[] => pairs.map(([t, p]) => ({ t, pose: p }));
const leg = (shape: Leg = LEG_DOWN) => withLegs(pose(DOWN), LEG_DOWN, shape);

/** Each move done right: the same sequences as tests/moves/detectors.test.ts, which does not export its table. */
const GOOD: Record<string, Key[]> = {
  jab: keys([0, pose(DOWN)], [150, left(COCKED)], [300, left(PUNCH)]),
  cross: keys([0, pose(DOWN)], [150, right(COCKED)], [300, right(PUNCH)]),
  hook: keys([0, left(HOOK_OUT)], [100, left(HOOK_OUT)], [250, left(HOOK_IN)]),
  uppercut: keys([0, pose(DOWN)], [250, right(GUARD)]),
  rising_palm: keys([0, pose(DOWN)], [250, left(GUARD)]),
  hammer_fist: keys([0, pose(DOWN)], [300, left(OVERHEAD)], [500, left(CHOP)]),
  overhead_strike: keys([0, pose(DOWN)], [300, right(OVERHEAD)], [500, right(CHOP)]),
  knife_hand: keys([0, pose(DOWN)], [200, right(ACROSS)], [450, right(LATERAL)]),
  reverse_punch: keys([0, pose(DOWN)], [150, pose(HIP, COCKED)], [300, pose(HIP, PUNCH)]),
  spear_thrust: keys([0, pose(DOWN)], [150, both(COCKED)], [300, both(PUNCH)]),
  double_palm: keys([0, pose(DOWN)], [150, both(COCKED)], [300, both(PALM)]),
  chain_punch: keys(
    [0, pose(DOWN)], [100, left(COCKED)], [250, left(PUNCH)], [350, right(COCKED)], [500, right(PUNCH)],
  ),
  stake_thrust: keys([0, pose(DOWN)], [300, both(STAKE_CHEST)], [500, both(STAKE_DOWN)]),
  front_kick: keys([0, leg()], [100, leg()], [300, leg(LEG_CHAMBER)], [450, leg(LEG_KICK)]),
  knee: keys([0, leg()], [100, leg()], [300, leg(LEG_KNEE)], [500, leg(LEG_KNEE)]),
  block: keys([0, pose(DOWN)], [250, both(GUARD)], [450, both(GUARD)]),
  duck: keys([0, pose(DOWN)], [300, pose(DOWN, DOWN, 0, 0.12)], [500, pose(DOWN, DOWN, 0, 0.12)]),
  dodge_left: keys([0, pose(DOWN)], [300, pose(DOWN, DOWN, -0.12, 0)], [500, pose(DOWN, DOWN, -0.12, 0)]),
  dodge_right: keys([0, pose(DOWN)], [300, pose(DOWN, DOWN, 0.12, 0)], [500, pose(DOWN, DOWN, 0.12, 0)]),
  ...GOD_GOOD,
};

const SAME = body("the fixture's own body", {});
const BODIES: readonly Body[] = [
  body("0.6x body size", { size: 0.6 }),
  body("0.8x body size", { size: 0.8 }),
  body("1.2x body size", { size: 1.2 }),
  body("1.4x body size", { size: 1.4 }),
  body("30% left of frame", { shift: -0.3 }),
  body("30% right of frame", { shift: 0.3 }),
  body("far: shoulders 12% of frame width", { zoom: shouldersAt(0.12) }),
  body("near: shoulders 35% of frame width", { zoom: shouldersAt(0.35) }),
  // Size and distance together: a tall adult who stands back to fit, and a child who comes up close.
  body("1.4x body size, far (shoulders 12%)", { size: 1.4, zoom: shouldersAt(0.12) / 1.4 }),
  body("0.6x body size, near (shoulders 35%)", { size: 0.6, zoom: shouldersAt(0.35) / 0.6 }),
];

/** The fixture's feet stand at 95% of the frame height, so a body drawn much bigger has them out of the picture. */
const feetInPicture = (who: Body, frames: readonly PoseFrame[]): boolean => {
  // The last frame: the standing frames before a kick sequence are drawn without legs.
  const last = frames.at(-1);
  return last !== undefined && legsVisible(frameOn(who, last));
};

test("covers the whole registry", () => {
  expect(Object.keys(GOOD).sort()).toEqual([...MOVES.keys()].sort());
});

describe.each(Object.keys(GOOD))("%s", (id) => {
  const frames = sequence(GOOD[id] ?? []);
  const usual = fired(recordingOn(SAME, frames));

  test("fires on the fixture's own body", () => {
    expect(usual).toContain(id);
  });

  for (const who of BODIES) {
    // A kick is only asked for with the legs in view (styleForLegs in src/moves/legSignals.ts).
    if (KICK_IDS.includes(id) && !feetInPicture(who, frames)) {
      test(`${who.name}: the feet are out of the picture, so nothing fires`, () => {
        expect(fired(recordingOn(who, frames))).toEqual([]);
      });
      continue;
    }
    test(`${who.name}: fires, and nothing else that does not fire on the fixture's own body`, () => {
      const seen = fired(recordingOn(who, frames));
      expect(seen).toContain(id);
      expect(seen.filter((other) => !usual.includes(other))).toEqual([]);
    });
  }
});

// The one limit left: a kick needs both knees and both ankles inside the picture. That is the camera's view,
// not a threshold, so it is pinned here instead of fixed. The fixture stands with its feet at 95% of the frame
// height, so they leave the picture once the body is drawn 1.11 times bigger: shoulders 17.8% of the frame
// width. Every kick case above with the feet in view fires: 0.6x, 0.8x, both shifts, far, and 1.4x standing back.
describe.each(KICK_IDS)("%s needs the feet in the picture", (id) => {
  const frames = sequence(GOOD[id] ?? []);
  test("fires at 1.1x, with the feet just inside", () => {
    expect(fired(recordingOn(body("1.1x", { size: 1.1 }), frames))).toEqual([id]);
  });
  test("is quiet at 1.12x, with the feet just outside", () => {
    expect(fired(recordingOn(body("1.12x", { size: 1.12 }), frames))).toEqual([]);
  });
  test("is quiet for a 1.4x body at the fixture's distance, and fires once it stands back", () => {
    expect(fired(recordingOn(body("1.4x", { size: 1.4 }), frames))).toEqual([]);
    expect(fired(recordingOn(body("1.4x, back", { size: 1.4, zoom: 1 / 1.4 }), frames))).toEqual([id]);
  });
});

// A player turned 30 degrees about the vertical axis, each way (issue #158). The camera model is in
// `turnedFrame` (tests/helpers/anyBody.ts): 3D points rotate rigidly, and the picture is foreshortened about the
// body's centre line using each point's 3D depth. Two cases: turned for the move after calibrating face on (the
// case the baseline's 3D ruler is for), and turned from the first frame, calibration included.
const TURN = 30;
const DEGREES = String(TURN);
const WAYS = [
  { way: "left", sign: 1 },
  { way: "right", sign: -1 },
] as const;
const WHEN = [
  { when: "for the move, after calibrating face on", from: CALIBRATION_FRAMES },
  { when: "from the first frame", from: 0 },
] as const;

interface TurnLimit {
  /** Which way the turn goes wrong: 1 is the player's left (right shoulder toward the camera). */
  readonly signs: readonly number[];
  /** Left out when it goes wrong whenever the turn starts; else the one `from` it goes wrong for. */
  readonly from?: number;
  /** The biggest whole number of degrees that still reads as it does face on. */
  readonly good: number;
  /** What the game reads one degree past `good` and at 30 degrees. */
  readonly then: readonly string[];
}

// Moves that do not read the same turned 30 degrees. None is the 3D ruler: each is a rule on where a wrist or the
// shoulders sit in the PICTURE, and a turn moves a hand held out in front sideways in the picture.
const TURN_LIMITS: Record<string, TurnLimit> = {
  // Jab and cross had a limit here: a fist punched at where the player faces lands off to its own side in the
  // picture (0.69 shoulder widths out face on, 1.41 at 30 degrees), and past 1.2 it read as flung. Since the
  // lenient-strikes PR a punch may land up to PUNCH_WIDE (1.6) out, so both read at 30 degrees either way.
  // The fixture's chopping hand ends half a metre in front in 3D, so a left turn carries it back toward the body in
  // the picture: 1.81 widths out face on, 1.203 at 26 degrees, 1.176 at 27. The knife hand needs more than 1.2.
  // Past that the arm reads as a straight punch alone (cross, and jab since both read on either hand); before the
  // lenient-strikes PR it read as an uppercut too.
  knife_hand: { signs: [1], good: 26, then: ["cross", "jab"] },
  // The sun burst itself fires at every angle. Its hands-together start has the right wrist 0.125 widths on its own
  // side of the centre line face on; a left turn carries it across (0.105 at 3 degrees, 0.099 at 4), and under 0.1
  // is the knife hand's chamber, so the right arm flung wide then reads as a knife hand as well. (Until #191 the
  // spear thrust fired here too, as it did face on: both arms flung wide no longer count as a thrust.)
  sun_burst: { signs: [1], good: 3, then: ["knife_hand", "sun_burst"] },
  // Calibrating side-on makes the baseline's PICTURE shoulder width narrower (0.16 of the frame face on, 0.154 at
  // 16 degrees, 0.139 at 30), so the fixture's dodge step counts for more shoulder widths and reaches the swift
  // dash's 0.7 as well: 0.674 face on, 0.698 at 15 degrees, 0.701 at 16, 0.778 at 30. The dodge still holds.
  dodge_left: { signs: [1, -1], from: 0, good: 15, then: ["dodge_left", "swift_dash"] },
  dodge_right: { signs: [1, -1], from: 0, good: 15, then: ["dodge_right", "swift_dash"] },
};

describe.each(Object.keys(GOOD))("%s, turned", (id) => {
  const frames = sequence(GOOD[id] ?? []);
  const usual = fired(frames);
  const limit = TURN_LIMITS[id];
  const sameAsFaceOn = (seen: readonly string[]): void => {
    expect(seen).toContain(id);
    expect(seen.filter((other) => !usual.includes(other))).toEqual([]);
  };

  for (const { way, sign } of WAYS) {
    for (const { when, from } of WHEN) {
      const turned = (degrees: number): string[] => fired(recordingTurned(frames, sign * degrees, from));
      if (limit && limit.signs.includes(sign) && (limit.from ?? from) === from) {
        test(`${String(limit.good)} degrees ${way} ${when}: fires, and nothing else that does not fire face on`, () => {
          sameAsFaceOn(turned(limit.good));
        });
        test(`${String(limit.good + 1)} and ${DEGREES} degrees ${way} ${when}: the measured limit`, () => {
          expect(turned(limit.good + 1)).toEqual(limit.then);
          expect(turned(TURN)).toEqual(limit.then);
        });
        continue;
      }
      test(`${DEGREES} degrees ${way} ${when}: fires, and nothing else that does not fire face on`, () => {
        sameAsFaceOn(turned(TURN));
      });
    }
  }
});
