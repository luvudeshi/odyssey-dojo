// The training dojo screen (issue #172): one move at a time. A big outline of somebody doing the move loops on the
// left with a live checklist of what the camera sees; on the right the move's name, how to do it, a dot per
// repetition and the points so far. After each repetition the grade is shown large with its points and one tip.
// At the end: the total, the highlights, and what to work on with a line on how.
// Thin on purpose: the session is the pure state machine in ../dojo, ticked once per animation frame from a ref.
// React renders only when the phase, the move or the repetition changes; the time bar is written straight to the page.
import { useEffect, useMemo, useRef, useState } from "react";
import type { FightingStyle, PoseFrame, PoseHistory } from "../../core/types";
import { ENEMIES } from "../../enemies/registry";
import { MOVES } from "../../moves/registry";
import { STYLES } from "../../styles/registry";
import { DOJO_REPS, assessmentFrom, closingLine, currentMove, keyRep, movesFor, skipResult, startDojo, summariseDojo, tickDojo, tuningLine } from "../dojo";
import type { DojoConfig, DojoRep, DojoState, DojoSummary } from "../dojo";
import { POINTS } from "../grade";
import type { GradeTier } from "../grade";
import { guideFor } from "../guide";
import { MoveGuide } from "./MoveGuide";
import "./dojo.css";

/** What the dojo needs of the camera. The game's `PoseTracker` fits; so does anything that hands out frames. */
export interface DojoTracker {
  /** The newest frame, or null when there is no new picture or nobody in it. */
  read(): PoseFrame | null;
  /** The player's own picture, shown small in the corner when given. */
  readonly video?: HTMLVideoElement;
}

type DojoStyle = Pick<FightingStyle, "name" | "strikes">;

export interface DojoProps {
  /** Null with no camera: every repetition is a key press. */
  tracker: DojoTracker | null;
  /** The style to train. Left out or null (training opened before a style was chosen): the screen asks first. */
  style?: DojoStyle | null;
  /** Move ids to train, in order. Left out: the style's strikes, then block, duck and both dodges. */
  moves?: readonly string[];
  /** Repetitions of each move. Left out: 3. */
  reps?: number;
  /** The player pressed Done on the end screen. */
  onDone: (summary: DojoSummary) => void;
  /** The player left early (the Quit button or Escape). Left out: no Quit button. */
  onQuit?: () => void;
  /** True to say which key makes each move. Left out: true exactly when there is no tracker. The keys work either way. */
  keyboard?: boolean;
  /** Other timings than DOJO_DEFAULTS, for a demo or a test. */
  timing?: Partial<Pick<DojoConfig, "showMs" | "againMs" | "goMs" | "settleMs" | "resultMs">>;
}

/** What React draws from: everything that changes a few times per repetition, nothing that changes per frame. */
interface View {
  readonly phase: DojoState["phase"];
  readonly moveIndex: number;
  readonly repIndex: number;
  readonly points: number;
  readonly last: DojoRep | null;
  readonly reps: readonly DojoRep[];
}

const viewOf = (state: DojoState): View => ({
  phase: state.phase, moveIndex: state.moveIndex, repIndex: state.repIndex, points: state.points, last: state.last, reps: state.reps,
});

const TIER_WORD: Readonly<Record<GradeTier, string>> = { excellent: "Excellent", good: "Good", needs_work: "Needs improvement" };
const keyName = (key: string): string => (key === " " ? "Space" : key.length === 1 ? key.toUpperCase() : key);

export function Dojo(props: DojoProps) {
  const { tracker, moves, reps = DOJO_REPS, onDone, onQuit, timing } = props;
  const keyboard = props.keyboard ?? tracker === null;
  const [chosen, setChosen] = useState<DojoStyle | null>(null);
  const style = props.style ?? chosen;
  // With a list of moves handed in there is nothing to choose.
  const picking = !style && !moves;
  // The list as text, so a parent that builds a new array on every render does not start the session again.
  const listed = (moves ?? (style ? movesFor(style) : [])).join(",");
  const timed = JSON.stringify(timing ?? {});
  const config = useMemo(
    () => ({ ...(JSON.parse(timed) as NonNullable<DojoProps["timing"]>), moves: listed === "" ? [] : listed.split(","), reps, keyboard }),
    [listed, timed, reps, keyboard],
  );
  const [round, setRound] = useState(0);
  const session = useRef<DojoState>(null);
  const history = useRef<PoseHistory | null>(null);
  const root = useRef<HTMLElement>(null);
  const camera = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(() => viewOf(startDojo(config, 0)));
  // The newest callbacks, so a parent that passes fresh functions on each render does not restart anything.
  const latest = useRef({ onDone, onQuit });
  useEffect(() => { latest.current = { onDone, onQuit }; }, [onDone, onQuit]);

  useEffect(() => {
    if (picking) {
      session.current = null;
      return;
    }
    let state = startDojo(config, performance.now());
    session.current = state;
    history.current = null;
    setView(viewOf(state));
    let handle = 0;
    const loop = (): void => {
      const now = performance.now();
      // A key press between two frames has already moved the session on: start from what the ref holds.
      const before = session.current ?? state;
      state = tickDojo(before, now, tracker?.read() ?? null);
      session.current = state;
      history.current = state.history.frames.length > 0 ? state.history : null;
      if (state.phase !== before.phase || state.moveIndex !== before.moveIndex || state.repIndex !== before.repIndex) setView(viewOf(state));
      root.current?.style.setProperty("--dojo-time", (state.phaseMs > 0 ? state.msLeft / state.phaseMs : 0).toFixed(3));
      if (state.phase !== "done") handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(handle); };
  }, [tracker, config, round, picking]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const state = session.current;
      if (!state || event.repeat) return;
      if (event.key === "Escape") {
        latest.current.onQuit?.();
        return;
      }
      // Space and Enter on a focused button press that button, nothing else.
      if (event.target instanceof HTMLButtonElement && (event.key === " " || event.key === "Enter")) return;
      const move = currentMove(state);
      const now = performance.now();
      let next = state;
      if (state.phase === "go" && move && (event.key === move.key || event.key === " ")) next = keyRep(state, now);
      else if (state.phase === "result" && (event.key === " " || event.key === "Enter")) next = skipResult(state, now);
      if (next === state) return;
      event.preventDefault();
      session.current = next;
      setView(viewOf(next));
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, []);

  // The player's own picture, small, in the corner. The camera is left running when this screen goes away.
  const video = tracker?.video;
  useEffect(() => {
    const holder = camera.current;
    if (!holder || !video) return;
    holder.append(video);
    return () => { video.remove(); };
  }, [video]);

  const ids = config.moves.filter((id) => MOVES.has(id));
  const move = MOVES.get(ids[view.moveIndex] ?? "");
  const guide = move ? guideFor(move) : null;
  const done = !picking && (view.phase === "done" || !move);
  const summary = useMemo(() => (done ? summariseDojo(view.reps) : null), [done, view.reps]);
  // What Done changes in the fights: the game keeps `assessmentFrom(summary)` and tunes every monster with it.
  const tuned = useMemo(() => (summary && summary.reps.length > 0 ? tuningLine(assessmentFrom(summary), ENEMIES) : null), [summary]);
  const own = move ? view.reps.filter((rep) => rep.moveId === move.id) : [];
  const last = view.phase === "result" ? view.last : null;

  return (
    <main ref={root} className="dojo" data-phase={picking ? "pick" : view.phase} data-move={picking ? "" : (move?.id ?? "")} data-rep={view.repIndex} data-tier={last?.grade.tier ?? ""}>
      <header className="dojo-top">
        <p className="dojo-title">Training dojo <span>{style?.name ?? ""}</span></p>
        {!done && !picking && <p className="dojo-progress">Move {String(view.moveIndex + 1)} of {String(ids.length)}</p>}
        {!picking && <p className="dojo-points" aria-label={`${String(view.points)} points`}><span>Points</span> <b>{String(view.points)}</b></p>}
        {onQuit && !done && <button type="button" className="dojo-button dojo-quit" onClick={onQuit}>{picking ? "Back" : "Quit"}</button>}
      </header>

      {picking && (
        <section className="dojo-pick">
          <h1 className="dojo-end-title">What do you want to train?</h1>
          <p className="dojo-closing">Each one is its strikes, then block, duck and both dodges. {String(reps)} tries at every move, with a grade and a tip each time.</p>
          <div className="dojo-styles">
            {STYLES.map((each, index) => (
              <button key={each.id} type="button" className="dojo-button dojo-style" autoFocus={index === 0} onClick={() => { setChosen(each); }}>
                <b>{each.name}</b>
                <span>{each.strikes.map((id) => MOVES.get(id)?.name ?? id).join(", ")}</span>
              </button>
            ))}
          </div>
          <p className="dojo-key">{tracker ? "The camera is on: stand where it sees your whole body." : "No camera: you will press a key for each move."}</p>
        </section>
      )}

      {!picking && !done && move && (
        <div className="dojo-stage">
          <div className="dojo-outline">
            <MoveGuide key={move.id} move={move} history={() => history.current} size="large" />
          </div>
          <section className="dojo-side" aria-live="polite">
            <p className="dojo-cue">{view.phase === "show" ? "Watch the outline" : view.phase === "go" ? "Your turn!" : " "}</p>
            <h1 className="dojo-name">{move.name}</h1>
            {last ? (
              <div className="dojo-result">
                <p className="dojo-grade">{last.grade.label}</p>
                <p className="dojo-gain">+{String(last.grade.points)}</p>
                {last.tip && <p className="dojo-tip">{last.tip}</p>}
              </div>
            ) : (
              <>
                <p className="dojo-how">{guide?.how ?? move.hint}</p>
                <div className="dojo-time" role="presentation"><div className="dojo-time-fill" /></div>
                {keyboard && <p className="dojo-key">Keyboard: press <kbd>{keyName(move.key)}</kbd> on your turn</p>}
              </>
            )}
            <ol className="dojo-dots" aria-label={`Repetition ${String(Math.min(config.reps, own.length + 1))} of ${String(config.reps)}`}>
              {Array.from({ length: config.reps }, (_, index) => {
                const rep = own[index];
                return (
                  <li key={index} data-tier={rep?.grade.tier ?? ""} data-now={!rep && index === own.length ? "true" : undefined}>
                    <span className="dojo-dot" aria-hidden="true" />
                    <span className="dojo-dot-word">{rep ? `+${String(rep.grade.points)}` : String(index + 1)}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      )}

      {done && summary && (
        <section className="dojo-end">
          <h1 className="dojo-end-title">Training done</h1>
          <p className="dojo-total"><b>{String(summary.points)}</b> points <span>of {String(summary.maxPoints)}</span></p>
          <p className="dojo-closing">{closingLine(summary)}</p>
          <div className="dojo-columns">
            <div className="dojo-card">
              <h2>Highlights</h2>
              <ul>
                {summary.best && <li>Best move: <b>{summary.best.name}</b> <span>({String(Math.round(summary.best.average))} points a try)</span></li>}
                {(["excellent", "good", "needs_work"] as const).map((tier) => (
                  <li key={tier} data-tier={tier}><b>{String(summary.grades[tier])}</b> {TIER_WORD[tier]} <span>({String(POINTS[tier])} each)</span></li>
                ))}
                <li>Your level: <b>{summary.level}</b></li>
              </ul>
            </div>
            <div className="dojo-card">
              <h2>Work on</h2>
              {summary.workOn.length === 0
                ? <p>{summary.reps.length === 0 ? "Do a few moves first." : "Nothing to fix. Try the full list, or more repetitions."}</p>
                : (
                  <ul>
                    {summary.workOn.map((each) => (
                      <li key={each.moveId}><b>{each.name}</b>{each.sharpen ? " (to sharpen)" : ""}: {each.line}</li>
                    ))}
                  </ul>
                )}
            </div>
          </div>
          {tuned && <p className="dojo-tuned">{tuned}</p>}
          <div className="dojo-buttons">
            <button type="button" className="dojo-button" onClick={() => { setRound((count) => count + 1); }}>Train again</button>
            {chosen && !props.style && <button type="button" className="dojo-button" onClick={() => { setChosen(null); }}>Another style</button>}
            <button type="button" className="dojo-button primary" autoFocus onClick={() => { onDone(summary); }}>Done</button>
          </div>
        </section>
      )}
      <div className="dojo-camera" ref={camera} />
    </main>
  );
}
