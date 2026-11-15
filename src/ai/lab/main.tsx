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
import { Button } from "../../ui/pebble";
import "../../index.css";
// The game's menu panel: without it the pebble plaque is drawn over the lab's own content.
import "../../screens/menus.css";

/** A god whose portrait takes four seconds to arrive, as the AI's painting can. Share should wait for it. */
function slowGod(): GodReveal {
  const picture = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><rect width='256' height='256' fill='%23887766'/><circle cx='128' cy='110' r='60' fill='%23eeddcc'/></svg>";
  const portrait = new Promise<string | null>((resolve) => { setTimeout(() => { resolve(picture); }, 4000); });
  return { god: "athena", epithet: "grey-eyed", reason: "A sample for the lab.", rivalGod: "poseidon", source: "offline", portrait };
}

/** The share panel with sample fight data. `god` null is a player who skipped the scan. */
function ShareLab(props: { god: GodReveal | null; onClose?: () => void }) {
  const [won, setWon] = useState(true);
  return (
    <>
      <SharePanel god={props.god} won={won} enemyName="Polyphemus" fightTitle="The Cyclops of the Cave" score={12340} style="Boxer" {...(props.onClose ? { onClose: props.onClose } : {})} />
      <Button onClick={() => { setWon(!won); }}>{won ? "Show a defeat" : "Show a victory"}</Button>
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
  // undefined: the panel is not open. null: open with no god. A god: open with a portrait that comes late.
  const [shareOnly, setShareOnly] = useState<GodReveal | null | undefined>(undefined);

  if (shareOnly !== undefined) {
    return (
      <main className="menu">
        <h1>{shareOnly ? "Share panel, slow portrait" : "Share panel, no god"}</h1>
        <ShareLab god={shareOnly} onClose={() => { setShareOnly(undefined); }} />
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
        <Button onClick={withCamera}>Start with the camera</Button>
        <Button onClick={() => { setStarted(true); }}>Start without a camera</Button>
        <Button onClick={() => { setShareOnly(null); }}>Share panel only (no scan)</Button>
        <Button onClick={() => { setShareOnly(slowGod()); }}>Share panel with a slow portrait</Button>
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
      <Button onClick={make} disabled={busy}>{busy ? "The Muse is thinking..." : "Make my fight"}</Button>
      {level && (
        <pre style={{ textAlign: "left", maxWidth: "60rem", whiteSpace: "pre-wrap", font: "13px ui-monospace, monospace" }}>
          {`source: ${level.source}\n${JSON.stringify(level.level, null, 2)}`}
        </pre>
      )}
      <ShareLab god={reveal} />
      <Button onClick={() => { setReveal(null); setLevel(null); }}>Scan again</Button>
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
