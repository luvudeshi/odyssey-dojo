// Host a room, inside the Multiplayer screen's host card: asks the server for a code, shows it large with a QR code a
// phone can scan, and waits for a friend.
import { useEffect, useRef, useState } from "react";
import { toDataURL } from "qrcode";
import { createHostLink } from "../net/host";
import type { HostLink } from "../net/host";
import { createRoom, openRoom } from "../net/transport";
import { look } from "../ui/lookSwitch";
import { Button } from "../ui/pebble";
import { RoomSeats } from "./RoomSeats";
import { browserDeps, fetchLanBase } from "./roomNet";
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
      const base = reachableBase(window.location.origin, window.location.hostname, await fetchLanBase());
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

  return (
    <div className="room">
      {phase.kind === "making" && <p className="notice">Opening a room...</p>}
      {phase.kind === "failed" && (
        <>
          <p className="notice" role="alert">{phase.why}</p>
          {phase.why === ROOM_MESSAGES.unreachable && <p>Start the game server (npm run server) to host a room, or play alone.</p>}
          <Button onClick={props.onSolo}>Play alone</Button>
        </>
      )}
      {phase.kind === "open" && (
        <>
          <div className="room-invite">
            <div>
              <p>Room code</p>
              <div className="room-code" aria-label={`Room code ${phase.code.split("").join(" ")}`}>{phase.code}</div>
              <p className="room-url">{phase.url}</p>
            </div>
            <img className="room-qr" src={phase.qr} alt="QR code to join this room" data-join-url={phase.url} width={170} height={170} />
          </div>
          {look && <RoomSeats friend={friend} />}
          <p className="notice" role="status">{friend ? "A friend has joined." : "Waiting for a friend..."}</p>
          <Button
            primary
            disabled={!friend}
            onClick={() => { const current = link.current; if (current) props.onStart(current); }}
          >
            Start
          </Button>
        </>
      )}
      <Button onClick={leave}>Close the room</Button>
    </div>
  );
}
