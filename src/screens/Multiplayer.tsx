// The Multiplayer screen in Storm and bronze (src/ui/set): a painted war camp, the kit title and Back, and the choices
// as sea-glass panels in one row: host a room, or join one by its code (a scanned link fills the code in). Opening a
// room turns the whole screen into the room (RoomHost). Rooms need the game's own server (/api/rooms).
import { useProfile } from "../account/store";
import { DuoCard } from "../duo/ui/DuoCard";
import { FaceTimeCard } from "../facetime/ui/FaceTimeCard";
import type { HostLink } from "../net/host";
import { Button } from "../ui/pebble";
import { Backdrop, SetTitle } from "../ui/set/Set";
import { RoomToken } from "./RoomArt";
import { RoomHost } from "./RoomHost";
import { RoomJoin } from "./RoomJoin";
import type { Joined } from "./RoomJoin";
import "../ui/set/screens-mp.css";

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
  return (
    <main className={`menu--rooms mp ${props.hosting ? "mp--room" : "mp--choices"}`}>
      <Backdrop src="/textures/set/storm/camp.jpg" />
      {props.hosting ? (
        <RoomHost onStart={props.onStart} onSolo={props.onSolo} onBack={props.onClose} />
      ) : (
        <>
          <button type="button" className="set-back mp-back" onClick={props.onBack}>Main menu</button>
          <div className="mp-head">
            <SetTitle>Multiplayer</SetTitle>
            <p className="set-sub">Two fighters, one monster. Strike the same move together to hit twice as hard.</p>
          </div>
          {/* One row of choices. A third card (another way to play together) goes in this list as one more <section>. */}
          <div className="mp-cards">
            <section className="set-panel mp-card">
              <RoomToken icon="host" size={76} />
              <h2><span className="set-kicker">Host a</span>Room</h2>
              <p>You get a four-letter code and a QR code for your friend.</p>
              <p className="mp-card__as"><small>Your hero name</small><b>{name || "Odysseus"}</b><small>Change it on the Account screen.</small></p>
              <Button primary onClick={props.onOpen}>Open a room</Button>
            </section>
            <section className="set-panel mp-card">
              <RoomToken icon="join" size={76} />
              <h2><span className="set-kicker">Join a</span>Room</h2>
              <p>Scanned a friend's QR code? The code is already filled in.</p>
              <RoomJoin initialCode={props.code} onJoined={props.onJoined} />
            </section>
            {/* Two players on this computer's one camera (src/duo): no room and no server. */}
            <DuoCard onStart={(link) => { props.onOpen(); props.onStart(link); }} />
            {/* The FaceTime call: always the fourth card (plain: with no server settings it is the same form and its Call
                button stays disabled, with no developer text). It comes after the join card so the room code box stays the first text box. */}
            <div className="set-panel mp-card mp-card--call">
              <RoomToken icon="friends" size={76} />
              <FaceTimeCard plain onStart={(link) => { props.onOpen(); props.onStart(link); }} />
            </div>
          </div>
        </>
      )}
    </main>
  );
}
