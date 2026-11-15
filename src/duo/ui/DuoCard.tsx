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
    <section className="mp-card mp-card--duo">
      <RoomToken icon="helmets" size={84} className="mp-card__sticker" />
      <h2><span className="mp-kicker">Two players</span> One camera</h2>
      <p>Stand side by side in front of this computer. The game follows both of you, and each gets a hero.</p>
      <p className="mp-card__as"><small>How to stand</small><b>Left is player one</b><small>Both of you from the head to the waist in the picture, an arm's length apart.</small></p>
      <Button primary onClick={() => { props.onStart(startDuo()); }}>Play side by side</Button>
    </section>
  );
}
