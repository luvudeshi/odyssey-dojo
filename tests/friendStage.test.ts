// The friend on stage: fed from the guest's strikes on the host, from the host's hits on the guest, cleared on leaving.
import { beforeEach, expect, test } from "vitest";
import type { CombatEvent } from "../src/core/types";
import { clearFriend, feedFromGuest, feedFromHost, friendStage } from "../src/net/friendStage";

const hit = (move: string, together = false): CombatEvent => ({ type: "enemyHit", move, damage: 5, quality: 1, ...(together ? { together: true as const } : {}) });

beforeEach(clearFriend);

test("host side: only the guest's strikes (player 1) are the friend's", () => {
  feedFromGuest([{ move: "jab", quality: 1, player: 0 }], 3);
  expect(friendStage).toMatchObject({ here: true, struckMove: "", struckAt: -Infinity });
  feedFromGuest([{ move: "jab", quality: 1, player: 0 }, { move: "hook", quality: 1, player: 1 }], 4);
  expect(friendStage).toMatchObject({ here: true, struckMove: "hook", struckAt: 4 });
});

test("guest side: a hit that is not the guest's own is the host's", () => {
  feedFromHost([hit("hook")], "jab", 1, 2);
  expect(friendStage).toMatchObject({ here: true, struckMove: "hook", struckAt: 2 });
});

test("guest side: the guest's own recent hit is not the friend's, unless both struck together", () => {
  feedFromHost([hit("jab")], "jab", 1.5, 2);
  expect(friendStage.struckMove).toBe("");
  feedFromHost([hit("jab", true)], "jab", 1.5, 2.1);
  expect(friendStage.struckMove).toBe("jab");
  feedFromHost([hit("cross")], "cross", 0, 5);
  expect(friendStage.struckMove).toBe("cross");
});

test("clearing takes the friend off the stage", () => {
  feedFromGuest([{ move: "hook", quality: 1, player: 1 }], 4);
  clearFriend();
  expect(friendStage).toMatchObject({ here: false, struckMove: "", struckAt: -Infinity });
});
