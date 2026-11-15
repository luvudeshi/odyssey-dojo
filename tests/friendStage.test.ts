// The friend on stage: fed from the guest's strikes on the host, from the host's hits on the guest, cleared on leaving.
import { beforeEach, expect, test } from "vitest";
import { startFight, step } from "../src/combat/engine";
import type { CombatEvent, CombatInput, CombatState, EnemySpec, FightingStyle } from "../src/core/types";
import { createDuoLink } from "../src/duo/duoLink";
import { MOVES } from "../src/moves/registry";
import { createHostLink, forTwo } from "../src/net/host";
import type { RoomTransport } from "../src/net/transport";

import { clearFriend, feedFromGuest, feedFromHost, friendStage } from "../src/net/friendStage";

const hit = (move: string, extra: { byHost?: true } = {}): CombatEvent => ({ type: "enemyHit", move, damage: 5, quality: 1, ...extra });

beforeEach(clearFriend);

test("host side: only the guest's strikes (player 1) are the friend's", () => {
  feedFromGuest([{ move: "jab", quality: 1, player: 0 }], 3);
  expect(friendStage).toMatchObject({ here: true, struckMove: "", struckAt: -Infinity });
  feedFromGuest([{ move: "jab", quality: 1, player: 0 }, { move: "hook", quality: 1, player: 1 }], 4);
  expect(friendStage).toMatchObject({ here: true, struckMove: "hook", struckAt: 4 });
});

test("guest side: only hits the host's own strike landed (byHost) swing the friend", () => {
  feedFromHost([hit("jab")], 2);
  expect(friendStage).toMatchObject({ here: true, struckMove: "" });
  feedFromHost([hit("jab", { byHost: true })], 2.1);
  expect(friendStage).toMatchObject({ struckMove: "jab", struckAt: 2.1 });
});

test("a repeated move is not blamed on the host: the guest's own hit never carries byHost", () => {
  const enemy: EnemySpec = {
    id: "d", name: "D", title: "", order: 0, hp: 200, strikeWindowMs: 1000,
    attacks: [{ id: "a", name: "A", telegraphMs: 1000, damage: 5, counter: "block" }],
    weakSpots: [{ id: "h", label: "h", position: [0, 0, 0], moves: ["jab"] }],
    taunts: [],
    phases: [{ name: "one", belowHp: 1, attackIds: ["a"], telegraphScale: 1 }],
    finisher: "stake",
  };
  const style: FightingStyle = { id: "s", name: "S", blurb: "", strikes: ["jab"] };
  const none: CombatInput = { held: new Set(), struck: [] };
  const struck = (player: 0 | 1): CombatInput => ({ held: new Set(), struck: [{ move: "jab", quality: 1, player }] });
  let state: CombatState = { ...forTwo(startFight(enemy, 7)), phase: { kind: "recover", msLeft: 1 } };
  state = step(state, enemy, style, none, 10).state;
  state = step(state, enemy, style, { held: new Set(["block"]), struck: [] }, 1000).state;
  expect(state.phase.kind).toBe("strike");
  const hitBy = (player: 0 | 1) => step(state, enemy, style, struck(player), 10).events.find((e) => e.type === "enemyHit");
  expect(hitBy(1)).toBeDefined();
  expect(hitBy(1)).not.toHaveProperty("byHost");
  expect(hitBy(0)).toHaveProperty("byHost", true);
});

test("only a room host link says it is a room: duo and FaceTime links never feed the friend", () => {
  const transport: RoomTransport = { send: () => Promise.resolve(true), onMessage: () => undefined, close: () => undefined };
  expect(createHostLink(transport, true).room).toBe(true);
  expect(createHostLink(transport).room).toBeUndefined();
  expect(createDuoLink({ second: () => null, players: () => 1 }, MOVES).room).toBeUndefined();
});

test("clearing takes the friend off the stage", () => {
  feedFromGuest([{ move: "hook", quality: 1, player: 1 }], 4);
  clearFriend();
  expect(friendStage).toMatchObject({ here: false, struckMove: "", struckAt: -Infinity });
});
