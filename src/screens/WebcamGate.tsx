// Wraps a fight: webcam players calibrate first, keyboard players (tracker null) go straight in.
import { useState } from "react";
import type { ComponentProps } from "react";
import type { Baseline } from "../core/types";
import { Calibration } from "./Calibration";
import { FightScreen } from "./FightScreen";

export function WebcamGate(props: ComponentProps<typeof FightScreen>) {
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  if (props.tracker && !baseline) return <Calibration tracker={props.tracker} onDone={setBaseline} />;
  return <FightScreen {...props} baseline={baseline} />;
}
