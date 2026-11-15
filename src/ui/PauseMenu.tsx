// Shown over a paused fight. Esc is handled by the fight (see pauseState.ts), so it works from any focus.
import { Dialog } from "./Dialog";
import { Button } from "./pebble";
import { SettingsPanel } from "./SettingsPanel";
import type { PauseView } from "./pauseState";

export function PauseMenu(props: {
  view: Exclude<PauseView, "off">;
  onResume: () => void;
  onRestart: () => void;
  onSettings: () => void;
  onBackToMenu: () => void;
  onQuit: () => void;
}) {
  if (props.view === "settings") return <SettingsPanel onClose={props.onBackToMenu} />;
  return (
    <Dialog title="Paused">
      <div className="ui-menu">
        <Button onClick={props.onResume}>Resume</Button>
        <Button onClick={props.onRestart}>Restart fight</Button>
        <Button onClick={props.onSettings}>Settings</Button>
        <Button onClick={props.onQuit}>Quit to map</Button>
      </div>
    </Dialog>
  );
}
