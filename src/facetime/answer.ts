// Answering a FaceTime call. A friend calls the game's Chert line from an iPhone; the game is already in the room
// the call comes into, so it sees the caller arrive, publishes the fight and the sound, and the call then runs as a
// dialled one does (session.ts). When the call is over it goes to wait in the next room, with no reload.
//
// How the call service works, which this follows (docs/facetime.md, "Answer a call"):
//  - `chert dev` keeps a waiting room ready before any call, with the game's silent agent in it, and replaces it
//    every five minutes and after every call. The server says which room it is (GET /api/facetime/waiting).
//  - The call comes into that room as a participant named chert-bridge-<call id>.
//  - The room takes two people beside the agent: the game and the caller. So one game tab waits, never two.
//  - Sound may come from one participant only, and the picture from that same one. Nothing is published while
//    waiting: the picture and the one sound track go out when the caller is in the room, as Chert's own starter does.
//  - The room is the call service's. The game joins and leaves it and never closes it. Leaving a waiting room makes
//    LiveKit close it two seconds later, and `chert dev` makes the next one within a few seconds.
// Everything it touches comes in as `deps`, so the tests run it with a fake room and a fake server.
import type { CallState } from "./callMachine";
import type { FaceTimeRoom, RoomEvent } from "./room";

/** The FaceTime call's own participant: chert-bridge-<call id>. */
export const CALLER_PREFIX = "chert-bridge-";
/** The stand-in page and a dialled call sit in the room under this name (BRIDGE_IDENTITY on the server). */
export const STAND_IN_BRIDGE = "facetime-bridge";

/** True for the participant that carries the friend's camera and voice: the FaceTime bridge, or the stand-in for it. */
export function isBridge(identity: string): boolean {
  return identity === STAND_IN_BRIDGE || (identity.startsWith(CALLER_PREFIX) && identity.length > CALLER_PREFIX.length);
}

/** With no room to wait in, the server is asked again this often. */
export const LOOK_EVERY_MS = 2000;
/** In a waiting room, the server is asked this often whether it is still the right one. */
export const CHECK_EVERY_MS = 10_000;
/** A call that ended stays on the card this long before the card goes back to "waiting". */
export const ENDED_SHOW_MS = 5000;
/** After a call, the room it was in is not joined again for this long: it is being closed. */
export const SAME_ROOM_AFTER_MS = 10_000;

export const NO_SERVER = "The game's server did not answer.";
export const NOT_JOINED = "The game could not join the call's waiting room.";

/** What GET /api/facetime/waiting says. */
export type Waiting =
  | { readonly room: string; readonly url: string; readonly token: string; readonly caller: string | null; readonly ready: boolean; readonly line: string | null }
  /** There is no room to wait in, and why, in plain words. */
  | { readonly room: null; readonly reason: string; readonly line: string | null }
  /** The server could not tell (it did not answer, or could not ask). What is known so far still stands. */
  | { readonly room: undefined; readonly reason: string; readonly line: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Asks the game's server for the waiting room. Never throws. */
export function createWaitingApi(fetcher: typeof fetch = (url, init) => fetch(url, init)): () => Promise<Waiting> {
  return async () => {
    let body: unknown;
    let ok: boolean;
    try {
      const response = await fetcher("/api/facetime/waiting");
      ok = response.ok;
      body = await response.json().catch(() => null);
    } catch {
      return { room: undefined, reason: NO_SERVER, line: null };
    }
    const fields = isRecord(body) ? body : {};
    const line = typeof fields.line === "string" && fields.line !== "" ? fields.line : null;
    if (!ok) return { room: undefined, reason: typeof fields.message === "string" ? fields.message : NO_SERVER, line };
    if (typeof fields.room === "string" && typeof fields.url === "string" && typeof fields.token === "string") {
      return { room: fields.room, url: fields.url, token: fields.token, caller: typeof fields.caller === "string" ? fields.caller : null, ready: fields.ready === true, line };
    }
    if (fields.room === null) return { room: null, reason: typeof fields.reason === "string" ? fields.reason : "", line };
    return { room: undefined, reason: NO_SERVER, line };
  };
}

/**
 * off: not answering. looking: asking the server for a room (and `reason` says why there is none yet).
 * waiting: in the room, a call can come in. call: a caller is in the room; the session's own state says the rest.
 */
export type AnswerPhase = "off" | "looking" | "waiting" | "call";

export interface AnswerState {
  readonly phase: AnswerPhase;
  /** The room the game is in, while waiting or on a call. */
  readonly room: string | null;
  /** Why there is no room, while looking. "" when nothing is wrong yet. */
  readonly reason: string;
  /** The number to call, when the server knows it. */
  readonly line: string | null;
}

/** The little of the session this needs (session.ts). */
export interface AnswerSession {
  state(): CallState;
  subscribe(listener: () => void): () => void;
  answer(now: number, joined: FaceTimeRoom): Promise<void>;
  hangUp(now: number): void;
  reset(): void;
}

export interface AnswerDeps {
  readonly waiting: () => Promise<Waiting>;
  readonly openRoom: () => Promise<FaceTimeRoom>;
  readonly session: AnswerSession;
  /** Run once from the press of "Wait for a FaceTime call": what the browser only allows from a click. */
  readonly prime?: () => void;
}

export interface Answerer {
  state(): AnswerState;
  subscribe(listener: () => void): () => void;
  /** Starts waiting for a FaceTime call. Call it from a click. */
  start(now: number): void;
  /** Stops: leaves the waiting room, or hangs up the call that is on. */
  stop(now: number): void;
  /** Call a few times a second while not off: the questions to the server and the way back after a call. */
  tick(now: number): void;
}

const OPEN: readonly CallState["phase"][] = ["dialing", "ringing", "bridge_ready", "greeted", "playing"];
const isOpen = (state: CallState): boolean => OPEN.includes(state.phase);
const OFF: AnswerState = { phase: "off", room: null, reason: "", line: null };

export function createAnswerer(deps: AnswerDeps): Answerer {
  let state: AnswerState = OFF;
  /** Goes up whenever what is in flight (a question, a join) must be dropped. */
  let generation = 0;
  let room: FaceTimeRoom | null = null;
  /** The name of `room`, known from the moment the join starts. */
  let roomName: string | null = null;
  let asking = false;
  let joining = false;
  let askAt = 0;
  let lastNow = 0;
  /** When the card goes back from "call ended" to "waiting", or null. */
  let resetAt: number | null = null;
  /** The room of the last call, and until when it is not joined again. Forever when the host hung up. */
  let avoid: { readonly room: string; readonly until: number } | null = null;
  const listeners = new Set<() => void>();

  const set = (next: Partial<AnswerState>): void => {
    state = { ...state, ...next };
    listeners.forEach((listener) => { listener(); });
  };

  const leave = (): void => {
    const leaving = room;
    room = null;
    roomName = null;
    // Leaving only. The room is the call service's: it is never closed from here.
    void leaving?.disconnect().catch(() => undefined);
  };

  /** Back to asking the server, at once. Whatever was in flight is dropped. */
  const look = (reason: string): void => {
    generation += 1;
    joining = false;
    askAt = lastNow;
    set({ phase: "looking", room: null, reason });
  };

  const onRoom = (mine: number) => (event: RoomEvent): void => {
    if (mine !== generation || state.phase === "off" || state.phase === "call") return;
    if (event.type === "joined" && isBridge(event.identity)) {
      const joined = room;
      if (!joined) return;
      // The caller is here. From now the session runs the call, in this same room.
      resetAt = null;
      set({ phase: "call", room: roomName, reason: "" });
      void deps.session.answer(lastNow, joined);
    } else if (event.type === "disconnected") {
      // A waiting room is replaced every few minutes and the old one is closed: go to the next.
      room = null;
      roomName = null;
      // A room that closed before it was joined is not asked for again at once.
      const never = joining;
      look("");
      if (never) askAt = lastNow + LOOK_EVERY_MS;
    }
  };

  const join = async (found: Extract<Waiting, { room: string }>): Promise<void> => {
    const mine = generation;
    joining = true;
    try {
      const opened = await deps.openRoom();
      if (mine !== generation) return;
      room = opened;
      roomName = found.room;
      opened.on(onRoom(mine));
      await opened.connect(found.url, found.token);
    } catch {
      if (mine !== generation) return;
      leave();
      joining = false;
      askAt = lastNow + LOOK_EVERY_MS;
      set({ phase: "looking", room: null, reason: NOT_JOINED });
      return;
    }
    // Stopped, or the room closed, while joining: nothing more to do here.
    if (mine !== generation) return;
    joining = false;
    // A caller who was already in the room has been answered while joining: the phase is "call" by now.
    if (state.phase !== "looking") return;
    askAt = lastNow + CHECK_EVERY_MS;
    set({ phase: "waiting", room: found.room, reason: "" });
  };

  const ask = (): void => {
    asking = true;
    const mine = generation;
    void deps.waiting().then((found) => {
      asking = false;
      if (found.line !== null && found.line !== state.line && state.phase !== "off") set({ line: found.line });
      if (mine !== generation || joining || (state.phase !== "looking" && state.phase !== "waiting")) return;
      askAt = lastNow + (state.phase === "waiting" ? CHECK_EVERY_MS : LOOK_EVERY_MS);
      if (found.room === undefined) {
        // Not known: what is in hand stands. Only a game with no room says what is wrong.
        if (state.phase === "looking" && found.reason !== state.reason) set({ reason: found.reason });
        return;
      }
      if (found.room === null) {
        if (state.phase === "waiting") {
          // The room this game is in is no longer one a call can come into.
          leave();
          look(found.reason);
          askAt = lastNow + LOOK_EVERY_MS;
        } else if (found.reason !== state.reason) set({ reason: found.reason });
        return;
      }
      if (avoid !== null && found.room === avoid.room && lastNow < avoid.until) return;
      if (state.phase === "waiting") {
        if (found.room === state.room) return;
        // Another room is the one a call will come into now: move.
        leave();
        look("");
      }
      void join(found);
    });
  };

  /** The call the session ran is over: back to looking, and the card goes back to "waiting" a little later. */
  const afterCall = (): void => {
    const ended = deps.session.state();
    const was = state.room;
    // The session has left the room already (it never closes it).
    room = null;
    roomName = null;
    if (was !== null) avoid = { room: was, until: ended.phase === "ended" && ended.ending === "host" ? Infinity : lastNow + SAME_ROOM_AFTER_MS };
    resetAt = lastNow + ENDED_SHOW_MS;
    look("");
  };

  // The answerer lives as long as the page, so this is never taken back.
  deps.session.subscribe(() => {
    if (state.phase === "call" && !isOpen(deps.session.state())) afterCall();
  });

  return {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    start(now) {
      if (state.phase !== "off") return;
      lastNow = Math.max(lastNow, now);
      avoid = null;
      resetAt = null;
      deps.prime?.();
      look("");
    },
    stop(now) {
      if (state.phase === "off") return;
      lastNow = Math.max(lastNow, now);
      const onCall = state.phase === "call";
      const showingEnd = resetAt !== null;
      generation += 1;
      joining = false;
      resetAt = null;
      state = { ...OFF, line: state.line };
      // On a call the session holds the room, and hanging up leaves it. Otherwise this leaves it.
      if (onCall) {
        room = null;
        roomName = null;
        deps.session.hangUp(lastNow);
      } else {
        leave();
        if (showingEnd && !isOpen(deps.session.state())) deps.session.reset();
      }
      listeners.forEach((listener) => { listener(); });
    },
    tick(now) {
      lastNow = Math.max(lastNow, now);
      if (state.phase === "off") return;
      if (state.phase === "call") {
        if (!isOpen(deps.session.state())) afterCall();
        return;
      }
      if (resetAt !== null && lastNow >= resetAt) {
        resetAt = null;
        if (!isOpen(deps.session.state())) deps.session.reset();
      }
      if (!asking && !joining && lastNow >= askAt) ask();
    },
  };
}
