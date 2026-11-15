// Host a room. Once the server gives a code the whole screen becomes the room: the code large in a tall frame on the
// left; on the right the title, the QR on a small tilted card with the join address under it, the fighters' name tags,
// and one bar with the host's controls. rooms-smoke.mjs reads this screen: the code in [aria-label^="Room code"], the
// join link on img[data-join-url], and "Start" as the button right after the [role="status"] line. Keep all three.
import { useEffect, useRef, useState } from "react";
import { toDataURL } from "qrcode";
import { createHostLink } from "../net/host";
import type { HostLink } from "../net/host";
import { createRoom, openRoom } from "../net/transport";
import { Button } from "../ui/pebble";
import { CodeFrame } from "./RoomArt";
import { RoomTags } from "./RoomTags";
import { browserDeps, fetchLanBase, LAN_BASE_TIMEOUT_MS } from "./roomNet";
import { ROOM_MESSAGES, joinUrl, reachableBase } from "./roomUrl";

type Phase =
  | { readonly kind: "making" }
  | { readonly kind: "failed"; readonly why: string }
  | { readonly kind: "open"; readonly code: string; readonly url: string; readonly qr: string };

export function RoomHost(props: { onStart: (link: HostLink) => void; onSolo: () => void; onBack: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: "making" });
  const [friend, setFriend] = useState(false);
  const link = useRef<HostLink | null>(null);
  const made = useRef(false);
  const left = useRef(false);

  useEffect(() => {
    // StrictMode runs effects twice in development; one room is enough.
    if (made.current) return;
    made.current = true;
    void (async () => {
      const room = await createRoom(browserDeps);
      if (left.current) return;
      if (typeof room === "string") {
        setPhase({ kind: "failed", why: ROOM_MESSAGES[room] ?? "" });
        return;
      }
      link.current = createHostLink(openRoom(browserDeps, room));
      const base = reachableBase(window.location.origin, window.location.hostname, await fetchLanBase(LAN_BASE_TIMEOUT_MS));
      const url = joinUrl(base, room.code);
      setPhase({ kind: "open", code: room.code, url, qr: await toDataURL(url, { margin: 1, width: 360 }) });
    })();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => { setFriend(link.current?.guestHere() ?? false); }, 250);
    return () => { window.clearInterval(timer); };
  }, []);

  const leave = (): void => {
    left.current = true;
    link.current?.close();
    props.onBack();
  };
  // Fighting alone from an open room: close the room first, so no friend can walk into it afterwards.
  const solo = (): void => {
    left.current = true;
    link.current?.close();
    props.onSolo();
  };

  if (phase.kind !== "open") {
    return (
      <div className="room mp-wait">
        <h1 className="mp-burn">Multiplayer</h1>
        {phase.kind === "making" && <p className="notice">Opening a room...</p>}
        {phase.kind === "failed" && (
          <>
            <p className="notice" role="alert">{phase.why}</p>
            {phase.why === ROOM_MESSAGES.unreachable && <p>Start the game server (npm run server) to host a room, or play alone.</p>}
            <Button onClick={props.onSolo}>Play alone</Button>
          </>
        )}
        <Button onClick={leave}>Close the room</Button>
      </div>
    );
  }

  return (
    <div className="room mp-lobby">
      <div className="mp-lobby__side">
        <CodeFrame>
          <p className="mp-frame__kicker">Friend, the code is</p>
          <div className="room-code" aria-label={`Room code ${phase.code.split("").join(" ")}`}>{phase.code}</div>
          <p className="mp-frame__note">Type it on another computer</p>
        </CodeFrame>
      </div>
      <div className="mp-lobby__main">
        <div className="mp-lobby__head">
          <hgroup className="mp-lobby__titles">
            <p className="mp-kicker">Your</p>
            <h1 className="mp-burn mp-burn--room">Room</h1>
            <p className="mp-lobby__enter">A friend scans the card with a phone, or types the code on another computer.</p>
          </hgroup>
          <div className="mp-qr">
            <div className="mp-qr__card">
              <img className="room-qr" src={phase.qr} alt="QR code to join this room" data-join-url={phase.url} width={150} height={150} />
              <span className="mp-qr__caption">Scan to enter</span>
            </div>
            <p className="room-url">{phase.url}</p>
          </div>
        </div>
        <RoomTags friend={friend} />
        <div className="mp-bar" aria-label="Room controls" role="group">
          <p className="notice mp-bar__status" role="status" data-friend={friend ? "here" : "waiting"}>{friend ? "A friend has joined." : "Waiting for a friend..."}</p>
          <Button primary disabled={!friend} onClick={() => { const current = link.current; if (current) props.onStart(current); }}>Start</Button>
          <Button onClick={solo}>Play alone</Button>
          <Button onClick={leave}>Close the room</Button>
        </div>
      </div>
    </div>
  );
}
