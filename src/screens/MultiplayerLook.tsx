// Draft looks only (?look=a|b|c): the Multiplayer screen rebuilt on the room-lobby pattern the owner liked. The first
// view is two doors, host and join, each one clear job with one big button; once a room is open the join door goes and
// the host's room fills the screen: the code large, the QR beside it, and who is in the room. Same props and the same
// RoomHost and RoomJoin as the plain screen; each look's CSS file sets the layout and ornament. Delete with the looks.
import { Icon } from "../account/ui/icons";
import { Button, Panel, PebbleHeading } from "../ui/pebble";
import type { Multiplayer } from "./Multiplayer";
import { RoomHost } from "./RoomHost";
import { RoomJoin } from "./RoomJoin";
import "./account.css";
import "./multiplayer.css";
import "./mp-look.css";
import "./mp-a.css";
import "./mp-b.css";
import "./mp-c.css";

export function MultiplayerLook(props: Parameters<typeof Multiplayer>[0]) {
  return (
    <Panel as="main" ornament className={`menu menu--rooms mp ${props.hosting ? "mp--room" : "mp--doors"}`}>
      <header className="mp__head">
        <PebbleHeading as="h1" text="Multiplayer" px={60} tone="ochre" />
        <p className="lead">Two fighters, one monster. Strike the same move together to hit twice as hard.</p>
      </header>
      {props.hosting ? (
        <section className="mp__room" aria-label="Your room">
          <RoomHost onStart={props.onStart} onSolo={props.onSolo} onBack={props.onClose} />
        </section>
      ) : (
        <div className="mp__doors">
          <section className="mp__door mp__door--host">
            <span className="mp__sigil" aria-hidden="true"><Icon name="host" /></span>
            <h2>Host a room</h2>
            <p>You get a four-letter code and a QR code. Your friend scans it with a phone, or types the code on another computer.</p>
            <Button primary onClick={props.onOpen}>Open a room</Button>
          </section>
          <span className="mp__or" aria-hidden="true">or</span>
          <section className="mp__door mp__door--join">
            <span className="mp__sigil" aria-hidden="true"><Icon name="join" /></span>
            <h2>Join a room</h2>
            <p>Scanned a friend's QR code? The code is already filled in. Otherwise type it here.</p>
            <RoomJoin initialCode={props.code} onJoined={props.onJoined} />
          </section>
        </div>
      )}
      {!props.hosting && <Button onClick={props.onBack}><Icon name="house" className="acc-btn__icon" />Main menu</Button>}
    </Panel>
  );
}
