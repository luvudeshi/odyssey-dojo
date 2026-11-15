// The Multiplayer screen, laid out like the owner's Dance Fantasy rooms, in the Obsidian Rift look of the fight HUD.
// A bar along the top (the game's name, the hero, the way back), then the choices as tall glass slabs in one row: host a
// room, or join one by its code (a scanned link fills the code in). Opening a room turns the whole screen into the room
// (RoomHost). Rooms need the game's own server (/api/rooms).
import { useProfile } from "../account/store";
import { Icon } from "../account/ui/icons";
import { FaceTimeCard } from "../facetime/ui/FaceTimeCard";
import type { HostLink } from "../net/host";
import { useEffect } from "react";
import { Button, Panel } from "../ui/pebble";
import { RoomToken } from "./RoomArt";
import { RoomHost } from "./RoomHost";
import { RoomJoin } from "./RoomJoin";
import type { Joined } from "./RoomJoin";
import { installRiftHall } from "./riftHall";
import "./account.css";
import "./multiplayer.css";

/** Where the embers rise from, in % of the screen's width. */
const EMBERS = [6, 14, 23, 31, 42, 55, 63, 71, 80, 88, 95] as const;

export function Multiplayer(props: {
  /** True once "Open a room" was pressed: the screen is the live room. */
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
  const { name } = useProfile();
  useEffect(() => { installRiftHall(); }, []);
  return (
    <Panel as="main" className={`menu menu--rooms mp ${props.hosting ? "mp--room" : "mp--choices"}`}>
      <div className="mp-embers" aria-hidden="true">{EMBERS.map((at) => <i key={at} style={{ left: `${String(at)}%` }} />)}</div>
      <header className="mp-top">
        <span className="mp-top__brand">Odyssey <b>Dojo</b></span>
        <span className="mp-top__hero"><Icon name="helmet" />{name || "Odysseus"}</span>
        {!props.hosting && <Button className="mp-top__back" onClick={props.onBack}><Icon name="house" className="acc-btn__icon" />Main menu</Button>}
      </header>
      {props.hosting ? (
        <RoomHost onStart={props.onStart} onSolo={props.onSolo} onBack={props.onClose} />
      ) : (
        <>
          <div className="mp-head">
            <h1 className="mp-burn">Multiplayer</h1>
            <p className="lead">Two fighters, one monster. Strike the same move together to hit twice as hard.</p>
          </div>
          {/* One row of choices. A third card (another way to play together) goes in this list as one more <section>. */}
          <div className="mp-cards">
            <section className="mp-card">
              <RoomToken icon="host" size={84} className="mp-card__sticker" />
              <h2><span className="mp-kicker">Host a</span> Room</h2>
              <p>You get a four-letter code and a QR code for your friend.</p>
              <p className="mp-card__as"><small>Your hero name</small><b>{name || "Odysseus"}</b><small>Change it on the Account screen.</small></p>
              <Button primary onClick={props.onOpen}>Open a room</Button>
            </section>
            <section className="mp-card mp-card--ice">
              <RoomToken icon="join" size={84} className="mp-card__sticker mp-token--ice" />
              <h2><span className="mp-kicker">Join a</span> Room</h2>
              <p>Scanned a friend's QR code? The code is already filled in.</p>
              <RoomJoin initialCode={props.code} onJoined={props.onJoined} />
            </section>
            {/* The FaceTime call: drawn only when the server has it set up (the card returns nothing otherwise, and the
                slab hides with it). It comes after the join card so the room code box stays the first text box. */}
            <div className="mp-card mp-card--call">
              <RoomToken icon="friends" size={84} className="mp-card__sticker" />
              <FaceTimeCard onStart={(link) => { props.onOpen(); props.onStart(link); }} />
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}
