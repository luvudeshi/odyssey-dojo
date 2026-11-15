// The warm-up screen on a page of its own, outside the game and without a camera: open /tools/warmup/index.html on
// the dev server. A made-up player (./player) stands in for the pose tracker and copies the figure well, late or not
// at all, so every grade and the end screen can be seen.
// In the address: ?play=good, late, none or mixed (the default: two of each), ?enemy=Polyphemus (the name in the last line).
import "../../src/index.css";
import "../../src/screens/menus.css";
import { StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { WARMUP_STEPS, assessWarmup, summary } from "../../src/coach";
import type { Assessment } from "../../src/coach";
import { WarmUp } from "../../src/coach/ui/WarmUp";
import type { PoseTracker } from "../../src/pose/tracker";
import { MIXED, PLAYS, frameFor } from "./player";
import type { Play } from "./player";

const FRAME_MS = 33;
const query = new URLSearchParams(window.location.search);
const enemy = query.get("enemy");
const asked = PLAYS.find((each) => each === query.get("play")) ?? null;
const playFor = (moveId: string): Play => asked ?? MIXED[moveId] ?? "good";

/** A tracker with no camera: it reads which move the screen is asking for off the page and answers with the made-up player. */
function fakeTracker(): PoseTracker {
  let lastAt = -Infinity;
  let step: string | null = null;
  let stepAt = 0;
  return {
    video: document.createElement("video"),
    read() {
      const now = performance.now();
      if (now - lastAt < FRAME_MS) return null;
      lastAt = now;
      const screen = document.querySelector<HTMLElement>(".warmup");
      const asking = screen?.dataset.phase === "step" ? (screen.dataset.step ?? null) : null;
      if (asking !== step) {
        step = asking;
        stepAt = now;
      }
      const moveId = asking === null ? null : (screen?.dataset.move ?? null);
      return frameFor(now, moveId, moveId === null ? "none" : playFor(moveId), now - stepAt);
    },
    stop() { /* nothing to stop */ },
  };
}

function Page() {
  const [round, setRound] = useState(0);
  const [found, setFound] = useState<Assessment | "skipped" | null>(null);
  const tracker = useMemo(() => fakeTracker(), []);
  if (found !== null) {
    return (
      <main className="menu">
        <h1>{found === "skipped" ? "Skipped" : summary(found)[0]}</h1>
        <p>The game would go back to the screen before the fight here.</p>
        <button onClick={() => { setFound(null); setRound((count) => count + 1); }}>Warm up again</button>
      </main>
    );
  }
  return (
    <WarmUp key={round} tracker={tracker} steps={WARMUP_STEPS} assess={assessWarmup} lines={summary}
      {...(enemy === null ? {} : { enemyName: enemy })} onDone={setFound} onSkip={() => { setFound("skipped"); }} />
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");
createRoot(root).render(<StrictMode><Page /></StrictMode>);
