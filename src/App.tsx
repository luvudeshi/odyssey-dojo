// Screen flow (see screens/flow.ts): title -> style -> quest map -> intro -> fight -> result -> map.
import { useEffect, useReducer, useRef, useState } from "react";
import { setMusicVolume, startMusic, stopMusic } from "./audio/music";
import type { GodReveal } from "./ai/revealGod";
import { log } from "./core/log";
import { ENEMIES } from "./enemies/registry";
import { startTracker } from "./pose/tracker";
import type { PoseTracker } from "./pose/tracker";
import { MONSTER_MODELS } from "./render/monsters/registry";
import { EndPanel } from "./screens/EndScreen";
import { flowReducer, playable, startAt, unlocked } from "./screens/flow";
import { GodScan } from "./screens/GodScan";
import { IntroScreen } from "./screens/IntroScreen";
import { QuestMap } from "./screens/QuestMap";
import { TitleScreen } from "./screens/TitleScreen";
import { WebcamGate } from "./screens/WebcamGate";
import { useSettings } from "./settings/store";
import { SettingsPanel } from "./ui/SettingsPanel";
import { STYLES } from "./styles/registry";

const CAN_PLAY = playable(ENEMIES, MONSTER_MODELS);

export function App() {
  const [tracker, setTracker] = useState<PoseTracker | null>(null);
  const [notice, setNotice] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [flow, dispatch] = useReducer(flowReducer, null, () => startAt(ENEMIES, new URLSearchParams(window.location.search).get("stop")));

  // The god the scan found; null until then, and for keyboard play or a skipped scan. The scan is asked for once.
  const [god, setGod] = useState<GodReveal | null>(null);
  const [scanned, setScanned] = useState(false);
  const { musicVolume } = useSettings();
  useEffect(() => { setMusicVolume(musicVolume); }, [musicVolume]);
  // Menu music on every screen but the fight and its result. Silent until the first click, then it starts.
  useEffect(() => { if (flow.screen !== "fight" && flow.screen !== "result") startMusic("menu"); }, [flow.screen]);
  useEffect(() => stopMusic, []);

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
        setNotice("");
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
    return (
      <>
        <TitleScreen notice={notice} onCamera={useCamera} onKeyboard={() => { keyboardOnly.current = true; dispatch({ type: "ready" }); }} onSettings={() => { setSettingsOpen(true); }} />
        {settingsOpen && <SettingsPanel onClose={() => { setSettingsOpen(false); }} />}
      </>
    );
  }

  if (flow.screen === "style" && tracker && !scanned) {
    return <GodScan tracker={tracker} onDone={(found) => { setGod(found); setScanned(true); }} />;
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
      god={god?.god ?? null}
      onRestart={() => { dispatch({ type: "restart", seed: Date.now() }); }}
      onQuit={() => { dispatch({ type: "quit" }); }}
      renderEnd={(won, _score, mastery) => (
        <EndPanel
          won={won}
          enemyId={enemy.id}
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
