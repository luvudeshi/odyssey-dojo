// Wraps a fight: webcam players calibrate first, keyboard players (tracker null) go straight in.
import { useCallback, useContext, useState } from "react";
import type { ComponentProps } from "react";
import type { Baseline } from "../core/types";
import { CameraPanelContext } from "../hud/cameraPanel";
import { Calibration } from "./Calibration";
import { FightScreen } from "./FightScreen";

export function WebcamGate(props: ComponentProps<typeof FightScreen>) {
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [skipped, setSkipped] = useState(false);
  const skip = useCallback(() => { setSkipped(true); }, []);
  const panel = useContext(CameraPanelContext);
  const outer = panel.onCamera;
  // "Use camera" on the panel of a skipped fight goes back through calibration with the running camera.
  const toCamera = useCallback(() => { setSkipped(false); outer?.(); }, [outer]);
  const body = skipped ? <FightScreen {...props} tracker={null} baseline={null} />
    : props.tracker && !baseline ? <Calibration tracker={props.tracker} onDone={setBaseline} onSkip={skip} />
    : <FightScreen {...props} baseline={baseline} />;
  return <CameraPanelContext value={{ status: panel.status, onCamera: outer ? toCamera : null }}>{body}</CameraPanelContext>;
}
