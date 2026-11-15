// The whole ?ai=1 page: the "How do you fight?" screen, the made fight on the normal fight screen, and its ending.
// It stands in the main menu's place (see museDoor.tsx) and knows nothing of the quest: it is given one thing, onLeave,
// which shows the main menu. It has no dispatch, no profile and no flow, so a Muse fight cannot clear a stop or record a win.
import { useEffect, useState, useSyncExternalStore } from "react";
import { log } from "../../core/log";
import type { FightingStyle } from "../../core/types";
import { CameraPanelContext } from "../../hud/cameraPanel";
import { createCameraSession } from "../../pose/cameraSession";
import { startTracker } from "../../pose/tracker";
import type { PoseTracker } from "../../pose/tracker";
import { STYLES } from "../../styles/registry";
import { MuseFight } from "./MuseFight";

// The quest's camera is private to App.tsx, and starting it moves the quest on. So this page has a camera of its own:
// off until the player presses "Use camera" on a fight's camera panel, and stopped when the page is left.
const camera = createCameraSession(startTracker);

/** The style a Muse fight is fought in: `?style=<id>` when it names one, otherwise the first. No style has been chosen on this page. */
export function museStyle(search: string, styles: readonly FightingStyle[]): FightingStyle | undefined {
  const asked = new URLSearchParams(search).get("style");
  return styles.find((style) => style.id === asked) ?? styles[0];
}

export function MuseRoute(props: { onLeave: () => void }) {
  const [style] = useState(() => museStyle(window.location.search, STYLES));
  const [tracker, setTracker] = useState<PoseTracker | null>(null);
  const status = useSyncExternalStore(camera.subscribe, camera.status, camera.status);

  // The same watchdog App runs for the quest's camera. It does nothing while this camera is off.
  useEffect(() => {
    const timer = setInterval(() => { camera.check(performance.now()); }, 250);
    return () => {
      clearInterval(timer);
      camera.stop();
    };
  }, []);

  // A camera that does not start leaves the fight on the keyboard, with "Use camera" still on its panel.
  const startCamera = (): void => {
    camera.start().then(setTracker, (error: unknown) => { log("warn", "tracker_failed", error); });
  };

  // No style at all is a broken build; the door then shows the main menu.
  if (!style) throw new Error("no fighting style for the Muse's fight");

  return (
    <CameraPanelContext value={{ status, onCamera: startCamera }}>
      <MuseFight style={style} tracker={tracker} god={null} standalone onLeave={props.onLeave} />
    </CameraPanelContext>
  );
}
