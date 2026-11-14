// Screen flow (see screens/flow.ts): title -> style -> quest map -> intro -> fight -> result -> map.
import { useReducer, useRef, useState } from "react";
import { log } from "./core/log";
import { ENEMIES } from "./enemies/registry";
import { startTracker } from "./pose/tracker";
import type { PoseTracker } from "./pose/tracker";
import { MONSTER_MODELS } from "./render/monsters/registry";
import { EndPanel } from "./screens/EndScreen";
import { flowReducer, playable, startAt, unlocked } from "./screens/flow";
import { IntroScreen } from "./screens/IntroScreen";
import { QuestMap } from "./screens/QuestMap";
import { TitleScreen } from "./screens/TitleScreen";
import { WebcamGate } from "./screens/WebcamGate";
import { STYLES } from "./styles/registry";

const CAN_PLAY = playable(ENEMIES, MONSTER_MODELS);

export function App() {
  const [tracker, setTracker] = useState<PoseTracker | null>(null);
  const [notice, setNotice] = useState("");
  const [flow, dispatch] = useReducer(flowReducer, null, () => startAt(ENEMIES, new URLSearchParams(window.location.search).get("stop")));

  const starting = useRef(false);
  // Set once the player picks "Keyboard only", so a late camera grant cannot hijack the fight.
  const keyboardOnly = useRef(false);

  const useCamera = (): void => {
    if (starting.current) return;
    starting.current = true;
    setNotice("Starting the camera...");
    startTracker().then(
      (started) => {
        if (keyboardOnly.current) {
          started.stop();
          return;
        }
        setTracker(started);
        dispatch({ type: "ready" });
      },
      (error: unknown) => {
        starting.current = false;
        log("warn", "tracker_failed", error);
        setNotice("No camera available, so you're on keyboard controls.");
        dispatch({ type: "ready" });
      },
    );
  };

  if (flow.screen === "title") {
    return <TitleScreen notice={notice} onCamera={useCamera} onKeyboard={() => { keyboardOnly.current = true; dispatch({ type: "ready" }); }} />;
  }

  if (flow.screen === "style") {
    return (
      <main className="menu">
        <h1>Choose your fighting style</h1>
        <p className="notice">{notice}</p>
        {STYLES.map((style) => (
          <button key={style.id} onClick={() => { dispatch({ type: "pickStyle", style }); }}>
            {style.name}
            <small>{style.blurb}</small>
          </button>
        ))}
      </main>
    );
  }

  const enemy = ENEMIES[flow.index];
  if (flow.screen === "map" || !enemy || !flow.style) {
    return (
      <QuestMap
        enemies={ENEMIES}
        cleared={flow.cleared}
        open={(index) => unlocked(ENEMIES, CAN_PLAY, flow.cleared, index)}
        onEnter={(index) => { dispatch({ type: "enter", index }); }}
        onStyle={() => { dispatch({ type: "changeStyle" }); }}
      />
    );
  }

  if (flow.screen === "intro") {
    return (
      <IntroScreen
        enemy={enemy}
        onBegin={() => { dispatch({ type: "begin", seed: Date.now() }); }}
        onBack={() => { dispatch({ type: "toMap" }); }}
      />
    );
  }

  return (
    <WebcamGate
      key={flow.seed}
      enemy={enemy}
      style={flow.style}
      tracker={tracker}
      seed={flow.seed}
      renderEnd={(won, _score, mastery) => (
        <EndPanel
          won={won}
          mastery={mastery}
          onShown={() => { dispatch({ type: "ended", enemyId: enemy.id, won }); }}
          onRetry={() => { dispatch({ type: "retry", seed: Date.now() }); }}
          onMap={() => { dispatch({ type: "toMap" }); }}
          onStyle={() => { dispatch({ type: "changeStyle" }); }}
        />
      )}
    />
  );
}
