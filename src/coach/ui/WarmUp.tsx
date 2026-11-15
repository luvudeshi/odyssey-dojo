// The warm-up screen: a handful of asked-for moves before the first fight. Each one comes with a large figure doing
// the move and a live checklist (./MoveGuide), and ends with a grade, points and, when it needs work, one tip. The
// end shows the total, the best move, what to work on and what the fights will do about it.
// Thin on purpose: the timing, the frames and the grades live in ./gradedRun, the judging is the `assess` passed in.
import { useEffect, useRef, useState } from "react";
import type { PoseHistory } from "../../core/types";
import { MOVES } from "../../moves/registry";
import type { PoseTracker } from "../../pose/tracker";
import type { Assess, Assessment, WarmupStep } from "../contract";
import { tuneLine } from "../warmup";
import { highlights } from "../warmupGrades";
import type { StepFeedback } from "../warmupGrades";
import { advance, finishGraded, nobodyThere, startGraded } from "./gradedRun";
import type { GradedRun } from "./gradedRun";
import { MoveGuide } from "./MoveGuide";
import { plainName, resultLines } from "./run";
import { Button } from "../../ui/pebble";
import "./warmup.css";

/** The picture changes at most this often; the frames are collected on every animation frame. */
const SHOW_EVERY_MS = 100;

type Outcome =
  | { readonly kind: "result"; readonly assessment: Assessment; readonly feedback: readonly StepFeedback[] }
  | { readonly kind: "unseen" };

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
  /** The monster about to be fought ("Polyphemus"), for the line on what was tuned. Left out, it speaks of every enemy. */
  enemyName?: string;
  /** The line on what the fights will do for this player. Left out: `tuneLine`, which describes `tuneFor`. */
  tuned?: (assessment: Assessment) => string;
}) {
  const { tracker, steps, assess, onDone, onSkip, lines, enemyName, tuned } = props;
  const [attempt, setAttempt] = useState(0);
  const [shown, setShown] = useState<GradedRun | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const camera = useRef<HTMLDivElement>(null);
  // What the detectors are looking at, for the move guide's checklist: read by it once per animation frame, never rendered.
  const history = useRef<PoseHistory | null>(null);
  const [readHistory] = useState(() => (): PoseHistory | null => history.current);
  // The newest callbacks, so a parent that passes fresh functions on each render does not restart the run.
  const latest = useRef({ assess, onDone, onSkip });
  useEffect(() => { latest.current = { assess, onDone, onSkip }; }, [assess, onDone, onSkip]);

  useEffect(() => {
    let run = startGraded(steps, performance.now());
    let shownAt = -Infinity;
    let handle = 0;
    history.current = null;
    const loop = (): void => {
      const now = performance.now();
      const before = run;
      run = advance(run, now, tracker.read());
      history.current = run.history;
      // An empty room is not a beginner: stop as soon as the ready phase ends with nobody in view.
      if (nobodyThere(run)) {
        setOutcome({ kind: "unseen" });
        return;
      }
      if (run.phase === "done") {
        setOutcome({ kind: "result", assessment: finishGraded(run, latest.current.assess), feedback: run.feedback });
        return;
      }
      if (run.stepIndex !== before.stepIndex || run.phase !== before.phase || now - shownAt >= SHOW_EVERY_MS) {
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

  const run = shown ?? startGraded(steps, 0);
  const step = steps[run.stepIndex];
  const move = step ? MOVES.get(step.moveId) : undefined;
  const graded = run.phase === "rest" ? run.feedback[run.stepIndex] : undefined;
  const phase = outcome === null ? run.phase : outcome.kind;

  return (
    <main className="menu warmup" data-phase={phase} data-step={step?.id} data-move={outcome === null ? step?.moveId : undefined}>
      {outcome === null && (
        <>
          <div className="warmup-top">
            <p className="notice">Warm-up: copy each move so the game can see how you fight</p>
            <ol className="warmup-dots" aria-label={`Step ${String(Math.max(1, run.stepIndex + 1))} of ${String(steps.length)}`}>
              {steps.map((each, index) => (
                <li key={each.id} className={index < run.stepIndex ? "past" : index === run.stepIndex ? "now" : undefined}
                  data-tier={run.feedback[index]?.grade.tier} />
              ))}
            </ol>
            <p className="warmup-points">Points <strong>{String(run.points)}</strong></p>
          </div>
          {!step && (
            <>
              <h1 className="warmup-say" aria-live="polite">Stand where the camera sees you</h1>
              <div className="warmup-bar" role="presentation">
                <div className="warmup-bar-fill" style={{ transform: `scaleX(${String(run.phaseMs > 0 ? run.msLeft / run.phaseMs : 0)})` }} />
              </div>
              <p>Stand still, hands down. First move: {steps[0] ? moveName(steps[0].moveId) : "none"}</p>
            </>
          )}
          {step && (
            <div className="warmup-stage">
              {move
                ? <MoveGuide key={step.id} move={move} history={readHistory} size="large" msLeft={graded ? 0 : run.msLeft} msTotal={step.ms} />
                : <h1 className="warmup-say">{step.say}</h1>}
              <div className="warmup-grade" role="status" data-tier={graded?.grade.tier} hidden={!graded}>
                {graded && (
                  <>
                    <strong className="warmup-grade-word">{graded.grade.label}</strong>
                    <span className="warmup-grade-points">+{String(graded.grade.points)}</span>
                    {graded.grade.tier === "needs_work" && <span className="warmup-grade-tip">{graded.tip}</span>}
                  </>
                )}
              </div>
            </div>
          )}
          {step && <p className="warmup-asked" aria-live="polite">{String(run.stepIndex + 1)} of {String(steps.length)}: {step.say}</p>}
          <Button onClick={onSkip}>Skip</Button>
        </>
      )}
      {outcome?.kind === "result" && <Result outcome={outcome} lines={lines} line={tuned?.(outcome.assessment) ?? tuneLine(outcome.assessment, enemyName)} onDone={onDone} />}
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

/** The end of the warm-up: points, each move's grade, the best move, what to work on, and what the fights will do. */
function Result(props: {
  outcome: Extract<Outcome, { kind: "result" }>;
  lines: ((assessment: Assessment) => readonly string[]) | undefined;
  line: string;
  onDone: (assessment: Assessment) => void;
}) {
  const { outcome, lines, line, onDone } = props;
  const { assessment, feedback } = outcome;
  const told = lines?.(assessment) ?? resultLines(assessment, moveName);
  const sum = highlights(feedback);
  const name = (each: StepFeedback): string => moveName(each.step.moveId);
  return (
    <>
      <h1 className="warmup-say">Warm-up done: {String(sum.points)} points</h1>
      {told[0] && <p className="warmup-line">{told[0]}</p>}
      <ul className="warmup-marks" aria-label="Your grade for each move">
        {feedback.map((each) => (
          <li key={each.step.id} data-tier={each.grade.tier}>
            <strong>{name(each)}</strong>
            <span>{each.grade.label} +{String(each.grade.points)}</span>
          </li>
        ))}
      </ul>
      <p className="warmup-line">
        {sum.best ? <>Best move: <strong>{name(sum.best)}</strong> ({sum.best.grade.label.replace("!", "")})</> : "No move was seen this time. You can warm up again before any fight."}
      </p>
      {sum.workOn.length > 0 && (
        <section className="warmup-work" aria-label="Work on">
          <h2>Work on</h2>
          <ul>
            {sum.workOn.map((each) => <li key={each.step.id}><strong>{name(each)}:</strong> {each.tip}</li>)}
          </ul>
        </section>
      )}
      {sum.allGood && sum.sharpen && (
        <section className="warmup-work" aria-label="To sharpen">
          <h2>Every move was Good or better</h2>
          <ul>
            <li><strong>To sharpen, {name(sum.sharpen)}:</strong> {sum.sharpen.tip}</li>
          </ul>
        </section>
      )}
      <p className="warmup-line warmup-tuned">{line}</p>
      <Button primary autoFocus onClick={() => { onDone(assessment); }}>Continue</Button>
    </>
  );
}
