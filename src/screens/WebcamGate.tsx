// Wraps a fight: webcam players calibrate first, keyboard players (tracker null) go straight in.
import { useCallback, useContext, useState } from "react";
import type { ComponentProps } from "react";
import type { Baseline } from "../core/types";
import { CameraPanelContext } from "../hud/cameraPanel";
import { Calibration } from "./Calibration";
import { FightScreen } from "./FightScreen";

/** `onKeyboard`: "Use keyboard instead" was pressed, so the owner of the tracker can keep the next fights on the keys too. */
export function WebcamGate({ onKeyboard, ...props }: ComponentProps<typeof FightScreen> & { onKeyboard?: () => void }) {
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [skipped, setSkipped] = useState(false);
  const skip = useCallback(() => { setSkipped(true); onKeyboard?.(); }, [onKeyboard]);
  const panel = useContext(CameraPanelContext);
  const outer = panel.onCamera;
  // "Use camera" on the panel of a skipped fight goes back through calibration with the running camera.
  const toCamera = useCallback(() => { setSkipped(false); outer?.(); }, [outer]);
  const body = skipped ? <FightScreen {...props} tracker={null} baseline={null} />
    : props.tracker && !baseline ? <Calibration tracker={props.tracker} onDone={setBaseline} onSkip={skip} {...(props.onQuit ? { onBack: props.onQuit } : {})} />
    : <FightScreen {...props} baseline={baseline} />;
  return <CameraPanelContext value={{ status: panel.status, onCamera: outer ? toCamera : null }}>{body}</CameraPanelContext>;
}
