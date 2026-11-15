// Host a room. Once the server gives a code the whole screen becomes the room: the title, the code large in a panel
// beside the QR card with the join address under it, the fighters' places, and one bar with the host's controls. rooms-smoke.mjs reads this screen: the code in [aria-label^="Room code"], the
// join link on img[data-join-url], and "Start" as the button right after the [role="status"] line. Keep all three.
import { useEffect, useRef, useState } from "react";
import { toDataURL } from "qrcode";
import { createHostLink } from "../net/host";
import type { HostLink } from "../net/host";
import { createRoom, openRoom } from "../net/transport";
import { Button } from "../ui/pebble";
import { SetTitle } from "../ui/set/Set";
import { RoomTags } from "./RoomTags";
import { browserDeps, fetchLanBase, LAN_BASE_TIMEOUT_MS } from "./roomNet";
import { joinUrl, reachableBase, roomMessage } from "./roomUrl";

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
        setPhase({ kind: "failed", why: roomMessage(room) });
        return;
      }
      link.current = createHostLink(openRoom(browserDeps, room), true);
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
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") leaveRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, []);
  // Fighting alone from an open room: close the room first, so no friend can walk into it afterwards.
  const solo = (): void => {
    left.current = true;
    link.current?.close();
    props.onSolo();
  };

  const back = <button type="button" className="set-back mp-back" onClick={leave}>{phase.kind === "open" ? "Close the room" : "Back"}</button>;

  if (phase.kind !== "open") {
    return (
      <>
        {back}
        <div className="room mp-wait">
          <SetTitle>Multiplayer</SetTitle>
          {phase.kind === "making" && <p className="notice">Opening a room...</p>}
          {phase.kind === "failed" && (
            <>
              <p className="notice" role="alert">{phase.why}</p>
              <Button onClick={props.onSolo}>Play alone</Button>
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {back}
      <div className="room mp-lobby">
        <div className="mp-lobby__head">
          <SetTitle kicker="Your">Room</SetTitle>
          <p className="set-sub">A friend scans the card with a phone, or types the code on another computer.</p>
        </div>
        <div className="mp-lobby__row">
          <section className="set-panel mp-code">
            <p className="mp-code__kicker">The code is</p>
            <div className="room-code" aria-label={`Room code ${phase.code.split("").join(" ")}`}>{phase.code}</div>
            <p className="mp-code__note">Type it on another computer</p>
          </section>
          <section className="set-panel mp-qr">
            <img className="room-qr" src={phase.qr} alt="QR code to join this room" data-join-url={phase.url} width={150} height={150} />
            <div className="mp-qr__text">
              <b>Scan to enter</b>
            </div>
            <p className="room-url">{phase.url.split(/(?<=[/.?=])/).map((part, at) => <span key={at}>{part}<wbr /></span>)}</p>
          </section>
        </div>
        <RoomTags friend={friend} />
        <div className="set-panel mp-bar" aria-label="Room controls" role="group">
          <p className="notice mp-bar__status" role="status" data-friend={friend ? "here" : "waiting"}>{friend ? "A friend has joined." : "Waiting for a friend..."}</p>
          <Button primary disabled={!friend} onClick={() => { const current = link.current; if (current) props.onStart(current); }}>Start</Button>
          <Button onClick={solo}>Play alone</Button>
        </div>
      </div>
    </>
  );
}
