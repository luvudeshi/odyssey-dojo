// The strip along the bottom of a training session: one chip per move, in the order trained. The moves already
// finished carry a tick and their best grade and points, the move being trained is marked "Now", the rest are "Next".
// One row that scrolls sideways and keeps the current move in view, with a short count at its left ("2 of 6 done").
// What it shows is `trackOf` in ../dojo (pure, tested in tests/dojoCatalog.test.ts).
import { useEffect, useMemo, useRef } from "react";
import type { MoveDef } from "../../core/types";
import { trackOf } from "../dojo";
import type { DojoRep } from "../dojo";
import type { GradeTier } from "../grade";
import "./dojoTrack.css";

export interface DojoTrackProps {
  /** The session's move ids, in the order trained. */
  moves: readonly string[];
  /** Index of the move being trained; `moves.length` when the session is over. */
  index: number;
  /** Every repetition graded so far. */
  reps: readonly DojoRep[];
  /** Finds a move by id, for its name. Left out: every move the dojo knows. */
  moveOf?: (id: string) => MoveDef | undefined;
}

const TIER_WORD: Readonly<Record<GradeTier, string>> = { excellent: "Excellent", good: "Good", needs_work: "Needs improvement" };
const STATE_WORD = { done: "Done", current: "Now", next: "Next" } as const;

export function DojoTrack(props: DojoTrackProps) {
  const { moves, index, reps, moveOf } = props;
  const listed = moves.join(",");
  const track = useMemo(() => trackOf(listed === "" ? [] : listed.split(","), index, reps, moveOf), [listed, index, reps, moveOf]);
  const row = useRef<HTMLOListElement>(null);

  // Keep the current move in the middle of the row. Only the row scrolls: the page is left where it is.
  useEffect(() => {
    const list = row.current;
    const now = list?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!list || !now) return;
    list.scrollLeft = now.offsetLeft - list.offsetLeft - (list.clientWidth - now.offsetWidth) / 2;
  }, [index, listed]);

  return (
    <section className="dojo-track" aria-label="Moves in this session">
      <p className="dojo-track-count">{String(track.done)} of {String(track.total)} done</p>
      {/* Focusable, so the row can be scrolled with the arrow keys. */}
      <ol ref={row} className="dojo-track-row" tabIndex={0} aria-label="Moves, in the order trained">
        {track.steps.map((step, at) => (
          <li
            key={step.moveId} className="dojo-track-chip" data-status={step.status} data-tier={step.best ?? ""}
            {...(step.status === "current" ? { "aria-current": "step" as const } : {})}
          >
            <span className="dojo-track-state">{step.status === "done" ? <><span aria-hidden="true">✓</span><span className="dojo-track-hidden">Done</span></> : STATE_WORD[step.status]}</span>
            <b className="dojo-track-name">{String(at + 1)}. {step.name}</b>
            {step.best && <span className="dojo-track-grade">{TIER_WORD[step.best]}, {String(step.points)} points</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}
