// Before a webcam fight: stand still, arms down, for 3 seconds. The Baseline is the stance held at the end.
import { useEffect, useState } from "react";
import type { Baseline } from "../core/types";
import { COUNTDOWN_MS, countdownStep, presenceAt } from "../pose/presence";
import { EMPTY_HISTORY, baselineOf, pushFrame } from "../pose/signals";
import type { PoseTracker } from "../pose/tracker";

export function Calibration(props: { tracker: PoseTracker; onDone: (baseline: Baseline) => void }) {
  const { tracker, onDone } = props;
  const [elapsed, setElapsed] = useState(0);
  const [hint, setHint] = useState("");

  useEffect(() => {
    let history = EMPTY_HISTORY;
    let ms = 0;
    let last = performance.now();
    let handle = 0;
    const tick = (now: number): void => {
      const frame = tracker.read();
      if (frame) history = pushFrame(history, frame);
      const presence = presenceAt(history, now);
      ms = countdownStep(ms, presence.ok, Math.min(now - last, 100));
      last = now;
      setElapsed(ms);
      setHint(presence.ok ? "" : presence.reason);
      if (ms >= COUNTDOWN_MS && history.frames.length > 0) {
        onDone(baselineOf(history.frames));
        return;
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(handle); };
  }, [tracker, onDone]);

  return (
    <div className="overlay">
      <h1>Stand still, arms down</h1>
      <p className="prompt-word">{Math.max(1, Math.ceil((COUNTDOWN_MS - elapsed) / 1000))}</p>
      <p className="notice">{hint ? hint.charAt(0).toUpperCase() + hint.slice(1) : "Hold it..."}</p>
    </div>
  );
}
