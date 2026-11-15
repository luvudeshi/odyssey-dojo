// Who is in the host's room: a glass shard per place under a gem, lit from inside when a fighter is there and cold
// while the place is open, with a count. The count is a polite live region of its own, not a [role="status"]: the
// room's one status line stays the screen's status (rooms-smoke.mjs reads it).
import { useProfile } from "../account/store";
import { RoomToken } from "./RoomArt";

export function RoomTags(props: { friend: boolean }) {
  const { name } = useProfile();
  return (
    <section className="mp-tags" aria-labelledby="mp-tags-title">
      <h2 id="mp-tags-title">
        Fighters in the room
        <span className="mp-tags__count" aria-live="polite">{props.friend ? "2" : "1"} of 2 fighters here</span>
      </h2>
      <ul aria-label="Fighters">
        <li className="is-here">
          <RoomToken icon="helmet" size={58} />
          <span className="mp-tag"><span><b>{name || "Odysseus"}</b> <i>(you)</i></span><small>the host</small></span>
        </li>
        <li className={props.friend ? "is-here" : "is-open"}>
          <RoomToken icon="friends" size={58} cold={!props.friend} />
          <span className="mp-tag">{props.friend ? <><b>Your friend</b><small>joined</small></> : <><b>Open place</b><small>waiting for a friend</small></>}</span>
        </li>
      </ul>
    </section>
  );
}
