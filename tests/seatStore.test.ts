// The guest's kept seat: read back after a join, forgotten on leave, and safe when storage is closed.
import { expect, test } from "vitest";
import { joinRoomAgain } from "../src/net/transport";
import type { NetDeps, SeatStore } from "../src/net/transport";
import { forgetSeat, keepCamera, keptRoom } from "../src/screens/seatStore";

function sessionLike(): SeatStore & { readonly kept: Map<string, string> } {
  const kept = new Map<string, string>();
  return { kept, getItem: (key) => kept.get(key) ?? null, setItem: (key, value) => { kept.set(key, value); }, removeItem: (key) => { kept.delete(key); } };
}

const answer = (status: number, data: unknown) => Promise.resolve({ ok: status === 200, status, json: () => Promise.resolve(data) });
const relay: NetDeps = {
  fetch: (url) => (url.endsWith("/KXTR/join") ? answer(200, { token: "guest-1" }) : answer(404, { error: "unknown_room" })),
  openStream: () => ({ onmessage: null, close: () => undefined }),
};

test("the seat joinRoomAgain keeps is the room read back, with how the guest joined", async () => {
  const store = sessionLike();
  expect(keptRoom(store)).toBeNull();
  expect(await joinRoomAgain(relay, "kxtr", store)).toEqual({ code: "KXTR", token: "guest-1" });
  expect(keptRoom(store)).toEqual({ code: "KXTR", camera: false });
  keepCamera(store, true);
  expect(keptRoom(store)).toEqual({ code: "KXTR", camera: true });
  keepCamera(store, false);
  expect(keptRoom(store)).toEqual({ code: "KXTR", camera: false });
});

test("leaving forgets the seat and the camera choice", async () => {
  const store = sessionLike();
  await joinRoomAgain(relay, "KXTR", store);
  keepCamera(store, true);
  forgetSeat(store);
  expect(store.kept.size).toBe(0);
  expect(keptRoom(store)).toBeNull();
});

test("bad or missing data, no storage and closed storage read as no seat", () => {
  const store = sessionLike();
  expect(keptRoom(null)).toBeNull();
  for (const raw of ["not json", "null", "[]", '{"code":7}', '{"code":"AB"}', '{"token":"x"}']) {
    store.kept.set("odyssey.room.seat", raw);
    expect(keptRoom(store)).toBeNull();
  }
  const closed: SeatStore = { getItem: () => { throw new Error("no storage"); }, setItem: () => { throw new Error("no storage"); }, removeItem: () => { throw new Error("no storage"); } };
  expect(keptRoom(closed)).toBeNull();
  expect(() => { keepCamera(closed, true); forgetSeat(closed); keepCamera(null, true); forgetSeat(null); }).not.toThrow();
});
