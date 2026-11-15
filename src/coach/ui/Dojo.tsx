// The training dojo screen (issue #172): one move at a time. A big outline of somebody doing the move loops on the
// left with a live checklist of what the camera sees; on the right the move's name, how to do it, a dot per
// repetition and the points so far. After each repetition the grade is shown large with its points and one tip.
// At the end: the total, the highlights, and what to work on with a line on how.
// Thin on purpose: the session is the pure state machine in ../dojo, ticked once per animation frame from a ref.
// React renders only when the phase, the move or the repetition changes; the time bar is written straight to the page.
import { keyName } from "./keyName";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FightingStyle, PoseFrame, PoseHistory } from "../../core/types";
import { ENEMIES } from "../../enemies/registry";
import { MissFlash, noteMiss } from "../../hud/MissFlash";
import { createMissWatch } from "../../input/missWatch";
import { createPoseInput } from "../../input/poseInput";
import { MOVES } from "../../moves/registry";
import { DOJO_REPS, assessmentFrom, closingLine, currentMove, keyRep, skipResult, startDojo, summariseDojo, tickDojo, tuningLine } from "../dojo";
import type { DojoConfig, DojoRep, DojoState, DojoSummary } from "../dojo";
import { POINTS } from "../grade";
import type { GradeTier } from "../grade";
import { DOJO_MEASURES, dojoGuideFor, dojoMoveOf } from "../catalog";
import { Backdrop } from "../../ui/set/Set";
import { DojoSetup } from "./DojoSetup";
import type { DojoPick } from "./DojoSetup";
import { DojoTrack } from "./DojoTrack";
import { MoveGuide } from "./MoveGuide";
import "./dojo.css";
import "../../ui/set/screens-dojo.css";

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
  /** The style the setup step starts on. Left out or null: the one chosen last time, else the first. */
  style?: DojoStyle | null;
  /** Move ids ticked when the setup step opens. Left out: last time's, else the style's strikes, then block, duck and both dodges. */
  moves?: readonly string[];
  /** Tries at each move when the setup step opens. Left out: last time's, else 3. */
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

export function Dojo(props: DojoProps) {
  const { tracker, onDone, onQuit, timing } = props;
  const keyboard = props.keyboard ?? tracker === null;
  // The setup step comes before every session. `pick` is what was chosen there; null while that step is on screen.
  const [pick, setPick] = useState<DojoPick | null>(null);
  // What was picked a moment ago, so Change moves comes back to the same ticks.
  const [last, setLast] = useState<DojoPick | null>(null);
  const picking = pick === null;
  // The list as text, so a new array on every render does not start the session again.
  const listed = (pick?.moves ?? []).join(",");
  const reps = pick?.reps ?? props.reps ?? DOJO_REPS;
  const timed = JSON.stringify(timing ?? {});
  const config = useMemo(
    () => ({ ...(JSON.parse(timed) as NonNullable<DojoProps["timing"]>), moves: listed === "" ? [] : listed.split(","), reps, keyboard }),
    [listed, timed, reps, keyboard],
  );
  const [round, setRound] = useState(0);
  const session = useRef<DojoState>(null);
  const history = useRef<PoseHistory | null>(null);
  const missWatch = useRef(createMissWatch());
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
    const readPose = createPoseInput(MOVES);
    const watch = createMissWatch();
    missWatch.current = watch;
    let handle = 0;
    const loop = (): void => {
      const now = performance.now();
      // A key press between two frames has already moved the session on: start from what the ref holds.
      const before = session.current ?? state;
      state = tickDojo(before, now, tracker?.read() ?? null);
      session.current = state;
      // A wrong move or a weak try does not end the turn or cost the repetition: it flashes MISS and the player tries again.
      const asked = state.phase === "go" && !state.hit ? currentMove(state) : undefined;
      if (watch(asked?.id ?? null, asked?.kind === "defend", tracker ? readPose(state.history) : { held: new Set(), struck: [] }, false, now)) noteMiss();
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
      if (event.repeat) return;
      if (event.key === "Escape") {
        latest.current.onQuit?.();
        return;
      }
      if (!state) return;
      // Space and Enter on a focused button press that button, nothing else.
      if (event.target instanceof HTMLButtonElement && (event.key === " " || event.key === "Enter")) return;
      const move = currentMove(state);
      const now = performance.now();
      let next = state;
      if (state.phase === "go" && move && (event.key === move.key || event.key === " ")) next = keyRep(state, now);
      else if (state.phase === "go" && move) {
        // Another move's key: the turn goes on, and MISS shows.
        const other = [...MOVES.values()].find((each) => each.key === event.key && each.id !== move.id);
        const defend = move.kind === "defend";
        if (other && missWatch.current(move.id, defend, { held: new Set(other.kind === "defend" ? [other.id] : []), struck: other.kind === "defend" ? [] : [{ move: other.id, quality: 0.7, player: 0 }] }, false, now)) noteMiss();
      }
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

  const ids = config.moves.filter((id) => dojoMoveOf(id) !== undefined);
  const move = dojoMoveOf(ids[view.moveIndex] ?? "");
  const guide = move ? dojoGuideFor(move) : null;
  const done = !picking && (view.phase === "done" || !move);
  const summary = useMemo(() => (done ? summariseDojo(view.reps) : null), [done, view.reps]);
  // What Done changes in the fights: the game keeps `assessmentFrom(summary)` and tunes every monster with it.
  const tuned = useMemo(() => (summary && summary.reps.length > 0 ? tuningLine(assessmentFrom(summary), ENEMIES) : null), [summary]);
  const own = move ? view.reps.filter((rep) => rep.moveId === move.id) : [];
  // On the end screen Back is Done: it hands the summary on, as the Done button does.
  const leave = done && summary ? () => { onDone(summary); } : onQuit;
  const result = view.phase === "result" ? view.last : null;
  const changeMoves = (): void => { setPick(null); };

  return (
    <main ref={root} className="dojo" data-phase={picking ? "pick" : view.phase} data-move={picking ? "" : (move?.id ?? "")} data-rep={view.repIndex} data-tier={result?.grade.tier ?? ""}>
      <Backdrop src={picking ? "/textures/set/storm/storm-armoury.jpg" : "/textures/set/storm/yard.jpg"} />
      <header className="dojo-top">
        <p className="dojo-title set-title">Training dojo{pick ? ": " : ""}<span>{pick?.styleName ?? ""}</span></p>
        {!done && !picking && <p className="dojo-progress set-sub">Move {String(view.moveIndex + 1)} of {String(ids.length)}</p>}
        {leave && <button type="button" className="set-back dojo-quit" onClick={leave}>{picking || done ? "Back" : "Quit"}</button>}
        {!picking && (
          <div className="dojo-top-right">
            {!done && <button type="button" className="set-btn dojo-change" onClick={changeMoves}>Change moves</button>}
            <p className="dojo-points set-stat" aria-label={`${String(view.points)} points`}><span>Points</span> <b>{String(view.points)}</b></p>
          </div>
        )}
      </header>

      {picking && (
        <DojoSetup
          camera={tracker !== null}
          {...(last ? { last } : { ...(props.style ? { style: props.style } : {}), ...(props.moves ? { moves: props.moves } : {}), ...(props.reps === undefined ? {} : { reps: props.reps }) })}
          onStart={(next) => { setPick(next); setLast(next); }}
        />
      )}

      {!picking && !done && move && (
        <>
          <div className="dojo-stage">
            <MissFlash />
            <div className="dojo-outline">
              <MoveGuide key={move.id} move={move} history={() => history.current} size="large" guide={guide} table={DOJO_MEASURES} />
            </div>
            <section className="dojo-side" aria-live="polite">
              <p className="dojo-cue">{view.phase === "show" ? "Watch the outline" : view.phase === "go" ? "Your turn!" : " "}</p>
              <h1 className="dojo-name">{move.name}</h1>
              {result ? (
                <div className="dojo-result">
                  <p className="dojo-grade">{result.grade.label}</p>
                  <p className="dojo-gain">+{String(result.grade.points)}</p>
                  {result.tip && <p className="dojo-tip">{result.tip}</p>}
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
          <DojoTrack moves={ids} index={view.moveIndex} reps={view.reps} moveOf={dojoMoveOf} />
        </>
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
            <button type="button" className="dojo-button" onClick={changeMoves}>Change moves</button>
            <button type="button" className="dojo-button primary" autoFocus onClick={() => { onDone(summary); }}>Done</button>
          </div>
        </section>
      )}
      <div className="dojo-camera" ref={camera} />
    </main>
  );
}
