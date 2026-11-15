// The FaceTime call's pure parts: phone numbers, the bridge's ready sign, and the call's state machine with its two clocks.
import { describe, expect, test } from "vitest";
import { bridgeReady } from "../src/facetime/bridge";
import {
  CALL_CAP_MS, FAILURE_MESSAGES, GOODBYE_AT_MS, GREET_DEADLINE_MS, IDLE, PLATE_LINGER_MS, RING_TIMEOUT_MS, callMsLeft, callStep, clock, describe as say, greetMsLeft, isLive, isOpen,
  partingLine,
} from "../src/facetime/callMachine";
import type { CallEffect, CallEvent, CallState } from "../src/facetime/callMachine";
import { E164, PHONE_MESSAGES, maskPhone, normalizePhone, showPhone } from "../src/facetime/phone";

function play(events: readonly CallEvent[], from: CallState = IDLE): { state: CallState; effects: CallEffect[] } {
  let state = from;
  const effects: CallEffect[] = [];
  for (const event of events) {
    const step = callStep(state, event);
    state = step.state;
    effects.push(...step.effects);
  }
  return { state, effects };
}

const answered: readonly CallEvent[] = [
  { type: "dial", now: 0 }, { type: "placed", now: 500 }, { type: "bridge_ready", now: 8000 },
];

describe("phone numbers", () => {
  test.each([
    ["+15555550100", "+15555550100"],
    ["+1 (555) 555-0100", "+15555550100"],
    ["555-555-0100", "+15555550100"],
    ["(555) 555 0100", "+15555550100"],
    ["1 555 555 0100", "+15555550100"],
    ["  +1.555.555.0100 ", "+15555550100"],
    ["0044 20 7946 0958", "+442079460958"],
    ["+44 20 7946 0958", "+442079460958"],
  ])("%s becomes %s", (typed, wanted) => {
    const result = normalizePhone(typed);
    expect(result).toEqual({ ok: true, e164: wanted });
    expect(E164.test(wanted)).toBe(true);
  });

  test.each([
    ["", PHONE_MESSAGES.empty],
    ["   ", PHONE_MESSAGES.empty],
    ["call me", PHONE_MESSAGES.letters],
    ["+1555555010x", PHONE_MESSAGES.letters],
    ["+1+5555550100", PHONE_MESSAGES.letters],
    ["555-0100", PHONE_MESSAGES.short],
    ["+1234567", PHONE_MESSAGES.short],
    ["20 7946 0958 22", PHONE_MESSAGES.short],
    ["+1234567890123456", PHONE_MESSAGES.long],
    ["+0155555501", PHONE_MESSAGES.zero],
  ])("%s is refused in plain words", (typed, why) => {
    expect(normalizePhone(typed)).toEqual({ ok: false, why });
  });

  test("a number is shown in groups and masked for the screen", () => {
    expect(showPhone("+15555550100")).toBe("+1 555 555 0100");
    expect(showPhone("+442079460958")).toBe("+442079460958");
    expect(maskPhone("+15555550100")).toBe("+1********00");
    expect(maskPhone("+15555550100")).not.toContain("555");
  });
});

describe("the bridge's ready sign", () => {
  test.each([
    "chert_bridge_ready", " chert_bridge_ready\n", '"chert_bridge_ready"', '{"chert_bridge_ready":true}', '{"chert_bridge_ready":1}',
    '{"chert_bridge_ready":"true","call_id":"c1"}', '{"state":"chert_bridge_ready"}', '{"status":"chert_bridge_ready"}', '{"event":"chert_bridge_ready"}',
    "chert_bridge_ready=1", "state: chert_bridge_ready",
  ])("%s means ready", (metadata) => {
    expect(bridgeReady(metadata)).toBe(true);
  });

  test.each([
    null, undefined, "", "  ", "{}", '{"chert_bridge_ready":false}', '{"chert_bridge_ready":0}', '{"state":"connecting"}', "chert_bridge_ready=false",
    "chert_bridge_ready: 0", "ringing", "[]", "42", '{"note":"waiting for chert_bridge_ready"}',
  ])("%s does not", (metadata) => {
    expect(bridgeReady(metadata)).toBe(false);
  });
});

describe("the call's state machine", () => {
  test("a call goes dialing, ringing, ready, greeted, playing, and asks for the greeting once", () => {
    expect(play([{ type: "dial", now: 0 }]).state.phase).toBe("dialing");
    expect(play([{ type: "dial", now: 0 }, { type: "placed", now: 500 }]).state.phase).toBe("ringing");
    const ready = play(answered);
    expect(ready.state.phase).toBe("bridge_ready");
    expect(ready.state.readyAt).toBe(8000);
    expect(ready.effects).toEqual(["greet"]);
    const greeted = play([{ type: "greeted", now: 8300 }], ready.state);
    expect(greeted.state.phase).toBe("greeted");
    expect(greeted.state.greetedAt).toBe(8300);
    const playing = play([{ type: "fight_started", now: 20_000 }], greeted.state);
    expect(playing.state.phase).toBe("playing");
    expect(isLive(playing.state)).toBe(true);
    // A second ready sign does not greet twice or restart the clock.
    const again = play([{ type: "bridge_ready", now: 30_000 }], playing.state);
    expect(again.effects).toEqual([]);
    expect(again.state.readyAt).toBe(8000);
  });

  test("the bridge can be ready before the dial's answer is back", () => {
    const early = play([{ type: "dial", now: 0 }, { type: "bridge_ready", now: 900 }, { type: "placed", now: 1000 }]);
    expect(early.state.phase).toBe("bridge_ready");
    expect(early.effects).toEqual(["greet"]);
  });

  test("joining the room is not the ready sign: nothing is greeted while it rings", () => {
    const ringing = play([{ type: "dial", now: 0 }, { type: "placed", now: 500 }, { type: "tick", now: 5000 }, { type: "greeted", now: 5100 }]);
    expect(ringing.state.phase).toBe("ringing");
    expect(ringing.effects).toEqual([]);
    expect(greetMsLeft(ringing.state, 5000)).toBeNull();
  });

  test("the greeting has ten seconds from the ready sign", () => {
    const ready = play(answered).state;
    expect(greetMsLeft(ready, 8000)).toBe(GREET_DEADLINE_MS);
    expect(greetMsLeft(ready, 14_000)).toBe(4000);
    expect(play([{ type: "tick", now: 8000 + GREET_DEADLINE_MS - 1 }], ready).state.phase).toBe("bridge_ready");
    const late = play([{ type: "tick", now: 8000 + GREET_DEADLINE_MS }], ready);
    expect(late.state.phase).toBe("failed");
    expect(late.state.failure).toBe("greet_late");
    expect(late.effects).toEqual(["hang_up"]);
    // Greeted in time: the deadline is gone.
    const greeted = play([{ type: "greeted", now: 9000 }, { type: "tick", now: 8000 + GREET_DEADLINE_MS + 5 }], ready);
    expect(greeted.state.phase).toBe("greeted");
    expect(greetMsLeft(greeted.state, 9500)).toBeNull();
  });

  test("goodbye is said once at 4:45 and the call ends at five minutes", () => {
    const playing = play([...answered, { type: "greeted", now: 8300 }, { type: "fight_started", now: 9000 }]).state;
    const before = play([{ type: "tick", now: 8000 + GOODBYE_AT_MS - 1 }], playing);
    expect(before.effects).toEqual([]);
    const bye = play([{ type: "tick", now: 8000 + GOODBYE_AT_MS }, { type: "tick", now: 8000 + GOODBYE_AT_MS + 250 }], playing);
    expect(bye.effects).toEqual(["goodbye"]);
    expect(bye.state.phase).toBe("playing");
    const end = play([{ type: "tick", now: 8000 + CALL_CAP_MS }], bye.state);
    expect(end.state.phase).toBe("ended");
    expect(end.state.ending).toBe("time");
    expect(end.effects).toEqual(["hang_up"]);
    expect(say(end.state, 0)).toContain("five minutes");
    // The goodbye leaves 15 seconds for the words.
    expect(CALL_CAP_MS - GOODBYE_AT_MS).toBe(15_000);
  });

  test("the countdown runs from the ready sign and never goes below zero", () => {
    const ready = play(answered).state;
    expect(callMsLeft(IDLE, 0)).toBeNull();
    expect(callMsLeft(ready, 8000)).toBe(CALL_CAP_MS);
    expect(callMsLeft(ready, 8000 + 53_000)).toBe(CALL_CAP_MS - 53_000);
    expect(callMsLeft(ready, 8000 + CALL_CAP_MS + 9000)).toBe(0);
    expect(clock(CALL_CAP_MS)).toBe("5:00");
    expect(clock(247_000)).toBe("4:07");
    expect(clock(15_000)).toBe("0:15");
    expect(clock(900)).toBe("0:01");
    expect(clock(0)).toBe("0:00");
    expect(clock(-5)).toBe("0:00");
    expect(say(play([{ type: "greeted", now: 8300 }, { type: "fight_started", now: 8400 }], ready).state, 8000 + 53_000)).toBe("On the call. 4:07 left.");
  });

  test("hanging up, the friend leaving, and nobody answering", () => {
    const playing = play([...answered, { type: "greeted", now: 8300 }]).state;
    const host = play([{ type: "hang_up", now: 9000 }], playing);
    expect(host.state).toMatchObject({ phase: "ended", ending: "host" });
    expect(host.effects).toEqual(["hang_up"]);
    const friend = play([{ type: "remote_ended", now: 9000 }], playing);
    expect(friend.state).toMatchObject({ phase: "ended", ending: "friend" });
    expect(say(friend.state, 0)).toBe("Your friend hung up.");
    const declined = play([{ type: "dial", now: 0 }, { type: "placed", now: 500 }, { type: "remote_ended", now: 9000 }]);
    expect(declined.state).toMatchObject({ phase: "failed", failure: "no_answer" });
    const unanswered = play([{ type: "dial", now: 0 }, { type: "placed", now: 500 }, { type: "tick", now: RING_TIMEOUT_MS }]);
    expect(unanswered.state).toMatchObject({ phase: "failed", failure: "no_answer" });
    expect(unanswered.effects).toEqual(["hang_up"]);
    // Nothing happens to a call that is over.
    expect(play([{ type: "hang_up", now: 1 }, { type: "tick", now: 2 }, { type: "bridge_ready", now: 3 }, { type: "fail", now: 4, why: "network" }], host.state)).toEqual({ state: host.state, effects: [] });
  });

  test("a call that ends or fails during a fight leaves the host a line on the plate for six seconds", () => {
    const playing = play([...answered, { type: "greeted", now: 8300 }, { type: "fight_started", now: 8400 }]).state;
    expect(PLATE_LINGER_MS).toBe(6000);
    expect(partingLine(true, play([{ type: "remote_ended", now: 9000 }], playing).state, 9000)).toBe("Your friend hung up.");
    expect(partingLine(true, play([{ type: "hang_up", now: 9000 }], playing).state, 9000)).toBe("The call has ended.");
    expect(partingLine(true, play([{ type: "tick", now: 8000 + CALL_CAP_MS }], playing).state, 0)).toBe("The five minutes are up. The call has ended.");
    expect(partingLine(true, play([{ type: "fail", now: 9000, why: "room_lost" }], playing).state, 9000)).toBe(FAILURE_MESSAGES.room_lost);
    // Not in a fight: the card is on screen and says it. And nothing is said while the call is still on.
    expect(partingLine(false, play([{ type: "remote_ended", now: 9000 }], playing).state, 9000)).toBeNull();
    expect(partingLine(true, playing, 9000)).toBeNull();
    expect(partingLine(true, IDLE, 9000)).toBeNull();
  });

  test("a failure says why in plain words and a new dial starts clean", () => {
    const busy = play([{ type: "dial", now: 0 }, { type: "fail", now: 700, why: "line_busy" }]);
    expect(busy.state).toMatchObject({ phase: "failed", failure: "line_busy" });
    expect(isOpen(busy.state)).toBe(false);
    expect(say(busy.state, 0)).toBe(FAILURE_MESSAGES.line_busy);
    expect(FAILURE_MESSAGES.not_set_up).toBe("FaceTime is not set up on this server.");
    for (const message of Object.values(FAILURE_MESSAGES)) expect(message).toMatch(/^[A-Z].*\.$/);
    const again = play([{ type: "dial", now: 5000 }], busy.state);
    expect(again.state).toEqual({ ...IDLE, phase: "dialing", dialedAt: 5000 });
    // A dial during a call is ignored.
    expect(play([{ type: "dial", now: 6000 }], again.state).state.dialedAt).toBe(5000);
    expect(play([{ type: "reset" }], busy.state).state).toEqual(IDLE);
  });
});
