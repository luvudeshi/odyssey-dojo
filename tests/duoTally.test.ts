// Two players on one camera: each player's hits and points. The two numbers always add up to the fight's score.
import { expect, test } from "vitest";
import type { CombatEvent, Strike } from "../src/core/types";
import { NO_TALLY, createTallyStore, secondPart, tallyAfter, tallyLine } from "../src/duo/tally";
import type { DuoTally } from "../src/duo/tally";

const hit = (move: string, damage: number, together = false): CombatEvent => ({ type: "enemyHit", move, damage, quality: 0.7, ...(together ? { together: true as const } : {}) });
const by = (move: string, ...players: (0 | 1)[]): Strike[] => players.map((player) => ({ move, quality: 0.7, player }));
const defended: CombatEvent = { type: "defended", attack: { id: "swing", name: "Swing", telegraphMs: 900, damage: 10, counter: "duck" } };
const shape = (tally: DuoTally): number[] => [tally.players[0].hits, tally.players[0].points, tally.players[1].hits, tally.players[1].points, tally.together];

test("a strike's hit and points go to the player who threw it", () => {
  const first = tallyAfter(NO_TALLY, { events: [hit("jab", 15)], gained: 150, struck: by("jab", 0), bothDefend: false });
  expect(shape(first)).toEqual([1, 150, 0, 0, 0]);
  const second = tallyAfter(first, { events: [hit("cross", 18)], gained: 180, struck: by("cross", 1), bothDefend: false });
  expect(shape(second)).toEqual([1, 150, 1, 180, 0]);
});

test("a hit the two landed together counts for both, and each gets half its points", () => {
  const tally = tallyAfter(NO_TALLY, { events: [hit("jab", 36, true)], gained: 360, struck: by("jab", 0, 1), bothDefend: false });
  expect(shape(tally)).toEqual([1, 180, 1, 180, 1]);
  // An odd number is not lost: the two still add up to it.
  const odd = tallyAfter(NO_TALLY, { events: [hit("jab", 3, true)], gained: 31, struck: by("jab", 0, 1), bothDefend: false });
  expect(odd.players[0].points + odd.players[1].points).toBe(31);
});

test("a strike of another move in the same frame earns nothing: only the one that landed counts", () => {
  const tally = tallyAfter(NO_TALLY, { events: [hit("jab", 15)], gained: 150, struck: [...by("jab", 1), ...by("hook", 0)], bothDefend: false });
  expect(shape(tally)).toEqual([0, 0, 1, 150, 0]);
});

test("with player two not in the fight every hit is player one's", () => {
  // The link was not asked for the input on this frame (FightScreen plays alone while the guest is away).
  const alone = tallyAfter(NO_TALLY, { events: [hit("jab", 15)], gained: 150, struck: null, bothDefend: false });
  expect(shape(alone)).toEqual([1, 150, 0, 0, 0]);
});

test("a defend both had to make is shared; a defend player one made alone is theirs; the god's power with nobody's gesture in the frame is player one's", () => {
  const both = tallyAfter(NO_TALLY, { events: [defended], gained: 50, struck: [], bothDefend: true });
  expect(shape(both)).toEqual([0, 25, 0, 25, 0]);
  const alone = tallyAfter(both, { events: [defended], gained: 50, struck: null, bothDefend: false });
  expect(shape(alone)).toEqual([0, 75, 0, 25, 0]);
  const power = tallyAfter(alone, { events: [{ type: "powerUnleashed", damage: 40 }], gained: 400, struck: [], bothDefend: true });
  expect(shape(power)).toEqual([0, 475, 0, 25, 0]);
});

test("a frame that scores nothing leaves the tally as it is", () => {
  const tally = tallyAfter(NO_TALLY, { events: [hit("jab", 15)], gained: 150, struck: by("jab", 1), bothDefend: false });
  expect(tallyAfter(tally, { events: [], gained: 0, struck: by("jab", 0), bothDefend: true })).toBe(tally);
  expect(tallyAfter(tally, { events: [{ type: "whiffed" }], gained: 0, struck: [], bothDefend: false })).toBe(tally);
});

test("the line both players read: numbers for each, and what the camera makes of player two before they score", () => {
  let tally = tallyAfter(NO_TALLY, { events: [hit("jab", 42)], gained: 420, struck: by("jab", 0), bothDefend: false });
  expect(tallyLine(tally, "out")).toBe("P1 1 hit 420 · P2 not seen: step apart");
  expect(tallyLine(tally, "joining")).toBe("P1 1 hit 420 · P2 joining");
  expect(tallyLine(tally, "in")).toBe("P1 1 hit 420 · P2 0 hits 0");
  tally = tallyAfter(tally, { events: [hit("jab", 31)], gained: 310, struck: by("jab", 1), bothDefend: false });
  tally = tallyAfter(tally, { events: [hit("jab", 31)], gained: 310, struck: by("jab", 1), bothDefend: false });
  expect(tallyLine(tally, "in")).toBe("P1 1 hit 420 · P2 2 hits 620");
  // Once player two has scored their numbers stay for the rest of the fight, also while they are not seen.
  expect(secondPart(tally, "out")).toBe("P2 2 hits 620, not seen");
  expect(secondPart(tally, "joining")).toBe("P2 2 hits 620, not seen");
});

test("the store tells its listeners of a change, and only of a change", () => {
  const store = createTallyStore();
  let calls = 0;
  const stop = store.subscribe(() => { calls += 1; });
  store.set(NO_TALLY);
  expect(calls).toBe(0);
  const next = tallyAfter(NO_TALLY, { events: [hit("jab", 15)], gained: 150, struck: by("jab", 1), bothDefend: false });
  store.set(next);
  expect([calls, store.get()]).toEqual([1, next]);
  stop();
  store.set(NO_TALLY);
  expect(calls).toBe(1);
});

test("the god's power goes to whoever made its gesture: player two alone, both for half each, player one alone", () => {
  const power: CombatEvent = { type: "powerUnleashed", damage: 36 };
  const second = tallyAfter(NO_TALLY, { events: [power], gained: 360, struck: by("swift_dash", 1), bothDefend: false });
  expect(shape(second)).toEqual([0, 0, 0, 360, 0]);
  const both = tallyAfter(NO_TALLY, { events: [power], gained: 360, struck: by("swift_dash", 0, 1), bothDefend: false });
  expect(shape(both)).toEqual([0, 180, 0, 180, 0]);
  const first = tallyAfter(NO_TALLY, { events: [power], gained: 360, struck: by("thunderbolt", 0), bothDefend: false });
  expect(shape(first)).toEqual([0, 360, 0, 0, 0]);
  // A plain strike of player two's on the frame the power lands does not make the power theirs.
  const other = tallyAfter(NO_TALLY, { events: [power], gained: 360, struck: [...by("thunderbolt", 0), ...by("jab", 1)], bothDefend: false });
  expect(shape(other)).toEqual([0, 360, 0, 0, 0]);
});
