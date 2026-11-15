// The Multiplayer screen: host a room or join one, side by side. Hosting shows a four-letter code and a QR code a friend
// scans; joining takes the typed code, or the code a scanned link filled in. Rooms need the game's own server (/api/rooms).
import { Icon } from "../account/ui/icons";
import type { HostLink } from "../net/host";
import { Button, Panel, PebbleHeading } from "../ui/pebble";
import { RoomHost } from "./RoomHost";
import { RoomJoin } from "./RoomJoin";
import type { Joined } from "./RoomJoin";
import "./account.css";
import "./multiplayer.css";

export function Multiplayer(props: {
  /** True once "Open a room" was pressed: the host card holds the live room. */
  hosting: boolean;
  /** The code from a scanned link, or "". */
  code: string;
  onOpen: () => void;
  onStart: (link: HostLink) => void;
  onSolo: () => void;
  /** The host closed the room: back to this screen with no room open. */
  onClose: () => void;
  onJoined: (joined: Joined) => void;
  onBack: () => void;
}) {
  return (
    <Panel as="main" ornament className="menu menu--rooms">
      <PebbleHeading as="h1" text="Multiplayer" px={48} tone="ochre" />
      <p className="lead">Two fighters, one monster. Strike the same move together to hit twice as hard.</p>
      <div className="rooms">
        <section className="acc-card rooms__card">
          <h2><Icon name="host" className="acc-card__icon" />Host a room</h2>
          {props.hosting ? (
            <RoomHost onStart={props.onStart} onSolo={props.onSolo} onBack={props.onClose} />
          ) : (
            <>
              <p>You get a four-letter code and a QR code. Your friend scans it with a phone, or types the code on another computer.</p>
              <Button primary onClick={props.onOpen}>Open a room</Button>
            </>
          )}
        </section>
        <section className="acc-card rooms__card">
          <h2><Icon name="join" className="acc-card__icon" />Join a room</h2>
          <p>Scanned a friend's QR code? The code is already filled in. Otherwise type it here.</p>
          <RoomJoin initialCode={props.code} onJoined={props.onJoined} />
        </section>
      </div>
      {!props.hosting && <Button onClick={props.onBack}><Icon name="house" className="acc-btn__icon" />Main menu</Button>}
    </Panel>
  );
}
