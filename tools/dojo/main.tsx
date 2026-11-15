// The training dojo on a page of its own, outside the game: open /tools/dojo/index.html on the dev server.
// With nothing in the address a made-up player (./player) takes each turn: one repetition done well, one sloppy,
// one missed, so every grade and the work-on list can be seen with no camera.
// In the address: ?quick=1 trains five moves, ?style=karate picks the style (?style=ask lets the screen ask), ?reps=2, ?camera=1 uses the real camera,
// ?keyboard=1 has no player at all (press the key shown), ?slow=1 uses the game's own timings (the page's are shorter).
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { movesFor, quickMoves } from "../../src/coach/dojo";
import type { DojoSummary } from "../../src/coach/dojo";
import { Dojo } from "../../src/coach/ui/Dojo";
import type { DojoTracker } from "../../src/coach/ui/Dojo";
import { startTracker } from "../../src/pose/tracker";
import { STYLES } from "../../src/styles/registry";
import "../../src/theme.css";
import { scriptedPlayer } from "./player";

const query = new URLSearchParams(window.location.search);
// ?style=ask leaves the style out, as when training is opened from the title screen: the screen asks.
const asking = query.get("style") === "ask";
const style = STYLES.find((each) => each.id === query.get("style")) ?? STYLES.find((each) => each.id === "boxer") ?? STYLES[0];
const reps = Number(query.get("reps")) || undefined;
const FAST = { showMs: 1600, againMs: 800, goMs: 2600, resultMs: 1500 };

/** A tracker that reads where the session is off the page (the screen writes it on its root) and plays the made-up player. */
function madeUpTracker(): DojoTracker {
  const player = scriptedPlayer();
  return {
    read: () => {
      const at = document.querySelector<HTMLElement>(".dojo")?.dataset;
      if (!at?.move) return null;
      return player(performance.now(), { phase: at.phase ?? "", moveId: at.move, repIndex: Number(at.rep) || 0 });
    },
  };
}

function Page() {
  const mode = query.get("camera") === "1" ? "camera" : query.get("keyboard") === "1" ? "keyboard" : "made-up";
  const [tracker, setTracker] = useState<DojoTracker | null>(() => (mode === "made-up" ? madeUpTracker() : null));
  const [problem, setProblem] = useState("");
  const [told, setTold] = useState<DojoSummary | null>(null);
  const moves = useMemo(() => (style ? (query.get("quick") === "1" ? quickMoves(style) : movesFor(style)) : []), []);

  useEffect(() => {
    if (mode !== "camera") return;
    let stop = (): void => undefined;
    let gone = false;
    startTracker().then(
      (started) => {
        if (gone) { started.stop(); return; }
        stop = () => { started.stop(); };
        setTracker(started);
      },
      (error: unknown) => { setProblem(`No camera: ${error instanceof Error ? error.message : String(error)}. Keys still work.`); },
    );
    return () => { gone = true; stop(); };
  }, [mode]);

  if (!style) return <p>No styles found.</p>;
  if (mode === "camera" && !tracker && !problem) return <p className="demo-note">Starting the camera. If the browser asks, choose Allow.</p>;
  return (
    <>
      <Dojo
        tracker={tracker}
        {...(asking ? {} : { style, moves })}
        {...(reps === undefined ? {} : { reps })}
        {...(query.get("slow") === "1" || mode !== "made-up" ? {} : { timing: FAST })}
        onDone={setTold}
        onQuit={() => { window.location.assign(window.location.pathname); }}
      />
      <p className="demo-note">
        {problem} {told ? `Done was pressed: ${String(told.points)} points, level ${told.level}. ` : ""}
        Demo page ({mode} player). Try <a href="?quick=1">?quick=1</a>, <a href="?camera=1&quick=1">?camera=1</a>, <a href="?keyboard=1&quick=1">?keyboard=1</a>.
      </p>
    </>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");
createRoot(root).render(<StrictMode><Page /></StrictMode>);
