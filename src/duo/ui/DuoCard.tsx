// "Two players, one camera": a choice for the Multiplayer screen, beside Host a room, Join a room and FaceTime.
// Two people stand side by side in front of this computer's camera; the game follows both bodies and each gets a
// figure of their own. No room, no code and no server: the second player is read from the same picture.
//
// Mounted on the Multiplayer screen as
//   <DuoCard onStart={(link) => { props.onOpen(); props.onStart(link); }} />
// The flow must pass through `host` first (onOpen), or it drops the link and the fight starts with one player.
import type { HostLink } from "../../net/host";
import { MOVES } from "../../moves/registry";
import { RoomToken } from "../../screens/RoomArt";
import { Button } from "../../ui/pebble";
import { duoCamera } from "../duoCamera";
import { createDuoLink } from "../duoLink";

/** Turns the second body on and makes the link that brings it into the fight. */
export function startDuo(): HostLink {
  duoCamera.setOn(true);
  return createDuoLink(duoCamera, MOVES);
}

export function DuoCard(props: { onStart: (link: HostLink) => void }) {
  return (
    <section className="set-panel mp-card mp-card--duo">
      <RoomToken icon="helmets" size={76} />
      <h2><span className="set-kicker">Two players</span>One camera</h2>
      <p>Stand side by side in front of this computer, an arm's length apart, both in the picture from the head to the waist.</p>
      <p className="mp-card__as"><small>Who is who</small><b>Right is the blue hero</b><small>When the monster attacks, both of you must defend.</small></p>
      <Button primary onClick={() => { props.onStart(startDuo()); }}>Play side by side</Button>
    </section>
  );
}
