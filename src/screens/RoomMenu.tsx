// "Fight together": host a room or join one.
import { Button, Panel, PebbleHeading } from "../ui/pebble";
export function RoomMenu(props: { onHost: () => void; onJoin: () => void; onBack: () => void }) {
  return (
    <Panel as="main" ornament className="menu room">
      <PebbleHeading as="h1" text={"Fight together".toUpperCase()} px={48} tone="ochre" />
      <p>Two fighters, one monster. Strike the same move together to hit twice as hard.</p>
      <div className="menu__row">
        <Button primary onClick={props.onHost}>Host a room</Button>
        <Button onClick={props.onJoin}>Join a room</Button>
        <Button onClick={props.onBack}>Back</Button>
      </div>
    </Panel>
  );
}
