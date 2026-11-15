// Two players on one camera: who is in which seat, when the second player counts, and what happens when one leaves.
// All frames are made up: no camera.
import { expect, test } from "vitest";
import type { Landmark } from "../src/core/types";
import { BEHIND, HOME_MS, JOIN_MS, LEAVE_MS, MIN_SHOULDERS, PROMOTE_MS, STOPPED_MS, createSeating } from "../src/duo/assign";
import type { Seats } from "../src/duo/assign";
import { DRAWN_MS, createDuoCamera } from "../src/duo/duoCamera";
import { homeOf } from "../src/duo/split";
import type { Body } from "../src/duo/split";
import { JOINT } from "../src/pose/signals";

const FRAME_MS = 33;

/** A made-up body: only the torso matters. `width` is the shoulder width, so a bigger body is nearer the camera. */
function body(x: number, y = 0.5, width = 0.12, visibility = 1): Body {
  const points: Landmark[] = Array.from({ length: 33 }, () => ({ x, y, z: 0, visibility }));
  const put = (index: number, px: number, py: number): void => {
    points[index] = { x: px, y: py, z: 0, visibility };
  };
  put(JOINT.leftShoulder, x - width / 2, y - 0.15);
  put(JOINT.rightShoulder, x + width / 2, y - 0.15);
  put(JOINT.leftHip, x - width / 3, y + 0.15);
  put(JOINT.rightHip, x + width / 3, y + 0.15);
  return { image: points, world: points };
}

/** Where a seat's body is in the picture, or null for an empty seat. */
const at = (frame: Seats["first"]): number | null => (frame ? Number(homeOf(frame.image).x.toFixed(3)) : null);

/** Feeds frames 33 ms apart, starting at `start`. Returns what came out of each and the time after the last. */
function run(seating: ReturnType<typeof createSeating>, frames: readonly (readonly Body[])[], start = 0): { out: Seats[]; t: number } {
  const out = frames.map((bodies, i) => seating.next(bodies, start + i * FRAME_MS));
  return { out, t: start + frames.length * FRAME_MS };
}

const times = <T,>(count: number, make: (i: number) => T): T[] => Array.from({ length: count }, (_, i) => make(i));
const JOINED = Math.ceil(JOIN_MS / FRAME_MS) + 2;

test("someone alone is player one, and the fight has one player", () => {
  const seating = createSeating();
  const { out } = run(seating, times(40, () => [body(0.7)]));
  expect(out.every((seats) => at(seats.first) === 0.7 && seats.second === null && seats.players === 1)).toBe(true);
});

test("a pair: the left of the picture is player one, and the second player joins after standing steady", () => {
  const seating = createSeating();
  const { out } = run(seating, times(JOINED, (i) => (i % 2 === 0 ? [body(0.3), body(0.7)] : [body(0.7), body(0.3)])));
  out.forEach((seats, i) => {
    expect([at(seats.first), at(seats.second)], `frame ${String(i)}`).toEqual([0.3, 0.7]);
    expect(seats.players, `frame ${String(i)}`).toBe(i * FRAME_MS >= JOIN_MS ? 2 : 1);
  });
});

test("someone who only walks through the picture never joins", () => {
  const seating = createSeating();
  const passing = times(12, (i) => [body(0.3), body(0.6 + i * 0.03)]);
  const { out } = run(seating, [...passing, ...times(40, () => [body(0.3)])]);
  expect(out.every((seats) => seats.players === 1 && at(seats.first) === 0.3)).toBe(true);
});

test("two players walking past each other keep their seats", () => {
  const seating = createSeating();
  const settle = times(JOINED, () => [body(0.3, 0.56, 0.14), body(0.7, 0.42, 0.1)]);
  // The near player walks right and the far one walks left, 0.02 of the picture per frame, with the order flipping.
  const cross = times(21, (i) => {
    const pair = [body(0.3 + i * 0.02, 0.56, 0.14), body(0.7 - i * 0.02, 0.42, 0.1)];
    return i % 2 === 0 ? pair : pair.reverse();
  });
  const start = run(seating, settle);
  const { out } = run(seating, cross, start.t);
  out.forEach((seats, i) => {
    expect(at(seats.first), `frame ${String(i)}`).toBeCloseTo(0.3 + i * 0.02, 3);
    expect(at(seats.second), `frame ${String(i)}`).toBeCloseTo(0.7 - i * 0.02, 3);
    expect(seats.players).toBe(2);
  });
});

test("a player lost for a few frames comes back as themself, and the fight stays at two players", () => {
  const seating = createSeating();
  const both = [body(0.3), body(0.7)];
  const start = run(seating, times(JOINED, () => both));
  // Player two is not found for 5 frames (165 ms), then player one for 5 frames.
  const gap = run(seating, [...times(5, () => [body(0.3)]), ...times(3, () => both), ...times(5, () => [body(0.7)])], start.t);
  gap.out.forEach((seats, i) => {
    expect(seats.players, `frame ${String(i)}`).toBe(2);
    expect(at(seats.first), `frame ${String(i)}`).toBe(i >= 8 ? null : 0.3);
    expect(at(seats.second), `frame ${String(i)}`).toBe(i < 5 ? null : 0.7);
  });
  const back = run(seating, times(5, () => [body(0.7), body(0.3)]), gap.t);
  expect(back.out.every((seats) => at(seats.first) === 0.3 && at(seats.second) === 0.7 && seats.players === 2)).toBe(true);
});

test("player two leaving drops the fight back to one player, and player one is never without a frame", () => {
  const seating = createSeating();
  const start = run(seating, times(JOINED, () => [body(0.3), body(0.7)]));
  const { out, t } = run(seating, times(40, () => [body(0.3)]), start.t);
  out.forEach((seats, i) => {
    expect(at(seats.first)).toBe(0.3);
    expect(seats.players, `frame ${String(i)}`).toBe((i + 1) * FRAME_MS >= LEAVE_MS ? 1 : 2);
  });
  expect(seating.players(t)).toBe(1);
});

test("player one leaving: the player who stayed becomes player one, drawn where the hero stood", () => {
  const seating = createSeating();
  const start = run(seating, times(JOINED, () => [body(0.3, 0.5, 0.12), body(0.7, 0.54, 0.16)]));
  const { out } = run(seating, times(40, () => [body(0.7, 0.54, 0.16)]), start.t);
  out.forEach((seats, i) => {
    const promoted = (i + 1) * FRAME_MS >= PROMOTE_MS;
    if (!promoted) {
      expect(seats.first, `frame ${String(i)}`).toBeNull();
      expect(at(seats.second)).toBe(0.7);
      return;
    }
    // Moved and sized to the first player's place, so the stance measured for the hero still fits.
    const home = homeOf(seats.first?.image ?? []);
    expect([home.x, home.y, home.w].map((n) => Number(n.toFixed(3))), `frame ${String(i)}`).toEqual([0.3, 0.35, 0.12]);
    // The camera panel draws them where they really stand.
    expect(at(seats.firstSeen)).toBe(0.7);
    expect(seats.second).toBeNull();
    expect(seats.players).toBe(1);
  });
  // The one who left comes back: they are player two now, and join again after standing steady.
  const back = run(seating, times(JOINED, () => [body(0.25), body(0.7, 0.54, 0.16)]), start.t + 40 * FRAME_MS);
  expect(at(back.out.at(-1)?.second ?? null)).toBe(0.25);
  expect(back.out.at(-1)?.players).toBe(2);
  expect(back.out[0]?.players).toBe(1);
});

test("a take-over draws the one who stayed where the hero stood to fight, not where either first came into the picture", () => {
  const seating = createSeating();
  const place = (frame: Seats["first"]): number[] => {
    const home = homeOf(frame?.image ?? []);
    return [home.x, home.y, home.w].map((n) => Number(n.toFixed(3)));
  };
  // The one who pressed the button is at the computer, close and large, then steps back to where they will fight.
  const atComputer = run(seating, times(20, () => [body(0.5, 0.6, 0.3)]));
  const stepBack = run(seating, times(10, (i) => [body(0.5 - (i + 1) * 0.02, 0.6 - (i + 1) * 0.01, 0.3 - (i + 1) * 0.018)]), atComputer.t);
  // The friend walks in from the right edge and stops beside them.
  const walkIn = run(seating, times(20, (i) => [body(0.3, 0.5, 0.12), body(0.95 - (i + 1) * 0.0125, 0.54, 0.16)]), stepBack.t);
  const stand = run(seating, times(Math.ceil(HOME_MS / FRAME_MS) + 5, () => [body(0.3, 0.5, 0.12), body(0.7, 0.54, 0.16)]), walkIn.t);
  expect(stand.out.at(-1)?.players).toBe(2);
  // Player two dodges for half a second, and in the middle of it the hero walks out of the picture.
  const dodge = run(seating, times(8, (i) => [body(0.3 - i * 0.03, 0.5, 0.12), body(0.78, 0.54, 0.16)]), stand.t);
  const alone = run(seating, [...times(8, () => [body(0.78, 0.54, 0.16)]), ...times(30, () => [body(0.7, 0.54, 0.16)])], dodge.t);
  // Standing again, the one who stayed is drawn exactly where the hero stood: their own stance fits the hero's.
  expect(place(alone.out.at(-1)?.first ?? null)).toEqual([0.3, 0.35, 0.12]);
  expect(at(alone.out.at(-1)?.firstSeen ?? null)).toBe(0.7);
  expect(alone.out.at(-1)?.players).toBe(1);
});

test("after a take-over, once everyone has been gone long enough to be forgotten, the next player is read where they stand", () => {
  const seating = createSeating();
  const start = run(seating, times(JOINED, () => [body(0.3, 0.5, 0.12), body(0.7, 0.54, 0.16)]));
  const alone = run(seating, times(40, () => [body(0.7, 0.54, 0.16)]), start.t);
  expect(at(alone.out.at(-1)?.first ?? null)).toBe(0.3);
  // Nobody in the picture for a second: longer than a player is remembered.
  const empty = run(seating, times(Math.ceil(1000 / FRAME_MS), () => []), alone.t);
  // Someone stands where the first hero stood. Before the fix they were read far to the left of where they are.
  const back = run(seating, times(10, () => [body(0.3, 0.5, 0.12)]), empty.t);
  expect(at(back.out.at(-1)?.first ?? null)).toBe(0.3);
  expect(at(back.out.at(-1)?.firstSeen ?? null)).toBe(0.3);
  // A short loss of the promoted player keeps the shift: they come back as the hero, drawn where the hero stood.
  const again = createSeating();
  const s2 = run(again, times(JOINED, () => [body(0.3, 0.5, 0.12), body(0.7, 0.54, 0.16)]));
  const a2 = run(again, times(40, () => [body(0.7, 0.54, 0.16)]), s2.t);
  const blink = run(again, times(5, () => []), a2.t);
  const b2 = run(again, times(5, () => [body(0.7, 0.54, 0.16)]), blink.t);
  expect(at(b2.out.at(-1)?.first ?? null)).toBe(0.3);
  expect(at(b2.out.at(-1)?.firstSeen ?? null)).toBe(0.7);
});

test("a body in the background, a body with hidden shoulders and one person found twice are not players", () => {
  const seating = createSeating();
  const small = body(0.7, 0.5, MIN_SHOULDERS - 0.01);
  const hidden = body(0.7, 0.5, 0.12, 0.3);
  const twin = body(0.32, 0.51, 0.11);
  for (const extra of [small, hidden, twin]) {
    seating.reset();
    const { out } = run(seating, times(JOINED, () => [body(0.3), extra]));
    expect(out.every((seats) => at(seats.first) === 0.3 && seats.second === null && seats.players === 1)).toBe(true);
  }
});

test("someone standing well behind the player never joins; a friend a little further back does", () => {
  const seating = createSeating();
  // The player's shoulders are 20% of the picture; the one watching from behind, 7%.
  const { out, t } = run(seating, times(3 * JOINED, () => [body(0.3, 0.5, 0.2), body(0.7, 0.4, 0.07)]));
  expect(out.every((seats) => at(seats.first) === 0.3 && seats.players === 1)).toBe(true);
  expect(seating.players(t)).toBe(1);
  // The player turns the body in a punch and the shoulders are narrow for a moment: the one behind is still not in.
  const turned = run(seating, [...times(8, () => [body(0.3, 0.5, 0.08), body(0.7, 0.4, 0.07)]), ...times(JOINED, () => [body(0.3, 0.5, 0.2), body(0.7, 0.4, 0.07)])], t);
  expect(turned.out.every((seats) => seats.players === 1)).toBe(true);
  // A friend standing a step further back than the player joins as before.
  seating.reset();
  const friend = run(seating, times(JOINED, () => [body(0.3, 0.5, 0.2), body(0.7, 0.45, 0.2 * BEHIND + 0.01)]));
  expect(friend.out.at(-1)?.players).toBe(2);
});

test("a second player who walks in turned sideways joins once they face the camera, and stays in when they turn", () => {
  const seating = createSeating();
  // Narrow shoulders for longer than the join takes: not in yet.
  const sideways = run(seating, times(JOINED, () => [body(0.3, 0.5, 0.14), body(0.7, 0.5, 0.065)]));
  expect(sideways.out.every((seats) => seats.players === 1)).toBe(true);
  const facing = run(seating, times(3, () => [body(0.3, 0.5, 0.14), body(0.7, 0.5, 0.13)]), sideways.t);
  expect(facing.out.map((seats) => seats.players)).toEqual([2, 2, 2]);
  // In the fight their shoulders go narrow in a punch, and the hero leans in close: nobody is put out.
  const punch = run(seating, times(20, () => [body(0.3, 0.5, 0.22), body(0.7, 0.5, 0.065)]), facing.t);
  expect(punch.out.every((seats) => seats.players === 2)).toBe(true);
});

test("the hero stepping back from the computer lets the friend behind them in", () => {
  const seating = createSeating();
  // The one who pressed the button is still at the computer (shoulders 30% of the picture); the friend waits at 12%.
  const close = run(seating, times(JOINED, () => [body(0.3, 0.5, 0.3), body(0.7, 0.5, 0.12)]));
  expect(close.out.at(-1)?.players).toBe(1);
  // They step back beside the friend: within two seconds both are playing.
  const back = run(seating, times(60, () => [body(0.3, 0.5, 0.13), body(0.7, 0.5, 0.12)]), close.t);
  expect(back.out.at(-1)?.players).toBe(2);
});

test("with three people the two nearest the camera play", () => {
  const seating = createSeating();
  const { out } = run(seating, times(JOINED, () => [body(0.5, 0.4, 0.08), body(0.25, 0.5, 0.14), body(0.75, 0.5, 0.13)]));
  expect([at(out.at(-1)?.first ?? null), at(out.at(-1)?.second ?? null), out.at(-1)?.players]).toEqual([0.25, 0.75, 2]);
});

test("when frames stop coming the count falls back to one player by the clock", () => {
  const seating = createSeating();
  const { t } = run(seating, times(JOINED, () => [body(0.3), body(0.7)]));
  expect(seating.players(t)).toBe(2);
  expect(seating.players(t + STOPPED_MS + 1)).toBe(1);
});

test("a hitch in the pictures is not player two leaving: the count stays at two through it and after it", () => {
  const seating = createSeating();
  const pair = (): Body[] => [body(0.3), body(0.7)];
  const { t } = run(seating, times(JOINED, pair));
  // No picture for longer than it takes a player to count as gone (seen in the smoke run on a busy laptop: 683 ms).
  const hitch = LEAVE_MS + 150;
  for (let ms = 0; ms <= hitch; ms += 50) expect(seating.players(t + ms), `${String(ms)} ms in`).toBe(2);
  const after = run(seating, times(10, pair), t + hitch);
  expect(after.out.every((seats) => seats.players === 2)).toBe(true);
  expect(seating.players(after.t)).toBe(2);
  // Pictures that keep coming without player two still count them out after LEAVE_MS.
  const alone = run(seating, times(Math.ceil(LEAVE_MS / FRAME_MS) + 2, () => [body(0.3)]), after.t);
  expect(alone.out.at(-1)?.players).toBe(1);
  expect(seating.players(alone.t)).toBe(1);
});

test("the camera store: off looks for one body, on looks for two and keeps player two's frame", () => {
  const camera = createDuoCamera();
  expect([camera.on(), camera.wanted(), camera.players(0), camera.second(0)]).toEqual([false, 1, 1, null]);
  camera.setOn(true);
  expect(camera.wanted()).toBe(2);
  let t = 0;
  for (let i = 0; i < JOINED; i++) {
    t = i * FRAME_MS;
    expect(at(camera.take([body(0.7), body(0.3)], t))).toBe(0.3);
  }
  expect(at(camera.second(t))).toBe(0.7);
  expect(camera.players(t)).toBe(2);
  // Player two's frame is not handed out once it is old.
  expect(camera.second(t + LEAVE_MS + 1)).toBeNull();
  camera.setOn(false);
  expect([camera.wanted(), camera.players(t), camera.second(t)]).toEqual([1, 1, null]);
});

test("the camera store: player two's body is given out to draw as soon as it is seen, and not once it is stale", () => {
  const camera = createDuoCamera();
  // Off: there is no second body to draw, whatever the tracker hands over.
  camera.take([body(0.3), body(0.7)], 0);
  expect(camera.secondSeen(0)).toBeNull();
  camera.setOn(true);
  camera.take([body(0.3), body(0.7)], 1000);
  // Seen in one picture: not a player yet, but already drawn, so the second person can tell the camera has them.
  expect([camera.players(1000), at(camera.secondSeen(1000))]).toEqual([1, 0.7]);
  expect(at(camera.secondSeen(1000 + DRAWN_MS))).toBe(0.7);
  // A body that is gone leaves no skeleton standing, though the fight still waits a moment for it.
  expect(camera.secondSeen(1000 + DRAWN_MS + 1)).toBeNull();
  expect(at(camera.second(1000 + DRAWN_MS + 1))).toBe(0.7);
  camera.setOn(false);
  expect(camera.secondSeen(1000)).toBeNull();
});

test("the camera store: after player two takes over, the frame to draw over the picture is where they really stand", () => {
  const camera = createDuoCamera();
  camera.setOn(true);
  let t = 0;
  const feed = (count: number, bodies: () => Body[]) => {
    let last: Seats["first"] = null;
    for (let i = 0; i < count; i += 1) { t += FRAME_MS; last = camera.take(bodies(), t); }
    return last;
  };
  const both = feed(JOINED, () => [body(0.3, 0.5, 0.12), body(0.7, 0.54, 0.16)]);
  // Before anyone leaves the drawn frame is the fight's own frame.
  expect(both && camera.seen(both)).toBe(both);
  const promoted = feed(Math.ceil(PROMOTE_MS / FRAME_MS) + 5, () => [body(0.7, 0.54, 0.16)]);
  expect(at(promoted)).toBe(0.3);
  expect(promoted && at(camera.seen(promoted))).toBe(0.7);
  // An older frame, or one from somewhere else, is drawn as it is.
  expect(both && camera.seen(both)).toBe(both);
  // Off: nothing is changed.
  camera.setOn(false);
  expect(promoted && camera.seen(promoted)).toBe(promoted);
});
