// Answering a FaceTime call with fake rooms and a fake server: the game waits in the room the server names, sends
// nothing until a caller is there, answers with one picture and one sound, and goes to the next room after the call.
import { describe, expect, test } from "vitest";
import type { PoseFrame, PoseHistory } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import {
  CHECK_EVERY_MS, DUPLICATE_IDENTITY, ENDED_SHOW_MS, LOOK_EVERY_MS, NOT_JOINED, NO_ROOM_SAID_AFTER_MS, NO_SERVER, QUICK_ASKS, QUICK_EVERY_MS, SAME_ROOM_AFTER_MS, SEAT_TAKEN,
  createAnswerer, createWaitingApi, isBridge,
} from "../src/facetime/answer";
import type { Waiting } from "../src/facetime/answer";
import type { FaceTimeApi } from "../src/facetime/api";
import { createFakeRoom } from "../src/facetime/fakeRoom";
import type { FakeRoom } from "../src/facetime/fakeRoom";
import type { RoomEvent } from "../src/facetime/room";
import { ANSWER_FALLBACK_MS, BRIDGE_FALLBACK_MS, createFaceTimeSession } from "../src/facetime/session";
import type { SessionDeps } from "../src/facetime/session";
import { MOVES } from "../src/moves/registry";
import { rating } from "../src/pose/quality";

const track = (name: string): MediaStreamTrack => ({ id: name }) as unknown as MediaStreamTrack;
const settle = async (): Promise<void> => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const URL = "wss://rooms.example.test";
const AGENT = "agent-AJ_madeup";
const CALLER = "chert-bridge-call-1";
const READY = '{"chert_call":"call-1","chert_bridge_ready":true,"at":"2026-11-15T09:00:00.000Z"}';
const inRoom = (room: string, more: Partial<Extract<Waiting, { room: string }>> = {}): Waiting => ({ room, url: URL, token: `token-for-${room}`, caller: null, ready: false, line: null, ...more });
const none = (reason = "No call can come in yet."): Waiting => ({ room: null, reason, line: null });

interface Rig {
  /** Every room that was opened, in order. */
  readonly rooms: FakeRoom[];
  /** What the session did, in order: publish, greet, watch and so on. */
  readonly log: string[];
  /** Rooms the server was asked to close. Answering must never ask. */
  readonly hungUp: string[];
  /** How often the server was asked for the waiting room. */
  asked: number;
  /** What the server says next, and from then on. */
  says: Waiting;
  /** Who is in the next room already when the game joins it. */
  present: RoomEvent[];
  failJoin: boolean;
  primed: number;
  readonly session: ReturnType<typeof createFaceTimeSession>;
  readonly answerer: ReturnType<typeof createAnswerer>;
  last(): FakeRoom;
}

function rig(first: Waiting = inRoom("chert-warm-AAAA")): Rig {
  const rooms: FakeRoom[] = [];
  const log: string[] = [];
  const hungUp: string[] = [];
  const openRoom = (): Promise<FakeRoom> => {
    const room = createFakeRoom(self.failJoin ? { failConnect: true } : {});
    const connect = room.connect.bind(room);
    const publish = room.publish.bind(room);
    const present = self.present;
    self.present = [];
    const wrapped: FakeRoom = Object.assign(room, {
      connect: async (url: string, token: string) => {
        await connect(url, token);
        present.forEach((event) => { room.emit(event); });
      },
      publish: async (video: MediaStreamTrack, audio: MediaStreamTrack | null) => {
        log.push("publish");
        await publish(video, audio);
      },
    });
    rooms.push(wrapped);
    return Promise.resolve(wrapped);
  };
  const never = (name: string) => (): never => { throw new Error(`${name} must not be asked when a call is answered`); };
  const deps: SessionDeps = {
    api: {
      status: () => Promise.resolve({ ready: false, missing: [], standIn: true }),
      seat: never("seat"),
      call: never("call"),
      callState: never("callState"),
      standIn: never("standIn"),
      hangUp: (room) => { hungUp.push(room); return Promise.resolve(true); },
    } satisfies FaceTimeApi,
    openRoom,
    startPicture: () => { log.push("picture"); return { track: track("picture"), draw: () => undefined, stop: () => { log.push("picture.stop"); } }; },
    startSound: () => {
      log.push("sound");
      return {
        track: track("sound"),
        greet: () => { log.push("greet"); return Promise.resolve(); },
        goodbye: () => { log.push("goodbye"); return Promise.resolve(); },
        hear: (heard) => { log.push(heard ? "hear" : "hear.off"); },
        stop: () => { log.push("sound.stop"); },
      };
    },
    watchFriend: () => {
      log.push("watch");
      return Promise.resolve({ read: () => ({ t: 0, image: [], world: [] }) satisfies PoseFrame, stop: () => { log.push("watch.stop"); } });
    },
    poseReader: () => () => ({ held: new Set<string>(), struck: [] }),
    pushFrame: (history: PoseHistory) => history,
    moves: MOVES,
    enemies: ENEMIES,
    rate: rating,
  };
  const session = createFaceTimeSession(deps);
  const self: Rig = {
    rooms, log, hungUp, asked: 0, says: first, present: [{ type: "joined", identity: AGENT }], failJoin: false, primed: 0, session,
    answerer: createAnswerer({
      waiting: () => { self.asked += 1; return Promise.resolve(self.says); },
      openRoom,
      session,
      prime: () => { self.primed += 1; },
    }),
    last: () => {
      const room = rooms.at(-1);
      if (!room) throw new Error("no room was opened");
      return room;
    },
  };
  return self;
}

/** Presses "Wait for a FaceTime call" and lets the game get into the waiting room. */
async function waiting(made: Rig = rig()): Promise<Rig> {
  made.answerer.start(1000);
  made.answerer.tick(1000);
  await settle();
  return made;
}

/** A caller comes into the waiting room, their camera arrives and FaceTime says it is up. */
async function onCall(made: Rig, now: number, caller = CALLER): Promise<void> {
  made.answerer.tick(now);
  made.last().emit({ type: "joined", identity: caller });
  await settle();
  made.last().emit({ type: "video", track: track("friend-camera"), identity: caller });
  made.last().emit({ type: "metadata", metadata: READY });
  await settle();
}

describe("who the friend is", () => {
  test("the FaceTime call's participant, or the stand-in for it, and nobody else", () => {
    expect(isBridge("chert-bridge-call-1")).toBe(true);
    expect(isBridge("chert-bridge-0b9c2f6e-7a41-4d6e-9f0e-1c2d3e4f5a6b")).toBe(true);
    expect(isBridge("facetime-bridge")).toBe(true);
    for (const other of ["chert-bridge-", "agent-AJ_madeup", "odyssey-dojo", "x-chert-bridge-1", "CHERT-BRIDGE-1", "facetime-bridge-2", ""]) expect(isBridge(other), other).toBe(false);
  });
});

describe("waiting for a call", () => {
  test("the game joins the room the server names with the token for it, and sends nothing", async () => {
    const made = await waiting();
    expect(made.primed).toBe(1);
    expect(made.asked).toBe(1);
    expect(made.rooms).toHaveLength(1);
    expect(made.last().joined).toEqual({ url: URL, token: "token-for-chert-warm-AAAA" });
    expect(made.last().calls).toEqual(["connect"]);
    expect(made.last().published).toEqual({ video: null, audio: null });
    expect(made.answerer.state()).toEqual({ phase: "waiting", room: "chert-warm-AAAA", reason: "", line: null });
    // The call has not begun: the session is idle, so no clock runs and nothing can time out, however long the wait.
    expect(made.session.state().phase).toBe("idle");
    expect(made.log).toEqual([]);
  });

  test("with no caller nothing is ever greeted: not after hours, not on a ready sign, not when the agent shows a picture", async () => {
    const made = await waiting();
    made.last().emit({ type: "metadata", metadata: READY });
    made.last().emit({ type: "video", track: track("not-a-caller"), identity: AGENT });
    made.last().emit({ type: "audio", track: track("not-a-caller"), identity: AGENT });
    for (let now = 2000; now < 3 * 3600_000; now += 60_000) {
      made.answerer.tick(now);
      made.session.tick(now);
      await settle();
    }
    expect(made.log).toEqual([]);
    expect(made.last().published).toEqual({ video: null, audio: null });
    expect(made.rooms).toHaveLength(1);
    expect(made.answerer.state().phase).toBe("waiting");
  });

  test("with no room yet it asks again every two seconds, says why once that has lasted, and joins when one is there", async () => {
    const WHY = "No call can come in yet. Check that chert dev is running.";
    const made = await waiting(rig(none(WHY)));
    // Not said at once: between two waiting rooms there is none for a few seconds.
    expect(made.answerer.state()).toEqual({ phase: "looking", room: null, reason: "", line: null });
    expect(made.rooms).toHaveLength(0);
    made.answerer.tick(1000 + LOOK_EVERY_MS - 1);
    await settle();
    expect(made.asked).toBe(1);
    for (let now = 1000 + LOOK_EVERY_MS; now < 1000 + NO_ROOM_SAID_AFTER_MS; now += LOOK_EVERY_MS) {
      made.answerer.tick(now);
      await settle();
      expect(made.answerer.state().reason).toBe("");
    }
    made.answerer.tick(1000 + NO_ROOM_SAID_AFTER_MS);
    await settle();
    expect(made.answerer.state()).toMatchObject({ phase: "looking", room: null, reason: WHY });
    const asked = made.asked;
    made.says = inRoom("chert-warm-BBBB", { line: "+1 555 555 0100" });
    made.answerer.tick(1000 + NO_ROOM_SAID_AFTER_MS + LOOK_EVERY_MS);
    await settle();
    expect(made.asked).toBe(asked + 1);
    expect(made.answerer.state()).toEqual({ phase: "waiting", room: "chert-warm-BBBB", reason: "", line: "+1 555 555 0100" });
  });

  test("a server that does not answer is said at once", async () => {
    const made = await waiting(rig({ room: undefined, reason: NO_SERVER, line: null }));
    expect(made.answerer.state()).toMatchObject({ phase: "looking", reason: NO_SERVER });
  });

  test("a server that cannot tell changes nothing: the game stays in the room it has", async () => {
    const made = await waiting();
    made.says = { room: undefined, reason: NO_SERVER, line: null };
    made.answerer.tick(1000 + CHECK_EVERY_MS);
    await settle();
    expect(made.asked).toBe(2);
    expect(made.answerer.state()).toMatchObject({ phase: "waiting", room: "chert-warm-AAAA" });
    expect(made.last().calls).toEqual(["connect"]);
  });

  test("the waiting room is replaced every few minutes: when it closes the game asks at once and joins the next", async () => {
    const made = await waiting();
    made.says = inRoom("chert-warm-CCCC");
    made.rooms[0]?.emit({ type: "disconnected", reason: "ROOM_DELETED" });
    expect(made.answerer.state()).toMatchObject({ phase: "looking", room: null });
    made.answerer.tick(1500);
    await settle();
    expect(made.rooms).toHaveLength(2);
    expect(made.last().joined?.token).toBe("token-for-chert-warm-CCCC");
    expect(made.answerer.state()).toMatchObject({ phase: "waiting", room: "chert-warm-CCCC" });
    expect(made.hungUp).toEqual([]);
  });

  test("the next room can be a moment late: it is asked for quickly a few times, and nothing alarming is said meanwhile", async () => {
    const made = await waiting();
    made.says = none("No call can come in yet.");
    made.rooms[0]?.emit({ type: "disconnected", reason: "5" });
    const before = made.asked;
    for (let i = 0; i < QUICK_ASKS; i++) {
      made.answerer.tick(1500 + i * QUICK_EVERY_MS);
      await settle();
      expect(made.asked).toBe(before + i + 1);
      expect(made.answerer.state()).toMatchObject({ phase: "looking", reason: "" });
    }
    made.says = inRoom("chert-warm-CCCC");
    made.answerer.tick(1500 + QUICK_ASKS * QUICK_EVERY_MS);
    await settle();
    expect(made.answerer.state()).toMatchObject({ phase: "waiting", room: "chert-warm-CCCC", reason: "" });
  });

  test("when the server names another room, twice, the game moves to it, and leaves the old one without closing it", async () => {
    const made = await waiting();
    made.says = inRoom("chert-warm-DDDD");
    made.answerer.tick(1000 + CHECK_EVERY_MS - 1);
    await settle();
    expect(made.asked).toBe(1);
    // Said once, it is not acted on: leaving a waiting room closes it, and one answer can be a moment out of date.
    made.answerer.tick(1000 + CHECK_EVERY_MS);
    await settle();
    expect(made.rooms[0]?.calls).toEqual(["connect"]);
    expect(made.answerer.state()).toMatchObject({ phase: "waiting", room: "chert-warm-AAAA" });
    made.answerer.tick(1000 + CHECK_EVERY_MS + LOOK_EVERY_MS);
    await settle();
    expect(made.rooms[0]?.calls).toEqual(["connect", "disconnect"]);
    expect(made.last().joined?.token).toBe("token-for-chert-warm-DDDD");
    expect(made.answerer.state()).toMatchObject({ phase: "waiting", room: "chert-warm-DDDD" });
    expect(made.hungUp).toEqual([]);
  });

  test("one answer that names another room, then the same room again, moves nothing", async () => {
    const made = await waiting();
    made.says = none();
    made.answerer.tick(1000 + CHECK_EVERY_MS);
    await settle();
    made.says = inRoom("chert-warm-AAAA");
    made.answerer.tick(1000 + CHECK_EVERY_MS + LOOK_EVERY_MS);
    await settle();
    made.says = inRoom("chert-warm-EEEE");
    made.answerer.tick(1000 + 2 * CHECK_EVERY_MS + LOOK_EVERY_MS);
    await settle();
    expect(made.rooms).toHaveLength(1);
    expect(made.last().calls).toEqual(["connect"]);
    expect(made.answerer.state()).toMatchObject({ phase: "waiting", room: "chert-warm-AAAA" });
  });

  test("when the server says twice that there is no room any more, the game leaves", async () => {
    const made = await waiting();
    made.says = none("No call can come in yet.");
    made.answerer.tick(1000 + CHECK_EVERY_MS);
    await settle();
    expect(made.rooms[0]?.calls).toEqual(["connect"]);
    made.answerer.tick(1000 + CHECK_EVERY_MS + LOOK_EVERY_MS);
    await settle();
    expect(made.rooms[0]?.calls).toEqual(["connect", "disconnect"]);
    expect(made.answerer.state()).toMatchObject({ phase: "looking", room: null });
    expect(made.hungUp).toEqual([]);
  });

  test("a second window of the game takes the seat: this one stops and says so, and does not fight for it", async () => {
    const made = await waiting();
    made.last().emit({ type: "disconnected", reason: DUPLICATE_IDENTITY });
    expect(made.answerer.state()).toEqual({ phase: "off", room: null, reason: SEAT_TAKEN, line: null });
    for (let now = 2000; now < 60_000; now += 1000) {
      made.answerer.tick(now);
      await settle();
    }
    expect(made.asked).toBe(1);
    expect(made.rooms).toHaveLength(1);
    // Pressing the button again waits again.
    made.answerer.start(61_000);
    made.answerer.tick(61_000);
    await settle();
    expect(made.answerer.state()).toMatchObject({ phase: "waiting", reason: "" });
  });

  test("a room that cannot be joined is said plainly and tried again", async () => {
    const made = rig();
    made.failJoin = true;
    await waiting(made);
    expect(made.answerer.state()).toMatchObject({ phase: "looking", reason: NOT_JOINED });
    made.failJoin = false;
    made.answerer.tick(1000 + LOOK_EVERY_MS);
    await settle();
    expect(made.answerer.state()).toMatchObject({ phase: "waiting", room: "chert-warm-AAAA" });
    expect(made.rooms).toHaveLength(2);
  });

  test("one question and one join at a time, however often the clock ticks", async () => {
    const made = rig();
    made.answerer.start(0);
    for (let now = 0; now < 50; now++) made.answerer.tick(now);
    await settle();
    expect(made.asked).toBe(1);
    expect(made.rooms).toHaveLength(1);
  });

  test("stop leaves the waiting room, never closes it, and a second start waits again", async () => {
    const made = await waiting();
    made.answerer.stop(5000);
    expect(made.answerer.state().phase).toBe("off");
    expect(made.last().calls).toEqual(["connect", "disconnect"]);
    expect(made.hungUp).toEqual([]);
    made.answerer.tick(60_000);
    await settle();
    expect(made.asked).toBe(1);
    made.answerer.start(61_000);
    made.answerer.tick(61_000);
    await settle();
    expect(made.rooms).toHaveLength(2);
    expect(made.answerer.state().phase).toBe("waiting");
  });
});

describe("answering", () => {
  test("when the caller comes in, one picture and one sound go out, once, and the ready sign greets", async () => {
    const made = await waiting();
    made.answerer.tick(3000);
    made.last().emit({ type: "joined", identity: CALLER });
    await settle();
    expect(made.log).toEqual(["picture", "sound", "publish"]);
    expect(made.last().calls).toEqual(["connect", "publish"]);
    expect(made.last().published).toEqual({ video: track("picture"), audio: track("sound") });
    expect(made.answerer.state()).toMatchObject({ phase: "call", room: "chert-warm-AAAA" });
    // FaceTime is still connecting: nothing is said yet.
    expect(made.session.state().phase).toBe("ringing");
    expect(made.log).not.toContain("greet");
    made.last().emit({ type: "metadata", metadata: READY });
    await settle();
    expect(made.log.filter((each) => each === "greet")).toHaveLength(1);
    expect(made.session.state().phase).toBe("greeted");
    expect(made.session.link()).not.toBeNull();
    // One sound track for the whole call: nothing else was ever published.
    expect(made.log.filter((each) => each === "publish" || each === "sound")).toEqual(["sound", "publish"]);
  });

  test("the silent agent is not the friend: its coming, going and tracks change nothing", async () => {
    const made = await waiting();
    await onCall(made, 3000);
    expect(made.session.friendSeen()).toBe(true);
    const before = [...made.log];
    made.last().emit({ type: "video", track: track("agent-picture"), identity: AGENT });
    made.last().emit({ type: "audio", track: track("agent-voice"), identity: AGENT });
    made.last().emit({ type: "joined", identity: "someone-else" });
    made.last().emit({ type: "left", identity: AGENT });
    await settle();
    expect(made.log).toEqual(before);
    expect(made.session.state().phase).toBe("greeted");
    expect(made.session.friendSeen()).toBe(true);
  });

  test("a caller who was in the room before the game is answered on joining, and the ready sign is not missed", async () => {
    const made = rig(inRoom("chert-0b9c2f6e", { caller: CALLER, ready: true }));
    made.present = [{ type: "joined", identity: AGENT }, { type: "joined", identity: CALLER }, { type: "metadata", metadata: READY }];
    await waiting(made);
    expect(made.log).toEqual(["picture", "sound", "publish", "greet"]);
    expect(made.answerer.state()).toMatchObject({ phase: "call", room: "chert-0b9c2f6e" });
    expect(made.session.state().phase).toBe("greeted");
  });

  test("with no ready sign the greeting still goes out, later than on a dialled call, and a late sign sounds again", async () => {
    const made = await waiting();
    made.answerer.tick(3000);
    made.last().emit({ type: "joined", identity: CALLER });
    await settle();
    made.session.tick(4000);
    made.last().emit({ type: "video", track: track("friend-camera"), identity: CALLER });
    await settle();
    expect(ANSWER_FALLBACK_MS).toBeGreaterThan(BRIDGE_FALLBACK_MS);
    made.session.tick(4000 + ANSWER_FALLBACK_MS - 1);
    expect(made.log).not.toContain("greet");
    made.session.tick(4000 + ANSWER_FALLBACK_MS);
    await settle();
    expect(made.log.filter((each) => each === "greet")).toHaveLength(1);
    expect(made.session.state().phase).toBe("greeted");
    // FaceTime comes up only now: its ten seconds start here, so the game must be heard again.
    made.last().emit({ type: "metadata", metadata: READY });
    await settle();
    expect(made.log.filter((each) => each === "greet")).toHaveLength(2);
    made.last().emit({ type: "metadata", metadata: READY });
    await settle();
    expect(made.log.filter((each) => each === "greet")).toHaveLength(2);
  });

  test("the call service closing the room during the call is the call's end, not a lost connection", async () => {
    const made = await waiting();
    await onCall(made, 3000);
    made.last().emit({ type: "disconnected", reason: "ROOM_DELETED" });
    expect(made.session.state()).toMatchObject({ phase: "ended", ending: "friend" });
  });

  test("a second window taking the seat during a call ends the call here and the wait with it", async () => {
    const made = await waiting();
    await onCall(made, 3000);
    made.last().emit({ type: "disconnected", reason: DUPLICATE_IDENTITY });
    await settle();
    expect(made.session.state().phase).toBe("ended");
    expect(made.answerer.state()).toMatchObject({ phase: "off", reason: SEAT_TAKEN });
    made.answerer.tick(60_000);
    await settle();
    expect(made.rooms).toHaveLength(1);
  });

  test("stop during a call hangs up: the room is left, and still never closed", async () => {
    const made = await waiting();
    await onCall(made, 3000);
    made.answerer.stop(9000);
    await settle();
    expect(made.session.state()).toMatchObject({ phase: "ended", ending: "host" });
    expect(made.answerer.state().phase).toBe("off");
    expect(made.last().calls).toEqual(["connect", "publish", "disconnect"]);
    expect(made.hungUp).toEqual([]);
    made.answerer.tick(60_000);
    await settle();
    expect(made.rooms).toHaveLength(1);
  });
});

describe("after a call", () => {
  test("the game leaves the call's room without closing it and waits in the next one, with no reload", async () => {
    const made = await waiting();
    await onCall(made, 3000);
    made.says = inRoom("chert-warm-NEXT");
    made.last().emit({ type: "left", identity: CALLER });
    await settle();
    expect(made.session.state()).toMatchObject({ phase: "ended", ending: "friend" });
    expect(made.rooms[0]?.calls).toEqual(["connect", "publish", "disconnect"]);
    expect(made.log).toEqual(expect.arrayContaining(["picture.stop", "sound.stop"]));
    // The room is the call service's: the server is never asked to close it.
    expect(made.hungUp).toEqual([]);
    expect(made.answerer.state()).toMatchObject({ phase: "looking", room: null });
    made.answerer.tick(3500);
    await settle();
    expect(made.rooms).toHaveLength(2);
    expect(made.last().joined?.token).toBe("token-for-chert-warm-NEXT");
    expect(made.last().calls).toEqual(["connect"]);
    expect(made.answerer.state()).toMatchObject({ phase: "waiting", room: "chert-warm-NEXT" });
    // The card says "call ended" for a few seconds, then goes back to waiting.
    expect(made.session.state().phase).toBe("ended");
    made.answerer.tick(3000 + ENDED_SHOW_MS);
    expect(made.session.state().phase).toBe("idle");
  });

  test("the next call is answered the same way: again one picture and one sound, in the new room", async () => {
    const made = await waiting();
    await onCall(made, 3000);
    made.says = inRoom("chert-warm-NEXT");
    made.last().emit({ type: "left", identity: CALLER });
    made.answerer.tick(3500);
    await settle();
    made.log.length = 0;
    // Before the card has gone back to "waiting": the second call must not wait for that.
    await onCall(made, 4000, "chert-bridge-call-2");
    expect(made.log).toEqual(["picture", "sound", "publish", "watch", "greet"]);
    expect(made.last().published).toEqual({ video: track("picture"), audio: track("sound") });
    expect(made.session.state().phase).toBe("greeted");
    expect(made.answerer.state()).toMatchObject({ phase: "call", room: "chert-warm-NEXT" });
    // The first call's "ended" must not wipe the second call from the card.
    made.answerer.tick(3000 + ENDED_SHOW_MS + 1000);
    expect(made.session.state().phase).toBe("greeted");
    expect(made.hungUp).toEqual([]);
  });

  test("the room of the call that just ended is not joined again while it is being closed", async () => {
    const made = await waiting();
    await onCall(made, 3000);
    made.last().emit({ type: "left", identity: CALLER });
    // The server still names the old room for a moment.
    for (let now = 3500; now < 3000 + SAME_ROOM_AFTER_MS; now += 500) {
      made.answerer.tick(now);
      await settle();
    }
    expect(made.rooms).toHaveLength(1);
    made.answerer.tick(3000 + SAME_ROOM_AFTER_MS + LOOK_EVERY_MS);
    await settle();
    expect(made.rooms).toHaveLength(2);
  });

  test("after the host hangs up, the caller's room is never joined again, but the next room is", async () => {
    const made = await waiting();
    await onCall(made, 3000);
    made.session.hangUp(8000);
    await settle();
    expect(made.session.state()).toMatchObject({ phase: "ended", ending: "host" });
    expect(made.hungUp).toEqual([]);
    for (let now = 8500; now < 8000 + 10 * SAME_ROOM_AFTER_MS; now += 1000) {
      made.answerer.tick(now);
      await settle();
    }
    expect(made.rooms).toHaveLength(1);
    made.says = inRoom("chert-warm-NEXT");
    made.answerer.tick(8000 + 10 * SAME_ROOM_AFTER_MS + LOOK_EVERY_MS);
    await settle();
    expect(made.rooms).toHaveLength(2);
    expect(made.answerer.state()).toMatchObject({ phase: "waiting", room: "chert-warm-NEXT" });
  });

  test("five minutes end the call from this side too, and the game waits for the next", async () => {
    const made = await waiting();
    await onCall(made, 3000);
    made.says = inRoom("chert-warm-NEXT");
    made.session.tick(3000 + 5 * 60_000);
    await settle();
    expect(made.session.state()).toMatchObject({ phase: "ended", ending: "time" });
    made.answerer.tick(3000 + 5 * 60_000 + 500);
    await settle();
    expect(made.answerer.state()).toMatchObject({ phase: "waiting", room: "chert-warm-NEXT" });
    expect(made.hungUp).toEqual([]);
  });
});

describe("the page's side of /api/facetime/waiting", () => {
  const answering = (status: number, body: unknown): typeof fetch => () => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

  test("it asks the one path and reads a room, no room, and a server that cannot tell", async () => {
    const asked: string[] = [];
    const ask = createWaitingApi((url) => { asked.push(String(url)); return answering(200, { url: URL, token: "t", room: "chert-warm-AAAA", identity: "odyssey-dojo", caller: null, ready: false, line: "+1 555 555 0100", source: "livekit" })(url); });
    expect(await ask()).toEqual({ room: "chert-warm-AAAA", url: URL, token: "t", caller: null, ready: false, line: "+1 555 555 0100" });
    expect(asked).toEqual(["/api/facetime/waiting"]);
    expect(await createWaitingApi(answering(200, { url: URL, token: "t", room: "chert-x", caller: CALLER, ready: true, line: null }))()).toMatchObject({ room: "chert-x", caller: CALLER, ready: true, line: null });
    expect(await createWaitingApi(answering(200, { room: null, reason: "No call can come in yet.", line: null }))()).toEqual({ room: null, reason: "No call can come in yet.", line: null });
    expect(await createWaitingApi(answering(502, { error: "network", message: "The call's room could not be looked up.", line: "+1 555 555 0100" }))()).toEqual({ room: undefined, reason: "The call's room could not be looked up.", line: "+1 555 555 0100" });
    expect(await createWaitingApi(answering(403, { error: "local_only" }))()).toEqual({ room: undefined, reason: NO_SERVER, line: null });
  });

  test("no server, or an answer that is not what it should be, is never taken for a room", async () => {
    expect(await createWaitingApi(() => Promise.reject(new TypeError("fetch failed")))()).toEqual({ room: undefined, reason: NO_SERVER, line: null });
    expect(await createWaitingApi(answering(200, { room: "chert-warm-AAAA" }))()).toEqual({ room: undefined, reason: NO_SERVER, line: null });
    expect(await createWaitingApi(answering(200, "<html>"))()).toEqual({ room: undefined, reason: NO_SERVER, line: null });
  });
});
