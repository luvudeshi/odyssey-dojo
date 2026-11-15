// The life of one FaceTime call, as a pure state machine: no timers, no network. The session feeds it what
// happened and the time; it answers with the new state and what to do now (greet, say goodbye, hang up).
//
//   idle -> dialing -> ringing -> bridge_ready -> greeted -> playing -> ended
//                         any of them -> failed
//
// Two clocks come from the call service's rules: the caller must hear a greeting within 10 s of the bridge being
// ready (a silent call is ended by the service), and a trial call lasts 5 minutes at most.

export type CallPhase = "idle" | "dialing" | "ringing" | "bridge_ready" | "greeted" | "playing" | "ended" | "failed";

/** The greeting must have started this long after the bridge is ready. */
export const GREET_DEADLINE_MS = 10_000;
/** The trial's limit for one call. */
export const CALL_CAP_MS = 5 * 60_000;
/** Athena says goodbye here, so the last words are heard before the line is cut. */
export const GOODBYE_AT_MS = 4 * 60_000 + 45_000;
/** A phone that is never picked up: stop waiting. */
export const RING_TIMEOUT_MS = 60_000;

export type CallFailure =
  | "not_set_up" | "bad_number" | "line_busy" | "unverified" | "unauthorized" | "network" | "no_answer"
  | "greet_late" | "room_lost" | "service";

export interface CallState {
  readonly phase: CallPhase;
  /** When the current attempt began (the dial). */
  readonly dialedAt: number | null;
  /** When the bridge said it was ready: the call clock runs from here. */
  readonly readyAt: number | null;
  readonly greetedAt: number | null;
  readonly goodbyeSaid: boolean;
  readonly failure: CallFailure | null;
  /** Who ended a call that ended. */
  readonly ending: "host" | "friend" | "time" | null;
}

export type CallEvent =
  | { readonly type: "dial"; readonly now: number }
  /** The call service took the call and the phone is ringing. */
  | { readonly type: "placed"; readonly now: number }
  | { readonly type: "bridge_ready"; readonly now: number }
  /** The greeting started to play into the call. */
  | { readonly type: "greeted"; readonly now: number }
  | { readonly type: "fight_started"; readonly now: number }
  /** The far end hung up, or the call service says the call is over. */
  | { readonly type: "remote_ended"; readonly now: number }
  | { readonly type: "hang_up"; readonly now: number }
  | { readonly type: "fail"; readonly now: number; readonly why: CallFailure }
  | { readonly type: "tick"; readonly now: number }
  | { readonly type: "reset" };

export type CallEffect = "greet" | "goodbye" | "hang_up";

export interface CallStep {
  readonly state: CallState;
  readonly effects: readonly CallEffect[];
}

export const IDLE: CallState = { phase: "idle", dialedAt: null, readyAt: null, greetedAt: null, goodbyeSaid: false, failure: null, ending: null };

const LIVE: readonly CallPhase[] = ["bridge_ready", "greeted", "playing"];
const OPEN: readonly CallPhase[] = ["dialing", "ringing", ...LIVE];

/** True while the friend is on the line. */
export function isLive(state: CallState): boolean {
  return LIVE.includes(state.phase);
}

/** True from the dial until the call ends or fails. */
export function isOpen(state: CallState): boolean {
  return OPEN.includes(state.phase);
}

const same = (state: CallState): CallStep => ({ state, effects: [] });
const failed = (state: CallState, why: CallFailure): CallStep => ({ state: { ...state, phase: "failed", failure: why }, effects: isOpen(state) ? ["hang_up"] : [] });

export function callStep(state: CallState, event: CallEvent): CallStep {
  switch (event.type) {
    case "reset":
      return same(IDLE);
    case "dial":
      if (isOpen(state)) return same(state);
      return same({ ...IDLE, phase: "dialing", dialedAt: event.now });
    case "placed":
      return state.phase === "dialing" ? same({ ...state, phase: "ringing" }) : same(state);
    case "bridge_ready":
      // The bridge can be ready before the call service's answer to the dial has come back.
      if (state.phase !== "dialing" && state.phase !== "ringing") return same(state);
      return { state: { ...state, phase: "bridge_ready", readyAt: event.now }, effects: ["greet"] };
    case "greeted":
      return state.phase === "bridge_ready" ? same({ ...state, phase: "greeted", greetedAt: event.now }) : same(state);
    case "fight_started":
      return state.phase === "greeted" ? same({ ...state, phase: "playing" }) : same(state);
    case "remote_ended":
      if (!isOpen(state)) return same(state);
      if (!isLive(state)) return failed(state, "no_answer");
      return { state: { ...state, phase: "ended", ending: "friend" }, effects: ["hang_up"] };
    case "hang_up":
      if (!isOpen(state)) return same(state);
      return { state: { ...state, phase: "ended", ending: "host" }, effects: ["hang_up"] };
    case "fail":
      return state.phase === "ended" || state.phase === "failed" ? same(state) : failed(state, event.why);
    case "tick": {
      if ((state.phase === "dialing" || state.phase === "ringing") && state.dialedAt !== null && event.now - state.dialedAt >= RING_TIMEOUT_MS) {
        return failed(state, "no_answer");
      }
      if (state.readyAt === null || !isLive(state)) return same(state);
      const age = event.now - state.readyAt;
      if (state.phase === "bridge_ready" && age >= GREET_DEADLINE_MS) return failed(state, "greet_late");
      if (age >= CALL_CAP_MS) return { state: { ...state, phase: "ended", ending: "time" }, effects: ["hang_up"] };
      if (age >= GOODBYE_AT_MS && !state.goodbyeSaid) return { state: { ...state, goodbyeSaid: true }, effects: ["goodbye"] };
      return same(state);
    }
  }
}

/** Milliseconds of call time left, or null before the bridge is ready. Never below zero. */
export function callMsLeft(state: CallState, now: number): number | null {
  if (state.readyAt === null) return null;
  return Math.max(0, CALL_CAP_MS - (now - state.readyAt));
}

/** Milliseconds left to start the greeting, or null when no greeting is owed. */
export function greetMsLeft(state: CallState, now: number): number | null {
  if (state.phase !== "bridge_ready" || state.readyAt === null) return null;
  return Math.max(0, GREET_DEADLINE_MS - (now - state.readyAt));
}

/** "4:07" for the countdown on the card, on the host's screen and in the picture the friend sees. */
export function clock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`;
}

export const FAILURE_MESSAGES: Readonly<Record<CallFailure, string>> = {
  not_set_up: "FaceTime is not set up on this server.",
  bad_number: "That phone number does not look right.",
  line_busy: "The game's FaceTime line is on another call. Try again in a minute.",
  unverified: "This phone has not been checked yet. Ask your friend to text the game's number once, then call again.",
  unauthorized: "The FaceTime service refused the server's key. Check the setup.",
  network: "The FaceTime service could not be reached. Check the internet connection.",
  no_answer: "Nobody picked up.",
  greet_late: "The call was dropped before the greeting could play.",
  room_lost: "The connection to the call was lost.",
  service: "The FaceTime service could not place the call.",
};

/** One plain line for the card. */
export function describe(state: CallState, now: number): string {
  switch (state.phase) {
    case "idle": return "";
    case "dialing": return "Calling...";
    case "ringing": return "Ringing. Ask your friend to answer the FaceTime call.";
    case "bridge_ready": return "Your friend answered. Athena is greeting them.";
    case "greeted": return `Your friend is on the call. Start the fight. ${clock(callMsLeft(state, now) ?? 0)} left.`;
    case "playing": return `On the call. ${clock(callMsLeft(state, now) ?? 0)} left.`;
    case "ended": return state.ending === "time" ? "The five minutes are up. The call has ended." : state.ending === "friend" ? "Your friend hung up." : "The call has ended.";
    case "failed": return FAILURE_MESSAGES[state.failure ?? "service"];
  }
}

/** How long the host's plate stays up with the reason after a call ends or fails during a fight. */
export const PLATE_LINGER_MS = 6000;

/**
 * What the host's plate says for a few seconds once the call is over, or null when it should just go.
 * Only owed when the call was in a fight: there the card is not on screen, so nothing else tells the host
 * that the friend left or the call dropped. On the Multiplayer screen the card says it.
 */
export function partingLine(inFight: boolean, state: CallState, now: number): string | null {
  if (!inFight || (state.phase !== "ended" && state.phase !== "failed")) return null;
  return describe(state, now);
}
