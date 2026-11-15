// Before a webcam fight: stand still, arms down, for 3 seconds. The Baseline is the stance held at the end.
import { useEffect, useRef, useState } from "react";
import type { Baseline, PoseFrame } from "../core/types";
import { CameraView } from "../hud/CameraView";
import { calibrationNeedsHelp } from "../pose/escape";
import { sentence } from "../pose/cameraError";
import { COUNTDOWN_MS, countdownStep, presenceAt } from "../pose/presence";
import { EMPTY_HISTORY, baselineOf, pushFrame } from "../pose/signals";
import type { PoseTracker } from "../pose/tracker";
import "./calibration.css";

export function Calibration(props: { tracker: PoseTracker; onDone: (baseline: Baseline) => void; onSkip: () => void }) {
  const { tracker, onDone, onSkip } = props;
  const [elapsed, setElapsed] = useState(0);
  const [hint, setHint] = useState("");
  const [stuck, setStuck] = useState(false);
  const [seen, setSeen] = useState(false);
  const poseRef = useRef<PoseFrame | null>(null);

  useEffect(() => {
    let history = EMPTY_HISTORY;
    let ms = 0;
    const start = performance.now();
    let last = start;
    let handle = 0;
    const tick = (now: number): void => {
      const frame = tracker.read();
      if (frame) {
        poseRef.current = frame;
        history = pushFrame(history, frame);
      }
      const presence = presenceAt(history, now);
      ms = countdownStep(ms, presence.ok, Math.min(now - last, 100));
      last = now;
      setElapsed(ms);
      setHint(presence.ok ? "" : sentence(presence.reason));
      setSeen(presence.ok);
      setStuck(calibrationNeedsHelp(now - start, presence.ok));
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
    <div className="overlay calibration">
      <h1>{stuck ? "Step back: I need to see your head and shoulders" : "Stand still, arms down"}</h1>
      <div className="calibration-cam">
        <CameraView tracker={tracker} poseRef={poseRef} paused={false} />
        <div className="calibration-guide" data-ok={seen} aria-hidden="true"><span>Head and shoulders inside the frame</span></div>
      </div>
      <p className="prompt-word">{Math.max(1, Math.ceil((COUNTDOWN_MS - elapsed) / 1000))}</p>
      <p className="notice">{hint || "Hold it..."}</p>
      <button className={stuck ? undefined : "quiet"} onClick={onSkip}>Use keyboard instead</button>
    </div>
  );
}
