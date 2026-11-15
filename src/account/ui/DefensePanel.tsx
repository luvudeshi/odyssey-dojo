// The defence panel: what the player defended, by kind, the last five fights, the best run and what to practise next.
// It only draws: the numbers come from `defenseProgress` (src/lessons/defense.ts). A new player gets one plain line.
// `DefenseLine` is the one-line version for a fight's result screen.
import type { DefenseProgress, KindProgress, TrendPoint } from "../../lessons/defense";
import { TREND_FIGHTS } from "../../lessons/defense";
import "./defensePanel.css";

const percent = (rate: number): string => `${String(Math.round(rate * 100))}%`;
const DIRECTION = { up: "Getting better", down: "Slipping", steady: "Holding" } as const;

function KindBar(props: { kind: KindProgress; weak: boolean }) {
  const { kind, weak } = props;
  const met = kind.seen > 0;
  const label = met ? `${kind.name}: defended ${String(kind.defended)} of ${String(kind.seen)}${weak ? ", the one to practise" : ""}` : `${kind.name}: not met yet`;
  return (
    <li className={`def-kind${weak ? " is-weak" : ""}`} role="img" aria-label={label}>
      <span className="def-kind__name">{kind.name}</span>
      <span className="def-kind__count">{met ? `${String(kind.defended)}/${String(kind.seen)}` : "none yet"}</span>
      <span className="def-bar"><i style={{ width: percent(kind.rate) }} /></span>
    </li>
  );
}

function Trend(props: { points: readonly TrendPoint[] }) {
  const { points } = props;
  const empty = Array.from({ length: TREND_FIGHTS - points.length }, (_, index) => index);
  const label = `Last ${points.length === 1 ? "fight" : `${String(points.length)} fights`}, oldest first: ${points.map((point) => `${String(point.defended)} of ${String(point.seen)}`).join(", ")}`;
  return (
    <div className="def-trend" role="img" aria-label={label}>
      {empty.map((index) => <span key={`empty-${String(index)}`} className="def-trend__bar is-empty" />)}
      {points.map((point, index) => (
        <span key={`${String(point.at)}-${String(index)}`} className="def-trend__bar"><i style={{ height: `${String(Math.max(6, Math.round(point.rate * 100)))}%` }} /></span>
      ))}
    </div>
  );
}

export function DefensePanel(props: { progress: DefenseProgress }) {
  const { progress } = props;
  if (progress.fights === 0) {
    return (
      <section className="def-panel is-empty" aria-label="Your defence">
        <h2 className="def-title">Your defence</h2>
        <p className="def-empty">Win or lose a fight to see your defence here.</p>
      </section>
    );
  }
  const { level, nextLevel } = progress;
  const fights = progress.fights === 1 ? "1 fight" : `${String(progress.fights)} fights`;
  return (
    <section className="def-panel" aria-label="Your defence">
      <h2 className="def-head">
        <span className="def-head__word">Defended</span>
        <b>{progress.defended} of {progress.seen}</b>
      </h2>
      <p className="def-sub">
        <span>{percent(progress.rate)} over {fights}</span>
        <span className="def-level" title={nextLevel ? `${level.rule} Next, ${nextLevel.name}: ${nextLevel.rule}` : level.rule}>
          <span className="def-sr">Level: </span>{level.name}
        </span>
      </p>
      <ul className="def-kinds" aria-label="By kind of defence">
        {progress.kinds.map((kind) => <KindBar key={kind.moveId} kind={kind} weak={progress.weakest?.moveId === kind.moveId} />)}
      </ul>
      <div className="def-row">
        <Trend points={progress.trend} />
        <p className="def-facts">
          <span>{progress.trend.length === 1 ? "Last fight" : `Last ${String(progress.trend.length)} fights`}{progress.direction ? `: ${DIRECTION[progress.direction].toLowerCase()}` : ""}</span>
          <span>Best run without a hit: <b>{progress.bestStreak}</b></span>
        </p>
      </div>
      <p className="def-next" data-move={progress.practiseNext.moveId ?? undefined}>{progress.practiseNext.line}</p>
    </section>
  );
}

/** One line for the result of a fight. Draws nothing when no attack ran its course. */
export function DefenseLine(props: { seen: number; defended: number }) {
  if (props.seen <= 0) return null;
  return <p className="def-line">Defended <b>{props.defended} of {props.seen}</b> {props.seen === 1 ? "attack" : "attacks"}</p>;
}
