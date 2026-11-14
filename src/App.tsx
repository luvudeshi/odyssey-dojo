// Screen flow: title -> pick a style -> fight each enemy in ladder order.
import { useState } from "react";
import { log } from "./core/log";
import type { FightingStyle } from "./core/types";
import { ENEMIES } from "./enemies/registry";
import { startTracker } from "./pose/tracker";
import type { PoseTracker } from "./pose/tracker";
import { WebcamGate } from "./screens/WebcamGate";
import { STYLES } from "./styles/registry";

interface Fight {
  readonly style: FightingStyle;
  readonly index: number;
  readonly seed: number;
}

export function App() {
  const [tracker, setTracker] = useState<PoseTracker | null>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [fight, setFight] = useState<Fight | null>(null);

  const useCamera = (): void => {
    setNotice("Starting the camera...");
    startTracker().then(
      (started) => {
        setTracker(started);
        setReady(true);
      },
      (error: unknown) => {
        log("warn", "tracker_failed", error);
        setNotice("No camera available, so you're on keyboard controls.");
        setReady(true);
      },
    );
  };

  if (!ready) {
    return (
      <main className="menu">
        <h1>Odyssey Fighter</h1>
        <p>Fight your way home to Ithaca. Your body is the controller.</p>
        <button onClick={useCamera}>Fight with your body (webcam)</button>
        <button onClick={() => { setReady(true); }}>Keyboard only</button>
        <p className="notice">{notice}</p>
      </main>
    );
  }

  const enemy = fight ? ENEMIES[fight.index] : undefined;
  if (!fight || !enemy) {
    return (
      <main className="menu">
        <h1>Choose your fighting style</h1>
        <p className="notice">{notice}</p>
        {STYLES.map((style) => (
          <button key={style.id} onClick={() => { setFight({ style, index: 0, seed: Date.now() }); }}>
            {style.name}
            <small>{style.blurb}</small>
          </button>
        ))}
      </main>
    );
  }

  const go = (index: number): void => { setFight({ style: fight.style, index, seed: Date.now() }); };
  return (
    <WebcamGate
      key={fight.seed}
      enemy={enemy}
      style={fight.style}
      tracker={tracker}
      seed={fight.seed}
      renderEnd={(won) => (
        <>
          {won && fight.index + 1 < ENEMIES.length && (
            <button onClick={() => { go(fight.index + 1); }}>Next fight</button>
          )}
          {won && fight.index + 1 >= ENEMIES.length && <p>Ithaca is yours.</p>}
          {!won && <button onClick={() => { go(fight.index); }}>Try again</button>}
          <button onClick={() => { setFight(null); }}>Change style</button>
        </>
      )}
    />
  );
}
