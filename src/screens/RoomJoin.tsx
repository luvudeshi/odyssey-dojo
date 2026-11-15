// Join a room, inside the Multiplayer screen's join card: type the four letters, or arrive from a scanned link with the
// code filled in.
import { useEffect, useRef, useState } from "react";
import { createGuestLink } from "../net/guest";
import type { GuestLink } from "../net/guest";
import { cleanCode, joinRoomAgain, openRoom } from "../net/transport";
import { startTracker } from "../pose/tracker";
import type { PoseTracker } from "../pose/tracker";
import { Button } from "../ui/pebble";
import { browserDeps } from "./roomNet";
import { MODE_TEXT, guestMode, roomMessage } from "./roomUrl";
import type { GuestMode } from "./roomUrl";
import { forgetSeat, keepCamera, keptRoom, tabStore } from "./seatStore";

export function detectMode(): GuestMode {
  return guestMode({
    secure: window.isSecureContext,
    hasCamera: "mediaDevices" in navigator,
    touch: window.matchMedia("(pointer: coarse)").matches,
  });
}

export interface Joined {
  readonly link: GuestLink;
  readonly mode: GuestMode;
  readonly tracker: PoseTracker | null;
}

export function RoomJoin(props: { initialCode: string; onJoined: (joined: Joined) => void }) {
  const [store] = useState(tabStore);
  // A seat this tab still holds (a reload, a phone that was locked): fill in its room and take the seat back at once.
  const [kept] = useState(() => keptRoom(store));
  const [code, setCode] = useState(cleanCode(props.initialCode).slice(0, 4) || (kept?.code ?? ""));
  const [rejoin] = useState(() => (kept !== null && kept.code === code ? kept : null));
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(rejoin !== null);
  const mode = detectMode();
  const left = useRef(false);
  const gone = (): boolean => left.current;
  // The screen was left while a join or the camera prompt was pending: that join must not pull the player into a room.
  useEffect(() => {
    left.current = false;
    return () => { left.current = true; };
  }, []);

  const enter = async (useCamera: boolean): Promise<void> => {
    // Tries the kept seat first and falls back to a fresh join when the relay no longer takes it.
    const room = await joinRoomAgain(browserDeps, code, store);
    if (gone()) {
      if (typeof room !== "string") forgetSeat(store);
      return;
    }
    if (typeof room === "string") {
      setProblem(roomMessage(room));
      setBusy(false);
      return;
    }
    let tracker: PoseTracker | null = null;
    if (useCamera) tracker = await startTracker().catch(() => null);
    // Back was pressed while the join or the camera prompt was pending: open nothing, keep no camera.
    if (gone()) {
      tracker?.stop();
      forgetSeat(store);
      return;
    }
    keepCamera(store, useCamera);
    const played: GuestMode = tracker ? "camera" : mode !== "camera" ? mode : window.matchMedia("(pointer: coarse)").matches ? "touch" : "keyboard";
    props.onJoined({ link: createGuestLink(openRoom(browserDeps, room)), mode: played, tracker });
  };
  const join = (useCamera: boolean): void => {
    if (busy || code.length !== 4) return;
    setBusy(true);
    setProblem("");
    void enter(useCamera);
  };
  const enterNow = useRef(enter);
  useEffect(() => { enterNow.current = enter; });
  const tried = useRef(false);
  useEffect(() => {
    if (rejoin === null || tried.current) return;
    tried.current = true;
    void enterNow.current(rejoin.camera);
  }, [rejoin]);

  return (
    <div className="room">
      <label htmlFor="room-code">Four letters from your friend</label>
      <input
        id="room-code"
        className="room-input"
        value={code}
        autoFocus={props.initialCode !== ""}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        maxLength={4}
        onChange={(event) => { setCode(cleanCode(event.target.value).slice(0, 4)); }}
        onKeyDown={(event) => { if (event.key === "Enter") join(mode === "camera"); }}
      />
      <p className="notice" role="alert">{problem}</p>
      <p className="mode-note">{MODE_TEXT[mode]}</p>
      <Button primary disabled={busy || code.length !== 4} onClick={() => { join(mode === "camera"); }}>
        {mode === "camera" ? "Join with my webcam" : "Join"}
      </Button>
      {mode === "camera" && (
        <Button disabled={busy || code.length !== 4} onClick={() => { join(false); }}>Join with the keyboard</Button>
      )}
    </div>
  );
}
