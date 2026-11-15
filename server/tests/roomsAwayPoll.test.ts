// A polling host whose guest has been away for AWAY_MS: the poll answer that carries "the guest left" must also say
// the guest is not here. The page reads both (src/net/transport.ts takes the answer's `peer` as where the other
// member stands now), so an answer with the message and `peer: true` made the host hear "left" and then "here".
import { expect, test } from "vitest";
import { AWAY_MS, createRoomStore } from "../lib/rooms";
import type { PollResult } from "../lib/rooms";

test("a guest swept after AWAY_MS is off its seat before the host's held poll is answered, so the answer says peer: false", () => {
  let now = 1_000;
  const store = createRoomStore(() => now);
  const room = store.create();
  const joined = room === null ? "unknown" : store.join(room.code);
  if (room === null || typeof joined === "string") throw new Error("no room");

  // The guest polls once, is let go without an answer (its page is gone), and is never heard from again.
  const last = store.poll(room.code, joined.token, 0, () => undefined);
  if (typeof last === "string") throw new Error(last);
  last.stop(false);

  const answers: PollResult[] = [];
  const ask = (after: number): void => {
    const started = store.poll(room.code, room.token, after, (result) => { answers.push(result); });
    if (typeof started === "string") throw new Error(started);
  };
  // The host's first poll brings "the guest is here"; its next one is held.
  ask(0);
  expect(answers).toEqual([{ seq: 1, messages: [{ seq: 1, message: { type: "peer", joined: true } }], peer: true }]);
  ask(1);
  expect(answers.length).toBe(1);

  now += AWAY_MS;
  store.sweep();
  expect(answers[1]).toEqual({ seq: 2, messages: [{ seq: 2, message: { type: "peer", joined: false } }], peer: false });
  // The seat is free, as before.
  expect(typeof store.join(room.code)).toBe("object");
});
