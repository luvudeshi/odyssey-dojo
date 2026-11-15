// Who is in the host's room: a name tag per fighter under a round token, and a count. Plain text with a polite live
// region of its own, not a [role="status"]: the room's one status line stays the screen's status (rooms-smoke.mjs).
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
        <li>
          <RoomToken icon="helmet" size={60} />
          <span className="mp-tag"><span><b>{name || "Odysseus"}</b> <i>(you)</i></span><small>the host</small></span>
        </li>
        {props.friend && (
          <li>
            <RoomToken icon="friends" size={60} />
            <span className="mp-tag"><b>Your friend</b><small>joined</small></span>
          </li>
        )}
      </ul>
    </section>
  );
}
