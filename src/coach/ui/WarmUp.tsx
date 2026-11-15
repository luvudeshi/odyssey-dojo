// The warm-up screen: about 15 seconds of asked-for moves at the very start of the game, then what the game saw.
// Thin on purpose: the timing and the frames live in ./run, the judging is the `assess` function passed in.
import { useEffect, useRef, useState } from "react";
import { MOVES } from "../../moves/registry";
import type { PoseTracker } from "../../pose/tracker";
import type { Assess, Assessment, WarmupStep } from "../contract";
import { finish, nobodySeen, plainName, resultLines, startRun, tick, totalMs } from "./run";
import type { RunState } from "./run";
import { Button } from "../../ui/pebble";
import "./warmup.css";

/** The picture changes at most this often; the frames are collected on every animation frame. */
const SHOW_EVERY_MS = 100;

type Outcome = { readonly kind: "result"; readonly assessment: Assessment } | { readonly kind: "unseen" };

function moveName(moveId: string): string {
  return MOVES.get(moveId)?.name ?? plainName(moveId);
}

/**
 * `steps` must keep its identity between renders (a module constant): a new array starts the run again.
 * The camera is left running when this screen goes away.
 */
export function WarmUp(props: {
  tracker: PoseTracker;
  steps: readonly WarmupStep[];
  assess: Assess;
  onDone: (assessment: Assessment) => void;
  onSkip: () => void;
  lines?: (assessment: Assessment) => readonly string[];
}) {
  const { tracker, steps, assess, onDone, onSkip, lines } = props;
  const [attempt, setAttempt] = useState(0);
  const [shown, setShown] = useState<RunState | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const camera = useRef<HTMLDivElement>(null);
  // The newest callbacks, so a parent that passes fresh functions on each render does not restart the run.
  const latest = useRef({ assess, onDone, onSkip });
  useEffect(() => { latest.current = { assess, onDone, onSkip }; }, [assess, onDone, onSkip]);

  useEffect(() => {
    let run = startRun(steps, performance.now());
    let shownAt = -Infinity;
    let handle = 0;
    const loop = (): void => {
      const now = performance.now();
      const before = run;
      run = tick(run, now, tracker.read());
      // An empty room is not a beginner: stop as soon as the ready phase ends with nobody in view.
      if (run.phase !== "ready" && nobodySeen(run)) {
        setOutcome({ kind: "unseen" });
        return;
      }
      if (run.phase === "done") {
        setOutcome({ kind: "result", assessment: finish(run, latest.current.assess) });
        return;
      }
      if (run.stepIndex !== before.stepIndex || now - shownAt >= SHOW_EVERY_MS) {
        shownAt = now;
        setShown(run);
      }
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(handle); };
  }, [tracker, steps, attempt]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        latest.current.onSkip();
      } else if (event.key === "Enter" && outcome?.kind === "result") {
        // Without this a focused Continue button would also click, and the game would move on twice.
        event.preventDefault();
        latest.current.onDone(outcome.assessment);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, [outcome]);

  useEffect(() => {
    const holder = camera.current;
    if (!holder) return;
    holder.append(tracker.video);
    return () => { tracker.video.remove(); };
  }, [tracker]);

  const again = (): void => {
    setOutcome(null);
    setShown(null);
    setAttempt((count) => count + 1);
  };

  const run = shown ?? startRun(steps, 0);
  const step = steps[run.stepIndex];
  const told = outcome?.kind === "result" ? (lines?.(outcome.assessment) ?? resultLines(outcome.assessment, moveName)) : [];

  return (
    <main className="menu warmup">
      <p className="notice">Warm-up: {String(Math.round(totalMs(steps, 0) / 1000))} seconds so the game can see how you move</p>
      {outcome === null && (
        <>
          <h1 className="warmup-say" aria-live="polite">{step ? step.say : "Stand where the camera sees your whole body"}</h1>
          <div className="warmup-bar" role="presentation">
            <div className="warmup-bar-fill" style={{ transform: `scaleX(${String(run.phaseMs > 0 ? run.msLeft / run.phaseMs : 0)})` }} />
          </div>
          <ol className="warmup-dots" aria-label={`Step ${String(Math.max(1, run.stepIndex + 1))} of ${String(steps.length)}`}>
            {steps.map((each, index) => (
              <li key={each.id} className={index < run.stepIndex ? "past" : index === run.stepIndex ? "now" : undefined} />
            ))}
          </ol>
          <p>{step ? moveName(step.moveId) : "Get ready"}, {String(Math.ceil(run.totalMsLeft / 1000))} seconds left</p>
          <Button onClick={onSkip}>Skip</Button>
        </>
      )}
      {outcome?.kind === "result" && (
        <>
          <h1 className="warmup-say">{told[0] ?? "Warm-up done"}</h1>
          {told.slice(1).map((line) => <p key={line} className="warmup-line">{line}</p>)}
          <Button primary autoFocus onClick={() => { onDone(outcome.assessment); }}>Continue</Button>
        </>
      )}
      {outcome?.kind === "unseen" && (
        <>
          <h1 className="warmup-say">I can't see you</h1>
          <p className="warmup-line">Step back until your head and shoulders are in the picture, then try again.</p>
          <Button primary autoFocus onClick={again}>Try again</Button>
          <Button onClick={onSkip}>Skip</Button>
        </>
      )}
      <div className="warmup-camera" ref={camera} />
    </main>
  );
}
