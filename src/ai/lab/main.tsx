// A test page for the AI features on their own, outside the game: http://localhost:5173/src/ai/lab/index.html
// Not linked from the game and not part of the production build.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { log } from "../../core/log";
import { startTracker } from "../../pose/tracker";
import type { PoseTracker } from "../../pose/tracker";
import { SharePanel } from "../../replay/ui/SharePanel";
import { generateLevel } from "../client";
import type { LevelResponse } from "../contracts";
import { GODS } from "../gods/gods";
import type { GodReveal } from "../revealGod";
import { RevealScreen } from "../ui/RevealScreen";
import "../../index.css";

/** The share panel with sample fight data. `god` null is a player who skipped the scan. */
function ShareLab(props: { god: GodReveal | null }) {
  const [won, setWon] = useState(true);
  return (
    <>
      <SharePanel god={props.god} won={won} enemyName="Polyphemus" fightTitle="The Cyclops of the Cave" score={12340} style="Boxer" />
      <button className="reveal-quiet" onClick={() => { setWon(!won); }}>{won ? "Show a defeat" : "Show a victory"}</button>
    </>
  );
}

function Lab() {
  const [tracker, setTracker] = useState<PoseTracker | null>(null);
  const [started, setStarted] = useState(false);
  const [reveal, setReveal] = useState<GodReveal | null>(null);
  const [phrase, setPhrase] = useState("like a Texas thunderstorm");
  const [level, setLevel] = useState<LevelResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareOnly, setShareOnly] = useState(false);

  if (shareOnly) {
    return (
      <main className="menu">
        <h1>Share panel, no god</h1>
        <ShareLab god={null} />
        <button onClick={() => { setShareOnly(false); }}>Back</button>
      </main>
    );
  }
  if (!started) {
    const withCamera = (): void => {
      startTracker().then(setTracker, (error: unknown) => { log("warn", "lab_no_camera", error); }).finally(() => { setStarted(true); });
    };
    return (
      <main className="menu">
        <h1>AI lab</h1>
        <button onClick={withCamera}>Start with the camera</button>
        <button onClick={() => { setStarted(true); }}>Start without a camera</button>
        <button onClick={() => { setShareOnly(true); }}>Share panel only (no scan)</button>
      </main>
    );
  }
  if (!reveal) return <RevealScreen tracker={tracker} onDone={setReveal} />;

  const make = (): void => {
    setBusy(true);
    void generateLevel({ phrase, god: reveal.god, rival_god: reveal.rivalGod, epithet: reveal.epithet })
      .then(setLevel)
      .finally(() => { setBusy(false); });
  };
  return (
    <main className="menu">
      <h1>How do you fight, {GODS[reveal.god].name}?</h1>
      <input value={phrase} onChange={(event) => { setPhrase(event.target.value); }} size={40} maxLength={200} />
      <button onClick={make} disabled={busy}>{busy ? "The Muse is thinking..." : "Make my fight"}</button>
      {level && (
        <pre style={{ textAlign: "left", maxWidth: "60rem", whiteSpace: "pre-wrap", font: "13px ui-monospace, monospace" }}>
          {`source: ${level.source}\n${JSON.stringify(level.level, null, 2)}`}
        </pre>
      )}
      <ShareLab god={reveal} />
      <button onClick={() => { setReveal(null); setLevel(null); }}>Scan again</button>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("the lab page has no #root element");
createRoot(root).render(
  <StrictMode>
    <Lab />
  </StrictMode>,
);
