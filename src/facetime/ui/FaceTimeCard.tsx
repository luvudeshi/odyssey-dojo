// "Call a friend on FaceTime", a third card for the Multiplayer screen, beside Host a room and Join a room.
// The host types the friend's number; the friend answers an ordinary FaceTime call on an iPhone, with no app,
// and becomes the second fighter: the game reads their body from the call's video and sends the fight back.
import { useEffect, useState, useSyncExternalStore } from "react";
import type { HostLink } from "../../net/host";
import { Button } from "../../ui/pebble";
import { createFaceTimeApi } from "../api";
import { describe, isLive, isOpen } from "../callMachine";
import { normalizePhone } from "../phone";
import type { FaceTimeSession } from "../session";
import { standInLink } from "../standIn";
import "../../screens/account.css";
import "../../screens/multiplayer.css";
import "./faceTimeCard.css";

export const NOT_SET_UP = "FaceTime is not set up on this server.";

/**
 * "Test without a phone": a browser page on this machine joins the room where the FaceTime bridge would. Shown when
 * the server can open a room but cannot ring a phone, or always with ?ftstandin=1 in the game's address.
 */
function StandInStart(props: { disabled: boolean; onStart: () => void }) {
  return (
    <div className="ft-standin">
      <small>The room is set up, so the call can be tried with a browser window as the friend. No phone rings.</small>
      <Button disabled={props.disabled} onClick={props.onStart}>Test without a phone</Button>
    </div>
  );
}

type Setup = { readonly kind: "asking" } | { readonly kind: "ready" } | { readonly kind: "missing"; readonly names: readonly string[] };

/**
 * Mounted on the Multiplayer screen as
 *   <FaceTimeCard onStart={(link) => { props.onOpen(); props.onStart(link); }} />
 * The flow must pass through `host` first (onOpen), or it drops the link and the fight starts without the friend.
 */
export function FaceTimeCard(props: {
  /** Starts the fight with the friend as its second player. */
  onStart: (link: HostLink) => void;
  /** The page's session by default (browserSession.ts); the demo page and tests pass their own. */
  session?: FaceTimeSession;
  /** Asks the server whether FaceTime is set up. */
  status?: () => Promise<{ readonly ready: boolean; readonly missing: readonly string[]; readonly standIn?: boolean }>;
}) {
  const [session, setSession] = useState<FaceTimeSession | null>(props.session ?? null);
  const [setup, setSetup] = useState<Setup>({ kind: "asking" });
  const [canStandIn, setCanStandIn] = useState(false);
  const [number, setNumber] = useState("");
  const [, setBeat] = useState(0);
  const askStatus = props.status;

  useEffect(() => {
    if (session) return;
    let gone = false;
    // Loaded here and not at the top: the session brings the pose model's code, which a menu does not need.
    void import("../browserSession").then((module) => { if (!gone) setSession(module.faceTimeSession()); });
    return () => { gone = true; };
  }, [session]);

  useEffect(() => {
    let gone = false;
    void (askStatus ?? createFaceTimeApi().status)().then((answer) => {
      if (gone) return;
      setSetup(answer.ready ? { kind: "ready" } : { kind: "missing", names: answer.missing });
      setCanStandIn(answer.standIn === true);
    });
    return () => { gone = true; };
  }, [askStatus]);

  const state = useSyncExternalStore(
    (listener) => session?.subscribe(listener) ?? (() => undefined),
    () => session?.state() ?? null,
  );
  const open = state !== null && isOpen(state);
  // The clock in the status line moves without the state changing.
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => { setBeat((n) => n + 1); }, 500);
    return () => { window.clearInterval(timer); };
  }, [open]);

  const typed = normalizePhone(number);
  const now = performance.now();
  const over = state !== null && (state.phase === "ended" || state.phase === "failed");
  const idle = !state || state.phase === "idle";
  // The stand-in is offered when a phone cannot be rung. With a phone line set up it stays out of the way unless asked for.
  const offerStandIn = canStandIn && (setup.kind === "missing" || new URLSearchParams(window.location.search).has("ftstandin"));
  const startStandIn = (): void => { if (session) void session.standIn(performance.now()); };
  const friendSeat = session?.standInSeat() ?? null;
  const friendLink = friendSeat ? standInLink(window.location.origin, friendSeat) : null;
  const waiting = state !== null && (state.phase === "dialing" || state.phase === "ringing");

  // Nothing to offer: no phone line on this server and no stand-in. The Multiplayer screen then shows two choices.
  if (idle && setup.kind !== "ready" && !offerStandIn) return null;

  return (
    <section className="acc-card rooms__card ft-card">
      <h2>
        <svg className="acc-icon acc-card__icon" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <path d="M8 20 H38 V44 H8 Z M38 28 L56 18 V46 L38 36" />
        </svg>
        Call a friend on FaceTime
      </h2>
      {setup.kind === "missing" && idle ? (
        <>
          <p className="notice" role="alert">{NOT_SET_UP}</p>
          {setup.names.length > 0 && <small>Missing on the server: {setup.names.join(", ")}. See docs/facetime.md.</small>}
          {offerStandIn && <StandInStart disabled={!session} onStart={startStandIn} />}
        </>
      ) : idle ? (
        <>
          <p>Your friend answers a FaceTime call on an iPhone. No app. They see the fight and strike with their own body.</p>
          <form
            className="ft-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (session && typed.ok) void session.dial(number, performance.now());
            }}
          >
            <label className="ft-label" htmlFor="ft-number">Your friend&apos;s phone number</label>
            <input
              id="ft-number" className="ft-input" type="tel" inputMode="tel" autoComplete="off" placeholder="+1 555 555 0100"
              value={number} onChange={(event) => { setNumber(event.target.value); }}
              aria-describedby="ft-help" aria-invalid={number !== "" && !typed.ok}
            />
            <small id="ft-help">{number !== "" && !typed.ok ? typed.why : "They must have texted the game's number once. A call lasts 5 minutes."}</small>
            <Button primary type="submit" disabled={!session || !typed.ok || setup.kind !== "ready"}>Call</Button>
          </form>
          {offerStandIn && <StandInStart disabled={!session} onStart={startStandIn} />}
        </>
      ) : (
        <div className="room">
          <p className="notice" role={state.phase === "failed" ? "alert" : "status"}>
            {friendLink && waiting ? "Waiting for the stand-in friend. Open the link, allow the camera and press Answer." : describe(state, now)}
          </p>
          {friendLink && open && (
            <small className="ft-standin__link">
              <a
                href={friendLink} target="_blank" rel="noopener noreferrer"
                onClick={(event) => {
                  // Its own window, beside the game: the game stops drawing the phone's picture when its tab is hidden.
                  if (window.open(friendLink, "ft-standin", "popup,width=440,height=900")) event.preventDefault();
                }}
              >
                Open the stand-in phone
              </a>
              {" "}in a window beside this one, on this computer. No phone rings. The game waits one minute.
            </small>
          )}
          {/* The server's line is often the same words as the failure's own: shown once. */}
          {state.phase === "failed" && session?.detail() && session.detail() !== describe(state, now) ? <small>{session.detail()}</small> : null}
          {isLive(state) && (
            <small>
              {!session?.friendSeen() ? "Waiting for your friend's camera..."
                : session.friendInView() ? "The game can see your friend."
                  : "The camera is on, but no body is in view. Ask your friend to step back."}
            </small>
          )}
          {open && (
            <>
              <Button
                primary
                disabled={!isLive(state) || state.phase === "bridge_ready"}
                onClick={() => { const link = session?.link(); if (link) props.onStart(link); }}
              >
                Start the fight
              </Button>
              <Button onClick={() => { session?.hangUp(performance.now()); }}>Hang up</Button>
            </>
          )}
          {over && <Button primary onClick={() => { session?.reset(); }}>Call again</Button>}
        </div>
      )}
    </section>
  );
}
