import { useEffect, useState } from "react";
import { assessWarmup, summary, WARMUP_STEPS } from "../coach";
import type { Assessment } from "../coach";
import { WarmUp } from "../coach/ui/WarmUp";
import type { EnemySpec } from "../core/types";
import type { PoseTracker } from "../pose/tracker";
import { Button, PebbleHeading, Panel } from "../ui/pebble";
import { holdFastLine } from "../enemies/wording";
import { narrateIntro } from "./hookups";

/**
 * The screen before a fight. With a camera it also offers the optional 15-second warm-up; its result goes up through
 * `onWarmed` and tunes the monsters. Skipping or Escape returns here.
 */
export function IntroScreen(props: {
  enemy: EnemySpec;
  tracker?: PoseTracker | null;
  assessment?: Assessment | null;
  onWarmed?: (assessment: Assessment) => void;
  onBegin: () => void;
  onBack: () => void;
}) {
  const { enemy, tracker = null, assessment = null, onWarmed, onBegin, onBack } = props;
  const [warming, setWarming] = useState(false);
  useEffect(() => narrateIntro(enemy.id), [enemy.id]);
  if (warming && tracker) {
    return (
      <WarmUp
        tracker={tracker}
        steps={WARMUP_STEPS}
        assess={assessWarmup}
        lines={summary}
        onDone={(found) => { onWarmed?.(found); setWarming(false); }}
        onSkip={() => { setWarming(false); }}
      />
    );
  }
  return (
    <Panel as="main" ornament className="menu menu--intro">
      {enemy.place && <p className="notice intro-place">{enemy.place}{enemy.book ? `, Book ${String(enemy.book)}` : ""}</p>}
      <PebbleHeading as="h1" text={enemy.name.toUpperCase()} px={48} tone="ochre" />
      <p className="verse">{enemy.title}. {holdFastLine(enemy.id)}</p>
      <div className="menu__row">
        <Button primary autoFocus onClick={onBegin}>Face {enemy.name}</Button>
        {tracker && !assessment && <Button onClick={() => { setWarming(true); }}>Warm up (15 s)</Button>}
        <Button onClick={onBack}>Back to the map</Button>
      </div>
      {assessment && <p className="notice">{summary(assessment)[0]}</p>}
    </Panel>
  );
}
