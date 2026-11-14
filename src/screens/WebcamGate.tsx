// Wraps a fight: webcam players calibrate first, keyboard players (tracker null) go straight in.
import { useCallback, useState } from "react";
import type { ComponentProps } from "react";
import type { Baseline } from "../core/types";
import { Calibration } from "./Calibration";
import { FightScreen } from "./FightScreen";

export function WebcamGate(props: ComponentProps<typeof FightScreen>) {
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [skipped, setSkipped] = useState(false);
  const skip = useCallback(() => { setSkipped(true); }, []);
  if (skipped) return <FightScreen {...props} tracker={null} baseline={null} />;
  if (props.tracker && !baseline) return <Calibration tracker={props.tracker} onDone={setBaseline} onSkip={skip} />;
  return <FightScreen {...props} baseline={baseline} />;
}
