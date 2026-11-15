// Draft looks only: who is in the host's room, as two places, the host's and the friend's. Plain text, no live region:
// the room's one status line stays the screen's [role="status"].
import { useProfile } from "../account/store";
import { Icon } from "../account/ui/icons";

export function RoomSeats(props: { friend: boolean }) {
  const { name } = useProfile();
  return (
    <div className="room-seats">
      <p className="room-seats__count">{props.friend ? "2" : "1"} of 2 fighters here</p>
      <ol aria-label="Fighters in the room">
        <li className="is-here"><Icon name="helmet" /><b>{name || "You"}</b><small>Host</small></li>
        <li className={props.friend ? "is-here" : "is-empty"}><Icon name="friends" /><b>{props.friend ? "Your friend" : "Open place"}</b><small>{props.friend ? "In the room" : "Scan or type the code"}</small></li>
      </ol>
    </div>
  );
}
