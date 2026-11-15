// "Wait for a FaceTime call": the part of the FaceTime card for a call that comes in. A friend calls the game's
// Chert line on FaceTime Video from an iPhone, and the game answers it (answer.ts). The card (FaceTimeCard.tsx)
// shows these when the server says a call can come in.
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "../../ui/pebble";
import { createWaitingApi } from "../answer";
import type { AnswerState, Answerer, Waiting } from "../answer";
import type { CallState } from "../callMachine";
import "./answerPanel.css";

/** While the card has nothing to offer yet, the server is asked again this often whether a call can come in. */
const ASK_AGAIN_MS = 8000;
const OFF: AnswerState = { phase: "off", room: null, reason: "", line: null };

export interface Answering {
  /** True once the server has had a room for a call to come into: the card then offers to wait for one. */
  readonly offered: boolean;
  /** True from the press of "Wait for a FaceTime call" until "Stop waiting". */
  readonly on: boolean;
  readonly state: AnswerState;
  /** The number to call, or null when the server does not know it. */
  readonly line: string | null;
  readonly start: () => void;
  readonly stop: () => void;
}

/**
 * Whether the idle card asks the server if a call can come in. Not once it has been offered, not while waiting
 * (the answerer asks then), not on a card that never answers, and not on a server with no room settings (`rooms`
 * false): there the Multiplayer screen is as it was before answering, with no request sent over and over.
 */
export function asksForOffer(known: { readonly offered: boolean; readonly on: boolean; readonly never: boolean; readonly rooms: boolean }): boolean {
  return known.rooms && !known.offered && !known.on && !known.never;
}

/**
 * The card's hold on the page's answerer. `answerer` and `waiting` are the page's own by default
 * (answerBrowser.ts and the game's server); tests pass theirs. `null`: this card does not answer calls at all
 * (a card that was given a session of its own, as the loopback page's is: the page's answerer runs the page's session).
 * `rooms`: the server has its room settings (the status route's `standIn`); without them nothing is asked.
 */
export function useAnswering(given?: { readonly answerer?: Answerer; readonly waiting?: () => Promise<Waiting> } | null, rooms = true): Answering {
  const never = given === null;
  const [answerer, setAnswerer] = useState<Answerer | null>(given?.answerer ?? null);
  const [offer, setOffer] = useState<{ readonly offered: boolean; readonly line: string | null }>({ offered: false, line: null });
  const ask = given?.waiting;

  useEffect(() => {
    if (answerer || never) return;
    let gone = false;
    // Loaded here and not at the top, as the session is: it brings the room's code, which a menu does not need.
    void import("../answerBrowser").then((module) => { if (!gone) setAnswerer(module.faceTimeAnswerer()); });
    return () => { gone = true; };
  }, [answerer, never]);

  const state = useSyncExternalStore(
    (listener) => answerer?.subscribe(listener) ?? (() => undefined),
    () => answerer?.state() ?? OFF,
    () => OFF,
  );
  const on = state.phase !== "off";

  // Until a room has been seen once, and while not waiting already, the server is asked now and then.
  const settled = !asksForOffer({ offered: offer.offered, on, never, rooms });
  useEffect(() => {
    if (settled) return;
    let gone = false;
    const once = (): void => {
      void (ask ?? createWaitingApi())().then((found) => {
        if (gone) return;
        setOffer((before) => {
          const offered = before.offered || typeof found.room === "string";
          const line = found.line ?? before.line;
          return offered === before.offered && line === before.line ? before : { offered, line };
        });
      });
    };
    once();
    const timer = window.setInterval(once, ASK_AGAIN_MS);
    return () => { gone = true; window.clearInterval(timer); };
  }, [ask, settled]);

  return {
    offered: offer.offered || on,
    on,
    state,
    line: state.line ?? offer.line,
    start: () => { answerer?.start(performance.now()); },
    stop: () => { answerer?.stop(performance.now()); },
  };
}

function Line(props: { line: string | null }) {
  return props.line === null ? <strong className="ft-line ft-line--unknown">your Chert line</strong> : <strong className="ft-line">{props.line}</strong>;
}

/** The offer, on the idle card. `only`: the card has no call of its own to offer, so this is its one button. */
export function AnswerStart(props: { answering: Answering; only?: boolean }) {
  return (
    <div className="ft-answer">
      <small>{props.only === true ? "Your friend calls" : "Or your friend calls"} <Line line={props.answering.line} /> on FaceTime Video, from an iPhone that has joined the line. The game answers.</small>
      {props.answering.state.reason !== "" && <small role="alert">{props.answering.state.reason}</small>}
      <Button primary={props.only === true} onClick={() => { props.answering.start(); }}>Wait for a FaceTime call</Button>
    </div>
  );
}

/** What the card says while a call is waited for. */
export function waitingLine(state: AnswerState): string {
  if (state.phase === "waiting") return "Waiting for a FaceTime call.";
  if (state.phase === "call") return "A FaceTime call is coming in.";
  return state.reason === "" ? "Getting ready for a FaceTime call..." : state.reason;
}

/** The card's line for a call that was answered, where the dialled call's own words do not fit. Null: use those. */
export function answeredLine(call: CallState): string | null {
  if (call.phase === "dialing" || call.phase === "ringing") return "A FaceTime call is coming in. Connecting...";
  if (call.phase === "bridge_ready") return "The call is connected. Athena is greeting your friend.";
  return null;
}

/**
 * Whether the card offers "Start the fight": "go" to press it, "wait" to show it greyed, "none" to leave it out.
 * A dialled call shows it greyed from the dial, as before. An answered call leaves it out until the call is live
 * (the ready sign, or the fallback greeting): FaceTime is still connecting for some nine seconds after the caller
 * comes in, and on the first real call the button stood there all that time as if the fight could start.
 */
export function startOffer(call: CallState, answered: boolean): "go" | "wait" | "none" {
  if (call.phase === "greeted" || call.phase === "playing") return "go";
  if (answered) return "none";
  return call.phase === "dialing" || call.phase === "ringing" || call.phase === "bridge_ready" ? "wait" : "none";
}

/** The card while waiting, with no call on: the number to call and the live state. */
export function AnswerWaiting(props: { answering: Answering }) {
  const { state, line } = props.answering;
  const ready = state.phase === "waiting";
  return (
    <div className="room ft-answer">
      <p className="notice" role="status">{waitingLine(state)}</p>
      <p className="ft-answer__call">Call <Line line={line} /></p>
      <small>
        {ready
          ? "Call this number on FaceTime Video from an iPhone that has joined the line. The game answers by itself. A call lasts 5 minutes."
          : "The game is not in the call's waiting room yet. A call made now may not reach it."}
      </small>
      <Button onClick={() => { props.answering.stop(); }}>Stop waiting</Button>
    </div>
  );
}
