// One FaceTime call from dial to hang up: joins the room as the game, sends the picture and the sound, rings the
// phone, greets the friend when the bridge is ready, reads their camera into strikes, and keeps the two clocks.
// Everything it touches comes in as `deps`, so the tests run it with a fake room, a fake server and no browser.
// browserSession.ts gives it the real ones and the timers.
import type { CombatInput, EnemySpec, MoveDef, PoseFrame, PoseHistory } from "../core/types";
import type { HostLink } from "../net/host";
import type { Answer, FaceTimeApi, RoomSeat } from "./api";
import { bridgeReady } from "./bridge";
import { IDLE, callMsLeft, callStep, clock, isOpen } from "./callMachine";
import type { CallEffect, CallEvent, CallFailure, CallState } from "./callMachine";
import { GRADE_MS, frameHud, gradeWord } from "./frameHud";
import type { FrameHud } from "./frameHud";
import { createFriendLink } from "./friendLink";
import type { FriendLink } from "./friendLink";
import { normalizePhone } from "./phone";
import type { FaceTimeRoom, RoomEvent } from "./room";

/**
 * The friend's camera is in the room but the bridge's ready sign has not come: after this long the call is taken
 * as ready anyway. The sign's exact form has not been seen on a real call (see bridge.ts), and a friend left in
 * silence is hung up on by the call service, so a late greeting is better than none.
 */
export const BRIDGE_FALLBACK_MS = 3000;
/** How often the call service is asked whether the call is still on. */
export const POLL_EVERY_MS = 2000;
/** A body found in the friend's camera this recently counts as in view. */
export const IN_VIEW_MS = 2000;

const NOT_JOINED = "The game could not join the call's room. Check LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET on the server.";

export interface Watcher {
  read(): PoseFrame | null;
  stop(): void;
}

export interface SessionDeps {
  readonly api: FaceTimeApi;
  readonly openRoom: () => Promise<FaceTimeRoom>;
  /** Starts the outgoing picture. */
  readonly startPicture: () => { readonly track: MediaStreamTrack; draw(hud: FrameHud): void; stop(): void };
  /** Starts the outgoing sound. */
  readonly startSound: () => { readonly track: MediaStreamTrack | null; greet(): Promise<void>; goodbye(): Promise<void>; hear(track: MediaStreamTrack | null): void; stop(): void };
  /** Starts reading the friend's camera. */
  readonly watchFriend: (track: MediaStreamTrack) => Promise<Watcher>;
  /** Turns the friend's frames into strikes: createPoseInput(MOVES) in the game. A new reader per call. */
  readonly poseReader: () => (history: PoseHistory) => CombatInput;
  readonly pushFrame: (history: PoseHistory, frame: PoseFrame) => PoseHistory;
  readonly moves: ReadonlyMap<string, MoveDef>;
  readonly enemies: readonly EnemySpec[];
  readonly rate: (quality: number) => string | null;
}

export interface FaceTimeSession {
  state(): CallState;
  /** A line from the server to show under a failure, or "". */
  detail(): string;
  subscribe(listener: () => void): () => void;
  /** Rings `raw` (any way of writing a phone number). Resolves once the phone is ringing, or the call has failed. */
  dial(raw: string, now: number): Promise<void>;
  /**
   * The same call with no phone: nothing is rung. The server gives the bridge's seat in the room, and the stand-in
   * page (tools/facetime/standin.html) joins with it. From the moment it joins, the call runs as a real one does.
   */
  standIn(now: number): Promise<void>;
  /** The bridge's seat for the stand-in page while such a call is open, else null. */
  standInSeat(): RoomSeat | null;
  hangUp(now: number): void;
  /** Back to idle after a call ended or failed. */
  reset(): void;
  /** Call once per animation frame while a call is open: reads the friend and paints the outgoing picture. */
  frame(now: number): void;
  /** Call a few times a second: the clocks and the poll. */
  tick(now: number): void;
  /** The link to hand FightScreen, once dialled. */
  link(): HostLink | null;
  /** True while the friend's camera is being read. */
  friendSeen(): boolean;
  /** True while a body was found in the friend's camera in the last two seconds. */
  friendInView(): boolean;
}

export function createFaceTimeSession(deps: SessionDeps): FaceTimeSession {
  let state: CallState = IDLE;
  let detail = "";
  let generation = 0;
  let friendLink: FriendLink | null = null;
  let room: FaceTimeRoom | null = null;
  let picture: ReturnType<SessionDeps["startPicture"]> | null = null;
  let sound: ReturnType<SessionDeps["startSound"]> | null = null;
  let watcher: Watcher | null = null;
  let readPose: ((history: PoseHistory) => CombatInput) | null = null;
  let history: PoseHistory = { frames: [], baseline: null };
  let callId: string | null = null;
  let friendSeat: RoomSeat | null = null;
  let polledAt = -Infinity;
  let polling = false;
  let fallbackAt: number | null = null;
  let grade: { readonly word: string; readonly until: number } | null = null;
  let lastNow = 0;
  let bodyAt = -Infinity;
  /** The room's name once the server gave a seat in it: what hang up closes. */
  let roomName: string | null = null;
  const listeners = new Set<() => void>();

  const teardown = (): void => {
    watcher?.stop();
    watcher = null;
    picture?.stop();
    picture = null;
    sound?.stop();
    sound = null;
    const leaving = room;
    room = null;
    void leaving?.disconnect().catch(() => undefined);
    // Leaving is not enough: the bridge stays in the room, and with it the call on the phone. The server closes the room.
    const closing = roomName;
    roomName = null;
    if (closing !== null) void deps.api.hangUp(closing).catch(() => undefined);
    bodyAt = -Infinity;
    friendLink?.friend.setHere(false);
    callId = null;
    friendSeat = null;
    fallbackAt = null;
    grade = null;
  };

  const run = (effect: CallEffect, mine: number): void => {
    if (effect === "greet") {
      const speaking = sound;
      if (!speaking) return;
      void speaking.greet().then(
        () => { if (mine === generation) dispatch({ type: "greeted", now: lastNow }); },
        () => { if (mine === generation) dispatch({ type: "fail", now: lastNow, why: "greet_late" }); },
      );
    } else if (effect === "goodbye") void sound?.goodbye().catch(() => undefined);
    else teardown();
  };

  function dispatch(event: CallEvent): void {
    if ("now" in event) lastNow = Math.max(lastNow, event.now);
    const before = state;
    const step = callStep(state, event);
    state = step.state;
    const mine = generation;
    step.effects.forEach((effect) => { run(effect, mine); });
    if (state !== before) listeners.forEach((listener) => { listener(); });
  }

  const fail = (why: CallFailure, message = ""): void => {
    detail = message;
    dispatch({ type: "fail", now: lastNow, why });
    // A failure before the dial (a bad number) leaves nothing open to tear down.
    if (state.phase !== "failed") {
      state = { ...IDLE, phase: "failed", failure: why };
      listeners.forEach((listener) => { listener(); });
    }
  };

  const onRoom = (mine: number) => (event: RoomEvent): void => {
    if (mine !== generation || !isOpen(state)) return;
    switch (event.type) {
      case "metadata":
        if (bridgeReady(event.metadata)) dispatch({ type: "bridge_ready", now: lastNow });
        break;
      case "video": {
        watcher?.stop();
        watcher = null;
        if (!event.track) {
          friendLink?.friend.setHere(false);
          break;
        }
        fallbackAt = lastNow + BRIDGE_FALLBACK_MS;
        deps.watchFriend(event.track).then(
          (next) => {
            if (mine !== generation || !isOpen(state)) { next.stop(); return; }
            watcher?.stop();
            watcher = next;
            history = { frames: [], baseline: null };
            bodyAt = -Infinity;
            readPose = deps.poseReader();
            friendLink?.friend.setHere(true);
            listeners.forEach((listener) => { listener(); });
          },
          () => { /* The friend is still on the call and sees the fight; their moves just are not read. */ },
        );
        break;
      }
      case "audio":
        sound?.hear(event.track);
        break;
      case "left":
        dispatch({ type: "remote_ended", now: lastNow });
        break;
      case "disconnected":
        fail("room_lost");
        break;
    }
  };

  /**
   * Opens the room as the game, sends the picture and the sound, then asks for the far end with `place`: the call
   * service for a phone, or a seat for the stand-in page.
   */
  const open = async (now: number, place: (inRoom: string) => Promise<Answer<{ readonly callId: string | null; readonly friend?: RoomSeat }>>): Promise<void> => {
    generation += 1;
    const mine = generation;
    const live = (): boolean => mine === generation && isOpen(state);
    friendLink = createFriendLink();
    dispatch({ type: "dial", now });

    const seat = await deps.api.seat();
    if (!live()) return;
    if (!seat.ok) { fail(seat.why, seat.message); return; }
    roomName = seat.value.room;
    try {
      const joined = await deps.openRoom();
      if (!live()) return;
      room = joined;
      joined.on(onRoom(mine));
      await joined.connect(seat.value.url, seat.value.token);
      if (!live()) return;
      // The picture and the sound are in the room before the phone rings, so the friend never sees an empty call.
      picture = deps.startPicture();
      sound = deps.startSound();
      await joined.publish(picture.track, sound.track);
    } catch {
      if (live()) fail("room_lost", NOT_JOINED);
      else if (mine === generation && state.phase === "failed" && state.failure === "room_lost" && detail === "") {
        // The room can say it is closed just before the join gives up: the same failure, so the same line.
        detail = NOT_JOINED;
        // A new object, so a card that compares states shows the line.
        state = { ...state };
        listeners.forEach((listener) => { listener(); });
      }
      return;
    }
    if (!live()) return;
    const placed = await place(seat.value.room);
    if (!live()) return;
    if (!placed.ok) { fail(placed.why, placed.message); return; }
    callId = placed.value.callId;
    friendSeat = placed.value.friend ?? null;
    polledAt = lastNow;
    dispatch({ type: "placed", now: lastNow });
  };

  return {
    state: () => state,
    detail: () => detail,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async dial(raw, now) {
      if (isOpen(state)) return;
      lastNow = now;
      detail = "";
      const phone = normalizePhone(raw);
      if (!phone.ok) { fail("bad_number", phone.why); return; }
      await open(now, (inRoom) => deps.api.call(phone.e164, inRoom));
    },
    async standIn(now) {
      if (isOpen(state)) return;
      lastNow = now;
      detail = "";
      await open(now, async (inRoom) => {
        const answer = await deps.api.standIn(inRoom);
        // No call id: there is no call service to ask how the call is doing.
        return answer.ok ? { ok: true, value: { callId: null, friend: answer.value } } : answer;
      });
    },
    standInSeat: () => friendSeat,
    hangUp(now) { dispatch({ type: "hang_up", now }); },
    reset() {
      if (isOpen(state)) return;
      detail = "";
      dispatch({ type: "reset" });
    },
    frame(now) {
      lastNow = Math.max(lastNow, now);
      if (!isOpen(state) || !friendLink) return;
      const friend = friendLink.friend;
      const seen = watcher?.read() ?? null;
      if (seen && readPose) {
        bodyAt = now;
        history = deps.pushFrame(history, seen);
        friend.sendInput(readPose(history));
      }
      if (state.phase === "greeted" && friend.fight()) dispatch({ type: "fight_started", now });
      const word = gradeWord(friend.takeEvents(), deps.rate);
      if (word !== null) grade = { word, until: now + GRADE_MS };
      if (grade && now >= grade.until) grade = null;
      if (!picture) return;
      const fight = friend.fight();
      const left = callMsLeft(state, now);
      picture.draw(frameHud({
        state: friend.state(),
        enemy: fight ? deps.enemies.find((each) => each.id === fight.enemyId) ?? null : null,
        moves: deps.moves,
        clock: left === null ? null : clock(left),
        grade: grade?.word ?? null,
      }));
    },
    tick(now) {
      lastNow = Math.max(lastNow, now);
      if (!isOpen(state)) return;
      if (fallbackAt !== null && now >= fallbackAt) {
        fallbackAt = null;
        dispatch({ type: "bridge_ready", now });
      }
      dispatch({ type: "tick", now });
      const id = callId;
      if (id === null || polling || now - polledAt < POLL_EVERY_MS || !isOpen(state)) return;
      polledAt = now;
      polling = true;
      const mine = generation;
      void deps.api.callState(id).then((remote) => {
        polling = false;
        if (mine === generation && remote === "over") dispatch({ type: "remote_ended", now: lastNow });
      });
    },
    link: () => friendLink?.host ?? null,
    friendSeen: () => watcher !== null,
    friendInView: () => watcher !== null && lastNow - bodyAt < IN_VIEW_MS,
  };
}
