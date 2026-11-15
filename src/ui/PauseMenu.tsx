// Shown over a paused fight. Esc is handled by the fight (see pauseState.ts), so it works from any focus.
import { Dialog } from "./Dialog";
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
        <button className="ui-button" onClick={props.onResume}>Resume</button>
        <button className="ui-button" onClick={props.onRestart}>Restart fight</button>
        <button className="ui-button" onClick={props.onSettings}>Settings</button>
        <button className="ui-button danger" onClick={props.onQuit}>Quit to map</button>
      </div>
    </Dialog>
  );
}
