// A round bronze coin with a line icon, the mark on the Multiplayer cards and the fighters' places. `cold` is the dark
// sea-glass coin of a place nobody holds yet.
import { Icon, type IconName } from "../account/ui/icons";

export function RoomToken(props: { icon: IconName; size: number; cold?: boolean; className?: string }) {
  return (
    <span className={`mp-token ${props.cold ? "mp-token--cold" : ""} ${props.className ?? ""}`} style={{ width: props.size, height: props.size }} aria-hidden="true">
      <Icon name={props.icon} className="mp-token__icon" />
    </span>
  );
}
