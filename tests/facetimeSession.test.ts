// One whole FaceTime call with a fake room, a fake server and a made-up friend: what is done in which order, the
// greeting rule, the friend's strikes reaching the fight, the picture that is sent, and every way a call fails.
import { describe, expect, test } from "vitest";
import { startFight, step } from "../src/combat/engine";
import type { CombatInput, CombatState, PoseFrame, PoseHistory } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import type { Answer, FaceTimeApi, RemoteCall, RoomSeat } from "../src/facetime/api";
import { createFaceTimeApi } from "../src/facetime/api";
import { CALL_CAP_MS, FAILURE_MESSAGES, GOODBYE_AT_MS, describe as say } from "../src/facetime/callMachine";
import { createFakeRoom } from "../src/facetime/fakeRoom";
import type { FakeRoom } from "../src/facetime/fakeRoom";
import type { FrameHud } from "../src/facetime/frameHud";
import { createFriendLink } from "../src/facetime/friendLink";
import { BRIDGE_FALLBACK_MS, IN_VIEW_MS, POLL_EVERY_MS, createFaceTimeSession } from "../src/facetime/session";
import type { SessionDeps } from "../src/facetime/session";
import { MOVES } from "../src/moves/registry";
import { forTwo, TOGETHER_MS } from "../src/net/host";
import { rating } from "../src/pose/quality";
import { STYLES } from "../src/styles/registry";

const enemy = ENEMIES[0];
const style = STYLES[0];
if (!enemy || !style) throw new Error("nothing to fight with");
const track = (name: string): MediaStreamTrack => ({ id: name }) as unknown as MediaStreamTrack;
const seat: RoomSeat = { url: "wss://rooms.example.test", token: "seat-token", room: "odyssey-dojo-0123456789ab", identity: "odyssey-dojo" };
const friendSeat: RoomSeat = { url: seat.url, token: "friend-token", room: seat.room, identity: "facetime-bridge" };
const NUMBER = "+1 555 555 0100";
const settle = async (): Promise<void> => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

interface Rig {
  readonly deps: SessionDeps;
  readonly room: FakeRoom;
  /** Everything that happened, in order. */
  readonly log: string[];
  readonly drawn: FrameHud[];
  /** What the made-up friend does on the next frame read. */
  friendInput: CombatInput | null;
  remote: RemoteCall;
  callsPlaced: { to: string; room: string }[];
  /** Rooms the server was asked to close, in order. Kept out of `log` so the order of the rest reads as before. */
  hungUp: string[];
  /** Whether the pose model finds a body in the friend's camera. */
  body: boolean;
}

function rig(options: { seat?: Answer<RoomSeat>; call?: Answer<{ callId: string }>; standIn?: Answer<RoomSeat>; failConnect?: boolean; greetFails?: boolean; hangUpFails?: boolean } = {}): Rig {
  const room = createFakeRoom(options.failConnect === true ? { failConnect: true } : {});
  const log: string[] = [];
  const drawn: FrameHud[] = [];
  const self: Rig = {
    room, log, drawn, friendInput: null, remote: "ringing", callsPlaced: [], hungUp: [], body: true,
    deps: {
      api: {
        status: () => Promise.resolve({ ready: true, missing: [], standIn: true }),
        seat: () => { log.push("seat"); return Promise.resolve(options.seat ?? { ok: true, value: seat }); },
        call: (to, inRoom) => {
          log.push("call");
          self.callsPlaced.push({ to, room: inRoom });
          return Promise.resolve(options.call ?? { ok: true, value: { callId: "call-1" } });
        },
        callState: () => { log.push("poll"); return Promise.resolve(self.remote); },
        standIn: (inRoom) => { log.push(`standin ${inRoom}`); return Promise.resolve(options.standIn ?? { ok: true, value: friendSeat }); },
        hangUp: (inRoom) => { self.hungUp.push(inRoom); return options.hangUpFails === true ? Promise.reject(new TypeError("fetch failed")) : Promise.resolve(true); },
      } satisfies FaceTimeApi,
      openRoom: () => Promise.resolve({
        ...room,
        connect: async (url: string, token: string) => { log.push("connect"); await room.connect(url, token); },
        publish: async (video: MediaStreamTrack, audio: MediaStreamTrack | null) => { log.push("publish"); await room.publish(video, audio); },
        disconnect: async () => { log.push("disconnect"); await room.disconnect(); },
        on: room.on,
      }),
      startPicture: () => ({ track: track("picture"), draw: (hud) => { drawn.push(hud); }, stop: () => { log.push("picture.stop"); } }),
      startSound: () => ({
        track: track("sound"),
        greet: () => { log.push("greet"); return options.greetFails === true ? Promise.reject(new Error("no sound")) : Promise.resolve(); },
        goodbye: () => { log.push("goodbye"); return Promise.resolve(); },
        hear: (heard) => { log.push(heard ? "hear" : "hear.off"); },
        stop: () => { log.push("sound.stop"); },
      }),
      watchFriend: () => {
        log.push("watch");
        return Promise.resolve({ read: () => (self.body ? { t: 0, image: [], world: [] } satisfies PoseFrame : null), stop: () => { log.push("watch.stop"); } });
      },
      poseReader: () => () => {
        const input = self.friendInput ?? { held: new Set<string>(), struck: [] };
        self.friendInput = null;
        return input;
      },
      pushFrame: (history: PoseHistory) => history,
      moves: MOVES,
      enemies: ENEMIES,
      rate: rating,
    },
  };
  return self;
}

/** Dials and brings the call to "greeted", with the friend's camera read. */
async function answeredCall(made: Rig = rig()) {
  const session = createFaceTimeSession(made.deps);
  await session.dial(NUMBER, 1000);
  made.room.emit({ type: "video", track: track("friend-camera"), identity: "facetime-bridge" });
  made.room.emit({ type: "metadata", metadata: '{"chert_bridge_ready":true}' });
  await settle();
  return { session, made };
}

describe("placing the call", () => {
  test("the game is in the room, sending picture and sound, before the phone rings", async () => {
    const made = rig();
    const session = createFaceTimeSession(made.deps);
    await session.dial(NUMBER, 1000);
    expect(made.log).toEqual(["seat", "connect", "publish", "call"]);
    expect(made.room.joined).toEqual({ url: seat.url, token: seat.token });
    expect(made.room.published.video).toEqual(track("picture"));
    expect(made.room.published.audio).toEqual(track("sound"));
    expect(made.callsPlaced).toEqual([{ to: "+15555550100", room: seat.room }]);
    expect(session.state().phase).toBe("ringing");
    expect(session.link()).not.toBeNull();
  });

  test("a bad number never reaches the server", async () => {
    const made = rig();
    const session = createFaceTimeSession(made.deps);
    await session.dial("555-0100", 0);
    expect(session.state()).toMatchObject({ phase: "failed", failure: "bad_number" });
    expect(session.detail()).toContain("too short");
    expect(made.log).toEqual([]);
  });

  test.each([
    ["not_set_up", FAILURE_MESSAGES.not_set_up],
    ["unauthorized", FAILURE_MESSAGES.unauthorized],
  ] as const)("the server refusing a seat (%s) fails the call with nothing opened", async (why, message) => {
    const made = rig({ seat: { ok: false, why, message: "" } });
    const session = createFaceTimeSession(made.deps);
    await session.dial(NUMBER, 0);
    expect(session.state()).toMatchObject({ phase: "failed", failure: why });
    expect(say(session.state(), 0)).toBe(message);
    expect(made.log).toEqual(["seat"]);
  });

  test.each(["line_busy", "unverified", "unauthorized", "network", "service"] as const)("the call service refusing (%s) leaves the room and stops picture and sound", async (why) => {
    const made = rig({ call: { ok: false, why, message: "from the server" } });
    const session = createFaceTimeSession(made.deps);
    await session.dial(NUMBER, 0);
    expect(session.state()).toMatchObject({ phase: "failed", failure: why });
    expect(session.detail()).toBe("from the server");
    expect(made.log).toEqual(["seat", "connect", "publish", "call", "picture.stop", "sound.stop", "disconnect"]);
  });

  test("a room that cannot be joined fails before the phone rings", async () => {
    const made = rig({ failConnect: true });
    const session = createFaceTimeSession(made.deps);
    await session.dial(NUMBER, 0);
    expect(session.state()).toMatchObject({ phase: "failed", failure: "room_lost" });
    expect(made.log).not.toContain("call");
  });

  test("a second dial during a call does nothing, and reset only works once it is over", async () => {
    const made = rig();
    const session = createFaceTimeSession(made.deps);
    await session.dial(NUMBER, 0);
    await session.dial(NUMBER, 10);
    session.reset();
    expect(made.log.filter((each) => each === "call")).toHaveLength(1);
    expect(session.state().phase).toBe("ringing");
    session.hangUp(20);
    session.reset();
    expect(session.state().phase).toBe("idle");
  });
});

describe("the greeting", () => {
  test("nothing is said on joining the room or while it rings; the ready sign greets at once", async () => {
    const made = rig();
    const session = createFaceTimeSession(made.deps);
    await session.dial(NUMBER, 1000);
    made.room.emit({ type: "metadata", metadata: '{"state":"connecting"}' });
    session.tick(1500);
    expect(made.log).not.toContain("greet");
    made.room.emit({ type: "metadata", metadata: "chert_bridge_ready" });
    expect(made.log.at(-1)).toBe("greet");
    await settle();
    expect(session.state().phase).toBe("greeted");
    // The clock started at the ready sign.
    expect(session.state().readyAt).toBe(1500);
  });

  test("with the friend's camera in the room and no ready sign, the greeting still goes out after a short wait", async () => {
    const made = rig();
    const session = createFaceTimeSession(made.deps);
    await session.dial(NUMBER, 1000);
    session.tick(2000);
    made.room.emit({ type: "video", track: track("friend-camera"), identity: "facetime-bridge" });
    session.tick(2000 + BRIDGE_FALLBACK_MS - 1);
    expect(made.log).not.toContain("greet");
    session.tick(2000 + BRIDGE_FALLBACK_MS);
    expect(made.log).toContain("greet");
    await settle();
    expect(session.state().phase).toBe("greeted");
  });

  test("a greeting that cannot play fails the call instead of leaving the friend in silence", async () => {
    const made = rig({ greetFails: true });
    const session = createFaceTimeSession(made.deps);
    await session.dial(NUMBER, 0);
    made.room.emit({ type: "metadata", metadata: "chert_bridge_ready" });
    await settle();
    expect(session.state()).toMatchObject({ phase: "failed", failure: "greet_late" });
    expect(made.log).toContain("disconnect");
  });
});

describe("the friend in the fight", () => {
  const strikeId = style.strikes[0] ?? "";

  test("their camera is read once it arrives, and their voice is played to the host", async () => {
    const { session, made } = await answeredCall();
    expect(made.log).toContain("watch");
    expect(session.friendSeen()).toBe(true);
    expect(session.link()?.guestHere()).toBe(true);
    made.room.emit({ type: "audio", track: track("friend-voice"), identity: "facetime-bridge" });
    expect(made.log.at(-1)).toBe("hear");
    made.room.emit({ type: "video", track: null, identity: "facetime-bridge" });
    expect(session.friendSeen()).toBe(false);
    expect(session.link()?.guestHere()).toBe(false);
  });

  test("a strike seen on the phone reaches the engine as player 1", async () => {
    const { session, made } = await answeredCall();
    const link = session.link();
    if (!link) throw new Error("no link");
    link.start(enemy.id, style.id, 7);
    made.friendInput = { held: new Set(["block"]), struck: [{ move: strikeId, quality: 0.9, player: 0 }] };
    session.frame(5000);
    const own: CombatInput = { held: new Set(), struck: [] };
    // Held back a moment for the host's own strike, as in a room, then let go.
    expect(link.takeInput(own, 5000).struck).toEqual([]);
    const released = link.takeInput(own, 5000 + TOGETHER_MS);
    expect(released.struck).toEqual([{ move: strikeId, quality: 0.9, player: 1 }]);
    // Only the host defends.
    expect(released.held.size).toBe(0);
  });

  test("both striking the same move are released together in one frame", async () => {
    const { session, made } = await answeredCall();
    const link = session.link();
    if (!link) throw new Error("no link");
    link.start(enemy.id, style.id, 7);
    made.friendInput = { held: new Set(), struck: [{ move: strikeId, quality: 0.8, player: 0 }] };
    session.frame(5000);
    const both = link.takeInput({ held: new Set(), struck: [{ move: strikeId, quality: 0.7, player: 0 }] }, 5010);
    expect(both.struck.map((each) => each.player).sort()).toEqual([0, 1]);
  });

  test("the picture sent to the phone follows the fight: waiting, then the prompt, the bars, the clock and the grade", async () => {
    const { session, made } = await answeredCall();
    const link = session.link();
    if (!link) throw new Error("no link");
    session.frame(1000);
    expect(made.drawn.at(-1)).toMatchObject({ word: "STAND BACK", clock: "5:00" });

    link.start(enemy.id, style.id, 7);
    session.frame(3000);
    expect(session.state().phase).toBe("playing");
    const weakSpot = enemy.weakSpots[0];
    const state: CombatState = { ...forTwo(startFight(enemy, 7)), enemyHp: enemy.hp / 2, phase: { kind: "strike", weakSpot, move: strikeId, msLeft: 1500, totalMs: 3000 } };
    link.publish(state, [{ type: "enemyHit", move: strikeId, damage: 10, quality: 0.95 }], 4000);
    session.frame(61_000);
    expect(made.drawn.at(-1)).toMatchObject({
      enemyName: enemy.name, enemyShare: 0.5, heroShare: 1, tag: "STRIKE NOW", word: MOVES.get(strikeId)?.prompt, timer: 0.5, clock: "4:00", grade: "PERFECT",
    });
    // The grade word goes away again.
    session.frame(63_000);
    expect(made.drawn.at(-1)?.grade).toBeNull();
  });

  test("a real engine step through the link keeps the fight for two", async () => {
    const { session } = await answeredCall();
    const link = session.link();
    if (!link) throw new Error("no link");
    link.start(enemy.id, style.id, 7);
    let state = forTwo(startFight(enemy, 7));
    for (let now = 0; now < 2000; now += 16) {
      const result = step(state, enemy, style, link.takeInput({ held: new Set(), struck: [] }, now), 16);
      state = result.state;
      link.publish(state, result.events, now);
    }
    expect(state.players).toBe(2);
  });
});

describe("whether the friend is in view", () => {
  test("a camera with no body in it is not a friend the game can see", async () => {
    const made = rig();
    made.body = false;
    const { session } = await answeredCall(made);
    session.frame(2000);
    // The camera is read, but the model found nobody: the card must not say the game sees the friend.
    expect(session.friendSeen()).toBe(true);
    expect(session.friendInView()).toBe(false);
    made.body = true;
    session.frame(2100);
    expect(session.friendInView()).toBe(true);
  });

  test("a body that walks out of the picture stops counting after two seconds", async () => {
    const { session, made } = await answeredCall();
    session.frame(2000);
    expect(session.friendInView()).toBe(true);
    made.body = false;
    session.frame(2000 + IN_VIEW_MS - 1);
    expect(session.friendInView()).toBe(true);
    session.frame(2000 + IN_VIEW_MS);
    expect(session.friendInView()).toBe(false);
    expect(session.friendSeen()).toBe(true);
  });

  test("nobody is in view before the camera arrives, after it goes, or once the call is over", async () => {
    const made = rig();
    const session = createFaceTimeSession(made.deps);
    expect(session.friendInView()).toBe(false);
    await session.dial(NUMBER, 1000);
    session.frame(1100);
    expect(session.friendInView()).toBe(false);
    made.room.emit({ type: "video", track: track("friend-camera"), identity: "facetime-bridge" });
    made.room.emit({ type: "metadata", metadata: "chert_bridge_ready" });
    await settle();
    session.frame(1200);
    expect(session.friendInView()).toBe(true);
    made.room.emit({ type: "video", track: null, identity: "facetime-bridge" });
    expect(session.friendInView()).toBe(false);
    made.room.emit({ type: "video", track: track("friend-camera-2"), identity: "facetime-bridge" });
    await settle();
    // A new camera starts unseen until a body is found in it.
    made.body = false;
    session.frame(1300);
    expect(session.friendInView()).toBe(false);
    made.body = true;
    session.frame(1400);
    expect(session.friendInView()).toBe(true);
    session.hangUp(1500);
    expect(session.friendInView()).toBe(false);
  });
});

describe("closing the room", () => {
  test("every way a call ends asks the server to close the room, once, after leaving it", async () => {
    const host = await answeredCall();
    expect(host.made.hungUp).toEqual([]);
    host.session.hangUp(9000);
    expect(host.made.log.at(-1)).toBe("disconnect");
    expect(host.made.hungUp).toEqual([seat.room]);
    // A second hang up (the page closing just after) has nothing left to close.
    host.session.hangUp(9100);
    expect(host.made.hungUp).toEqual([seat.room]);

    const friend = await answeredCall();
    friend.made.room.emit({ type: "left", identity: "facetime-bridge" });
    expect(friend.made.hungUp).toEqual([seat.room]);

    const time = await answeredCall();
    time.session.tick((time.session.state().readyAt ?? 0) + CALL_CAP_MS);
    expect(time.made.hungUp).toEqual([seat.room]);

    const lost = await answeredCall();
    lost.made.room.emit({ type: "disconnected", reason: "network" });
    expect(lost.made.hungUp).toEqual([seat.room]);
  });

  test("a refused call, an unanswered one and a stand-in call close their rooms too", async () => {
    const refused = rig({ call: { ok: false, why: "unverified", message: "" } });
    await createFaceTimeSession(refused.deps).dial(NUMBER, 0);
    expect(refused.hungUp).toEqual([seat.room]);

    const unanswered = rig();
    const ringing = createFaceTimeSession(unanswered.deps);
    await ringing.dial(NUMBER, 0);
    ringing.tick(60_000);
    expect(ringing.state()).toMatchObject({ phase: "failed", failure: "no_answer" });
    expect(unanswered.hungUp).toEqual([seat.room]);

    const standIn = rig();
    const session = createFaceTimeSession(standIn.deps);
    await session.standIn(0);
    session.hangUp(100);
    expect(standIn.hungUp).toEqual([seat.room]);
  });

  test("with no seat there is no room to close, and a server that cannot be reached does not break the hang up", async () => {
    const none = rig({ seat: { ok: false, why: "not_set_up", message: "" } });
    await createFaceTimeSession(none.deps).dial(NUMBER, 0);
    expect(none.hungUp).toEqual([]);
    const bad = rig();
    await createFaceTimeSession(bad.deps).dial("555-0100", 0);
    expect(bad.hungUp).toEqual([]);

    const down = await answeredCall(rig({ hangUpFails: true }));
    down.session.hangUp(9000);
    await settle();
    expect(down.session.state()).toMatchObject({ phase: "ended", ending: "host" });
    expect(down.made.hungUp).toEqual([seat.room]);
    // The next call closes its own room, not the last one's again.
    down.session.reset();
    await down.session.dial(NUMBER, 10_000);
    down.session.hangUp(10_100);
    expect(down.made.hungUp).toEqual([seat.room, seat.room]);
  });
});

describe("the end of a call", () => {
  test("goodbye at 4:45, then the line is closed at five minutes and everything is stopped", async () => {
    const { session, made } = await answeredCall();
    const ready = session.state().readyAt ?? 0;
    session.tick(ready + GOODBYE_AT_MS - 1);
    expect(made.log).not.toContain("goodbye");
    session.tick(ready + GOODBYE_AT_MS);
    session.tick(ready + GOODBYE_AT_MS + 250);
    expect(made.log.filter((each) => each === "goodbye")).toHaveLength(1);
    session.tick(ready + CALL_CAP_MS);
    expect(session.state()).toMatchObject({ phase: "ended", ending: "time" });
    expect(made.log.slice(-4)).toEqual(["watch.stop", "picture.stop", "sound.stop", "disconnect"]);
    expect(session.link()?.guestHere()).toBe(false);
    // Nothing is drawn or asked after the end.
    const drawn = made.drawn.length;
    session.frame(ready + CALL_CAP_MS + 100);
    session.tick(ready + CALL_CAP_MS + 5000);
    expect(made.drawn).toHaveLength(drawn);
  });

  test("the friend hanging up ends it: seen in the room, or told by the call service", async () => {
    const left = await answeredCall();
    left.made.room.emit({ type: "left", identity: "facetime-bridge" });
    expect(left.session.state()).toMatchObject({ phase: "ended", ending: "friend" });
    expect(left.made.log).toContain("disconnect");

    const polled = await answeredCall();
    polled.made.remote = "over";
    polled.session.tick(1000 + POLL_EVERY_MS);
    await settle();
    expect(polled.made.log).toContain("poll");
    expect(polled.session.state()).toMatchObject({ phase: "ended", ending: "friend" });
  });

  test("the call service is asked no more often than every two seconds", async () => {
    const { session, made } = await answeredCall();
    for (let now = 1000; now <= 1000 + POLL_EVERY_MS * 3; now += 250) {
      session.tick(now);
      await settle();
    }
    expect(made.log.filter((each) => each === "poll")).toHaveLength(3);
  });

  test("a declined call fails as not answered, and losing the room fails the call", async () => {
    const declined = rig();
    const one = createFaceTimeSession(declined.deps);
    await one.dial(NUMBER, 0);
    declined.remote = "over";
    one.tick(POLL_EVERY_MS);
    await settle();
    expect(one.state()).toMatchObject({ phase: "failed", failure: "no_answer" });

    const { session, made } = await answeredCall();
    made.room.emit({ type: "disconnected", reason: "network" });
    expect(session.state()).toMatchObject({ phase: "failed", failure: "room_lost" });
    expect(made.log).toContain("picture.stop");
  });

  test("the host hanging up stops everything and tells listeners", async () => {
    const { session, made } = await answeredCall();
    let told = 0;
    const off = session.subscribe(() => { told += 1; });
    session.hangUp(9000);
    expect(session.state()).toMatchObject({ phase: "ended", ending: "host" });
    expect(told).toBe(1);
    off();
    session.reset();
    expect(told).toBe(1);
    expect(made.log.slice(-3)).toEqual(["picture.stop", "sound.stop", "disconnect"]);
  });
});

describe("a stand-in friend (no phone, no call service)", () => {
  test("the room is opened the same way, the bridge's seat is asked for, and no call is placed", async () => {
    const made = rig();
    const session = createFaceTimeSession(made.deps);
    expect(session.standInSeat()).toBeNull();
    await session.standIn(1000);
    expect(made.log).toEqual(["seat", "connect", "publish", `standin ${seat.room}`]);
    expect(made.callsPlaced).toEqual([]);
    expect(made.room.joined).toEqual({ url: seat.url, token: seat.token });
    expect(session.state().phase).toBe("ringing");
    expect(session.standInSeat()).toEqual(friendSeat);
    expect(session.link()).not.toBeNull();
  });

  test("once the stand-in's camera is in the room the call goes on as a real one: greeting after the wait, then the fight", async () => {
    const made = rig();
    const session = createFaceTimeSession(made.deps);
    await session.standIn(1000);
    made.room.emit({ type: "video", track: track("friend-camera"), identity: "facetime-bridge" });
    made.room.emit({ type: "audio", track: track("friend-voice"), identity: "facetime-bridge" });
    await settle();
    session.tick(1000 + BRIDGE_FALLBACK_MS - 1);
    expect(made.log).not.toContain("greet");
    session.tick(1000 + BRIDGE_FALLBACK_MS);
    await settle();
    expect(made.log).toEqual(expect.arrayContaining(["watch", "hear", "greet"]));
    expect(session.state().phase).toBe("greeted");
    expect(session.friendSeen()).toBe(true);
    // There is no call service to ask about the call, however long it runs.
    for (let now = 5000; now < 5000 + POLL_EVERY_MS * 4; now += 500) { session.tick(now); await settle(); }
    expect(made.log).not.toContain("poll");
    expect(made.log).not.toContain("call");
  });

  test("the stand-in leaving ends the call as a friend hanging up, and the seat is forgotten", async () => {
    const made = rig();
    const session = createFaceTimeSession(made.deps);
    await session.standIn(0);
    made.room.emit({ type: "video", track: track("friend-camera"), identity: "facetime-bridge" });
    session.tick(BRIDGE_FALLBACK_MS);
    await settle();
    made.room.emit({ type: "left", identity: "facetime-bridge" });
    expect(session.state()).toMatchObject({ phase: "ended", ending: "friend" });
    expect(session.standInSeat()).toBeNull();
    expect(made.log.slice(-3)).toEqual(["picture.stop", "sound.stop", "disconnect"]);
  });

  test("a server that cannot give the stand-in a seat fails the call and closes the room", async () => {
    const made = rig({ standIn: { ok: false, why: "not_set_up", message: "FaceTime is not set up on this server." } });
    const session = createFaceTimeSession(made.deps);
    await session.standIn(0);
    expect(session.state()).toMatchObject({ phase: "failed", failure: "not_set_up" });
    expect(session.detail()).toBe("FaceTime is not set up on this server.");
    expect(session.standInSeat()).toBeNull();
    expect(made.log).toContain("disconnect");
  });

  test("a room that cannot be joined says what to check, also when the room reports closing first", async () => {
    const made = rig();
    const closing = { ...made.deps, openRoom: () => Promise.resolve({
      ...made.room,
      connect: () => { made.room.emit({ type: "disconnected", reason: "no signal" }); return Promise.reject(new Error("could not reach the room")); },
    }) };
    const session = createFaceTimeSession(closing);
    let told = 0;
    session.subscribe(() => { told += 1; });
    await session.standIn(0);
    expect(session.state()).toMatchObject({ phase: "failed", failure: "room_lost" });
    expect(session.detail()).toMatch(/could not join the call's room\. Check LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET/);
    expect(told).toBeGreaterThanOrEqual(3);
    expect(made.log.filter((each) => each.startsWith("standin"))).toEqual([]);

    const refused = rig({ failConnect: true });
    const plain = createFaceTimeSession(refused.deps);
    await plain.standIn(0);
    expect(plain.state()).toMatchObject({ phase: "failed", failure: "room_lost" });
    expect(plain.detail()).toMatch(/could not join the call's room/);
  });

  test("it does nothing during a call, and a stand-in nobody opens is given up on like an unanswered phone", async () => {
    const { session, made } = await answeredCall();
    await session.standIn(5000);
    expect(made.log.filter((each) => each.startsWith("standin"))).toEqual([]);
    expect(session.standInSeat()).toBeNull();

    const alone = rig();
    const waiting = createFaceTimeSession(alone.deps);
    await waiting.standIn(0);
    waiting.tick(59_999);
    expect(waiting.state().phase).toBe("ringing");
    waiting.tick(60_000);
    expect(waiting.state()).toMatchObject({ phase: "failed", failure: "no_answer" });
  });
});

describe("the friend's link on its own", () => {
  test("it carries the fight to the phone's side and forgets it when the host leaves", () => {
    const { host, friend } = createFriendLink();
    const seen: (string | null)[] = [];
    friend.onFight((fight) => { seen.push(fight?.enemyId ?? null); });
    expect(host.guestHere()).toBe(false);
    friend.setHere(true);
    expect(host.guestHere()).toBe(true);
    host.start(enemy.id, style.id, 3);
    expect(friend.fight()).toEqual({ enemyId: enemy.id, styleId: style.id, seed: 3 });
    const state = forTwo(startFight(enemy, 3));
    host.publish(state, [{ type: "whiffed" }], 0);
    expect(friend.state()).toBe(state);
    expect(friend.takeEvents()).toEqual([{ type: "whiffed" }]);
    expect(friend.takeEvents()).toEqual([]);
    host.stop();
    expect(friend.fight()).toBeNull();
    host.close();
    expect(seen).toEqual([enemy.id, null, null]);
  });
});

describe("the page's side of the server routes", () => {
  const answer = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  test("it asks the right paths and reads the answers", async () => {
    const asked: { url: string; method: string; body: unknown }[] = [];
    const api = createFaceTimeApi((url, init) => {
      const path = String(url);
      asked.push({ url: path, method: init?.method ?? "GET", body: typeof init?.body === "string" ? JSON.parse(init.body) as unknown : undefined });
      if (path === "/api/facetime/status") return Promise.resolve(answer(200, { ready: false, missing: ["CHERT_API_KEY"], standIn: true }));
      if (path === "/api/facetime/standin") return Promise.resolve(answer(200, friendSeat));
      if (path === "/api/facetime/seat") return Promise.resolve(answer(200, seat));
      if (path === "/api/facetime/call") return Promise.resolve(answer(200, { callId: "call-9" }));
      return Promise.resolve(answer(200, { state: "active", raw: "connected" }));
    });
    expect(await api.status()).toEqual({ ready: false, missing: ["CHERT_API_KEY"], standIn: true });
    expect(await api.seat()).toEqual({ ok: true, value: seat });
    expect(await api.call("+15555550100", seat.room)).toEqual({ ok: true, value: { callId: "call-9" } });
    expect(await api.callState("call 9/x")).toBe("active");
    expect(asked).toEqual([
      { url: "/api/facetime/status", method: "GET", body: undefined },
      { url: "/api/facetime/seat", method: "POST", body: {} },
      { url: "/api/facetime/call", method: "POST", body: { to: "+15555550100", room: seat.room } },
      { url: "/api/facetime/call/call%209%2Fx", method: "GET", body: undefined },
    ]);
    expect(await api.standIn(seat.room)).toEqual({ ok: true, value: friendSeat });
    expect(asked.at(-1)).toEqual({ url: "/api/facetime/standin", method: "POST", body: { room: seat.room } });
  });

  test("hang up is a JSON POST with the room that still goes out while the page closes", async () => {
    const sent: { url: string; init: RequestInit | undefined }[] = [];
    let status = 200;
    const api = createFaceTimeApi((url, init) => { sent.push({ url: String(url), init }); return Promise.resolve(answer(status, status === 200 ? { room: "deleted" } : { error: "service" })); });
    expect(await api.hangUp(seat.room)).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe("/api/facetime/hangup");
    expect(sent[0]?.init).toEqual({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room: seat.room }), keepalive: true });
    status = 400;
    expect(await api.hangUp("odyssey-dojo-ffffffffffff")).toBe(false);
    const down = createFaceTimeApi(() => Promise.reject(new TypeError("fetch failed")));
    expect(await down.hangUp(seat.room)).toBe(false);
    // The other requests are not marked that way.
    await api.seat();
    expect(sent.at(-1)?.init).not.toHaveProperty("keepalive");
  });

  test("refusals keep the server's reason and its words; no server at all is plain too", async () => {
    const refusing = createFaceTimeApi((url) => Promise.resolve(String(url).endsWith("/seat")
      ? answer(503, { error: "not_set_up", message: "FaceTime is not set up on this server." })
      : answer(409, { error: "line_busy", message: "busy" })));
    expect(await refusing.seat()).toEqual({ ok: false, why: "not_set_up", message: "FaceTime is not set up on this server." });
    expect(await refusing.call("+15555550100", "r")).toEqual({ ok: false, why: "line_busy", message: "busy" });
    const odd = createFaceTimeApi(() => Promise.resolve(answer(500, { error: "something_else" })));
    expect(await odd.call("+15555550100", "r")).toEqual({ ok: false, why: "service", message: "" });
    expect(await odd.callState("c")).toBe("unknown");
    const down = createFaceTimeApi(() => Promise.reject(new TypeError("fetch failed")));
    expect(await down.status()).toEqual({ ready: false, missing: [], standIn: false });
    expect(await down.seat()).toMatchObject({ ok: false, why: "not_set_up" });
    expect(await down.call("+15555550100", "r")).toMatchObject({ ok: false, why: "network" });
    expect(await down.callState("c")).toBe("unknown");
    expect(await down.standIn("r")).toMatchObject({ ok: false, why: "network" });
    expect(await refusing.standIn("r")).toEqual({ ok: false, why: "line_busy", message: "busy" });
    const empty = createFaceTimeApi(() => Promise.resolve(answer(200, { url: "wss://rooms.example.test", room: "r" })));
    expect(await empty.standIn("r")).toEqual({ ok: false, why: "service", message: "" });
  });
});
