// The move guide on a page of its own, outside the game: open /tools/guide/index.html on the dev server.
// It goes through all the moves and feeds the checklist a made-up player who copies the figure (./body).
// In the address: ?move=jab stays on one move, ?size=medium or large, ?theme=pebble, ?mirrored=0, ?camera=0 (no frames).
import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { guideFor } from "../../src/coach/guide";
import { MoveGuide } from "../../src/coach/ui/MoveGuide";
import type { PoseHistory } from "../../src/core/types";
import { MOVES } from "../../src/moves/registry";
import { EMPTY_HISTORY, pushFrame } from "../../src/pose/signals";
import "../../src/theme.css";
import { bodyAt } from "./body";

const IDS = [...MOVES.keys()].sort();
const EACH_MS = 4000;
const PROMPT_MS = 3000;
const SIZES = ["card", "medium", "large"] as const;
type Size = (typeof SIZES)[number];
const query = new URLSearchParams(window.location.search);

function Page() {
  const fixed = query.get("move");
  const [id, setId] = useState(fixed && MOVES.has(fixed) ? fixed : (IDS[0] ?? ""));
  const [cycling, setCycling] = useState(fixed === null);
  const [size, setSize] = useState<Size>(SIZES.find((each) => each === query.get("size")) ?? "card");
  const [mirrored, setMirrored] = useState(query.get("mirrored") !== "0");
  const [pebble, setPebble] = useState(query.get("theme") === "pebble");
  const [msLeft, setMsLeft] = useState(PROMPT_MS);
  const move = MOVES.get(id);
  const guide = useMemo(() => (move ? guideFor(move) : null), [move]);
  const history = useRef<PoseHistory | null>(null);

  useEffect(() => { document.body.classList.toggle("pebble", pebble); }, [pebble]);

  useEffect(() => {
    if (!cycling) return;
    const timer = window.setInterval(() => { setId((now) => IDS[(IDS.indexOf(now) + 1) % IDS.length] ?? now); }, EACH_MS);
    return () => { window.clearInterval(timer); };
  }, [cycling]);

  // The made-up player: stands still for one loop (the baseline), then copies the figure in step with it.
  useEffect(() => {
    if (!guide || query.get("camera") === "0") { history.current = null; return; }
    const began = performance.now();
    let held = EMPTY_HISTORY;
    let handle = 0;
    let shownAt = 0;
    const loop = (now: number): void => {
      held = pushFrame(held, bodyAt(guide, now, now - began));
      history.current = held;
      if (now - shownAt > 100) {
        shownAt = now;
        setMsLeft(PROMPT_MS - ((now - began) % PROMPT_MS));
      }
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(handle); };
  }, [guide]);

  if (!move) return <p>No moves found.</p>;
  return (
    <>
      <div className="row">
        <select value={id} onChange={(event) => { setId(event.target.value); setCycling(false); }} aria-label="Move">
          {IDS.map((each) => <option key={each} value={each}>{MOVES.get(each)?.name ?? each}</option>)}
        </select>
        <button onClick={() => { setCycling((on) => !on); }}>{cycling ? "Stop on this move" : "Go through all the moves"}</button>
        <button onClick={() => { setSize((now) => SIZES[(SIZES.indexOf(now) + 1) % SIZES.length] ?? "card"); }}>Size: {size}</button>
        <button onClick={() => { setMirrored((on) => !on); }}>{mirrored ? "Mirror (your left is on the left)" : "Facing you (your left is on the right)"}</button>
        <button onClick={() => { setPebble((on) => !on); }}>Theme: {pebble ? "dark pebble" : "pottery"}</button>
      </div>
      <MoveGuide key={id} move={move} history={() => history.current} msLeft={msLeft} msTotal={PROMPT_MS} size={size} mirrored={mirrored} />
      <p>The checklist is fed by a made-up player who copies the figure exactly. It stands still for the first loop, so the game has its standing measure, then moves in step with the figure.</p>
    </>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");
createRoot(root).render(<StrictMode><Page /></StrictMode>);
