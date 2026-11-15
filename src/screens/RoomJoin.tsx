// Join a room: type the four letters, or arrive from a link with the code filled in.
import { useRef, useState } from "react";
import { createGuestLink } from "../net/guest";
import type { GuestLink } from "../net/guest";
import { cleanCode, joinRoom, openRoom } from "../net/transport";
import { startTracker } from "../pose/tracker";
import type { PoseTracker } from "../pose/tracker";
import { browserDeps } from "./roomNet";
import { MODE_TEXT, ROOM_MESSAGES, guestMode } from "./roomUrl";
import type { GuestMode } from "./roomUrl";

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

export function RoomJoin(props: { initialCode: string; onJoined: (joined: Joined) => void; onBack: () => void }) {
  const [code, setCode] = useState(cleanCode(props.initialCode).slice(0, 4));
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const mode = detectMode();
  const left = useRef(false);
  const gone = (): boolean => left.current;

  const join = async (useCamera: boolean): Promise<void> => {
    if (busy || code.length !== 4) return;
    setBusy(true);
    setProblem("");
    const room = await joinRoom(browserDeps, code);
    if (gone()) return;
    if (typeof room === "string") {
      setProblem(ROOM_MESSAGES[room] ?? "");
      setBusy(false);
      return;
    }
    let tracker: PoseTracker | null = null;
    if (useCamera) tracker = await startTracker().catch(() => null);
    // Back was pressed while the join or the camera prompt was pending: open nothing, keep no camera.
    if (gone()) {
      tracker?.stop();
      return;
    }
    const played: GuestMode = tracker ? "camera" : mode !== "camera" ? mode : window.matchMedia("(pointer: coarse)").matches ? "touch" : "keyboard";
    props.onJoined({ link: createGuestLink(openRoom(browserDeps, room)), mode: played, tracker });
  };

  return (
    <main className="menu room">
      <h1>Join a room</h1>
      <label htmlFor="room-code">Four letters from your friend</label>
      <input
        id="room-code"
        className="room-input"
        value={code}
        autoFocus
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        maxLength={4}
        onChange={(event) => { setCode(cleanCode(event.target.value).slice(0, 4)); }}
        onKeyDown={(event) => { if (event.key === "Enter") void join(mode === "camera"); }}
      />
      <p className="notice" role="alert">{problem}</p>
      <p className="mode-note">{MODE_TEXT[mode]}</p>
      <button disabled={busy || code.length !== 4} onClick={() => { void join(mode === "camera"); }}>
        {mode === "camera" ? "Join with my webcam" : "Join"}
      </button>
      {mode === "camera" && (
        <button disabled={busy || code.length !== 4} onClick={() => { void join(false); }}>Join with the keyboard</button>
      )}
      <button className="quiet" onClick={() => { left.current = true; props.onBack(); }}>Back</button>
    </main>
  );
}
