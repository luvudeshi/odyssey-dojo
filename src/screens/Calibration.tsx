// Before a webcam fight: stand still, arms down, for 3 seconds. The Baseline is the stance held at the end.
import { useEffect, useRef, useState } from "react";
import type { Baseline, PoseFrame } from "../core/types";
import { CameraView } from "../hud/CameraView";
import { calibrationNeedsHelp } from "../pose/escape";
import { sentence } from "../pose/cameraError";
import { COUNTDOWN_MS, countdownStep, presenceAt } from "../pose/presence";
import { EMPTY_HISTORY, baselineOf, pushFrame } from "../pose/signals";
import type { PoseTracker } from "../pose/tracker";
import { Button } from "../ui/pebble";
import { Backdrop, SetTitle } from "../ui/set/Set";
import "../ui/set/screens-flow.css";
import "./calibration.css";

export function Calibration(props: { tracker: PoseTracker; onDone: (baseline: Baseline) => void; onSkip: () => void; onBack?: () => void }) {
  const { tracker, onDone, onSkip, onBack } = props;
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
    <main className="menu flow calibration">
      <Backdrop src="/textures/set/storm/camp.jpg" />
      {onBack && <button type="button" className="set-back" onClick={onBack}>Back</button>}
      <SetTitle>{stuck ? "Step back: I need to see your head and shoulders" : "Stand still, arms down"}</SetTitle>
      <div className="set-panel calibration-panel">
        <div className="calibration-cam">
          <CameraView tracker={tracker} poseRef={poseRef} paused={false} />
          <div className="calibration-guide" data-ok={seen} aria-hidden="true"><span>Head and shoulders inside the frame</span></div>
        </div>
        <div className="calibration-side">
          <p className="countdown">{Math.max(1, Math.ceil((COUNTDOWN_MS - elapsed) / 1000))}</p>
          <p className="notice">{hint || "Hold it..."}</p>
          <Button primary={stuck} onClick={onSkip}>Use keyboard instead</Button>
        </div>
      </div>
    </main>
  );
}
