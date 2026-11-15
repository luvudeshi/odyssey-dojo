// Screen flow (see screens/flow.ts): title -> style -> quest map -> intro -> fight -> result -> map.
import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import "./screens/rooms.css";
import { setMusicVolume, startMusic, stopMusic } from "./audio/music";
import type { GodReveal } from "./ai/revealGod";
import { log } from "./core/log";
import { ENEMIES } from "./enemies/registry";
import { CameraPanelContext } from "./hud/cameraPanel";
import { cameraErrorMessage } from "./pose/cameraError";
import { createCameraSession } from "./pose/cameraSession";
import { startTracker } from "./pose/tracker";
import type { PoseTracker } from "./pose/tracker";
import { MONSTER_MODELS } from "./render/monsters/registry";
import { EndPanel } from "./screens/EndScreen";
import { flowReducer, openAt, playable, unlocked } from "./screens/flow";
import { GodScan } from "./screens/GodScan";
import { GuestFight } from "./screens/GuestFight";
import { IntroScreen } from "./screens/IntroScreen";
import { QuestMap } from "./screens/QuestMap";
import { RoomHost } from "./screens/RoomHost";
import { RoomJoin } from "./screens/RoomJoin";
import type { Joined } from "./screens/RoomJoin";
import { RoomMenu } from "./screens/RoomMenu";
import { roomFromSearch } from "./screens/roomUrl";
import type { HostLink } from "./net/host";
import { TitleScreen } from "./screens/TitleScreen";
import { WebcamGate } from "./screens/WebcamGate";
import { useSettings } from "./settings/store";
import { SettingsPanel } from "./ui/SettingsPanel";
import { STYLES } from "./styles/registry";

const CAN_PLAY = playable(ENEMIES, MONSTER_MODELS);
// The one camera of the session: every calibration and fight reads it, and nothing between fights stops it.
const camera = createCameraSession(startTracker);

export function App() {
  const [tracker, setTracker] = useState<PoseTracker | null>(null);
  const [notice, setNotice] = useState("");
  const [cameraProblem, setCameraProblem] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [flow, dispatch] = useReducer(flowReducer, null, () => openAt(ENEMIES, new URLSearchParams(window.location.search).get("stop"), roomFromSearch(window.location.search)));
  const [hostLink, setHostLink] = useState<HostLink | null>(null);
  const [joined, setJoined] = useState<Joined | null>(null);

  // The god the scan found; null until then, and for keyboard play or a skipped scan. The scan is asked for once.
  const [god, setGod] = useState<GodReveal | null>(null);
  const [scanned, setScanned] = useState(false);
  const { musicVolume } = useSettings();
  useEffect(() => { setMusicVolume(musicVolume); }, [musicVolume]);
  // Menu music on every screen but the fight and its result. Silent until the first click, then it starts.
  useEffect(() => { if (flow.screen !== "fight" && flow.screen !== "result") startMusic("menu"); }, [flow.screen]);
  useEffect(() => stopMusic, []);

  const cameraStatus = useSyncExternalStore(camera.subscribe, camera.status, camera.status);
  // The watchdog: plays the video again after a screen change paused it, restarts a camera that stopped.
  useEffect(() => {
    const timer = setInterval(() => { camera.check(performance.now()); }, 250);
    return () => { clearInterval(timer); };
  }, []);

  // Set once the player picks "Keyboard only", so a late camera grant cannot hijack the fight.
  const keyboardOnly = useRef(false);

  // The title's camera button, and "Use camera" on the fight's panel. A second press while starting waits on the first.
  const startCamera = (): void => {
    keyboardOnly.current = false;
    setCameraProblem("");
    setNotice("Starting the camera... If the browser asks for the camera at the top of this window, choose Allow.");
    camera.start().then(
      (started) => {
        if (keyboardOnly.current) {
          camera.stop();
          return;
        }
        setNotice("");
        setTracker(started);
        dispatch({ type: "ready" });
      },
      (error: unknown) => {
        log("warn", "tracker_failed", error);
        setNotice("");
        // Stay put: the player chooses the keyboard, never the failure.
        setCameraProblem(cameraErrorMessage(error));
        dispatch({ type: "toTitle" });
      },
    );
  };

  if (flow.screen === "title") {
    return (
      <>
        <TitleScreen notice={notice} problem={cameraProblem} onCamera={startCamera} onKeyboard={() => { keyboardOnly.current = true; setCameraProblem(""); dispatch({ type: "ready" }); }} onSettings={() => { setSettingsOpen(true); }} onTogether={() => { dispatch({ type: "together" }); }} />
        {settingsOpen && <SettingsPanel onClose={() => { setSettingsOpen(false); }} />}
      </>
    );
  }

  if (flow.screen === "together") {
    return <RoomMenu onHost={() => { dispatch({ type: "hostRoom" }); }} onJoin={() => { dispatch({ type: "joinRoom" }); }} onBack={() => { dispatch({ type: "toTitle" }); }} />;
  }

  if (flow.screen === "host") {
    return (
      <RoomHost
        onStart={(link) => { setHostLink(link); dispatch({ type: "hosted", together: true }); startCamera(); }}
        onSolo={() => { keyboardOnly.current = true; dispatch({ type: "hosted", together: false }); }}
        onBack={() => { dispatch({ type: "toTitle" }); }}
      />
    );
  }

  if (flow.screen === "join") {
    return (
      <RoomJoin
        initialCode={roomFromSearch(window.location.search) ?? ""}
        onJoined={(next) => { setJoined(next); dispatch({ type: "joined" }); }}
        onBack={() => { dispatch({ type: "toTitle" }); }}
      />
    );
  }

  if (flow.screen === "guest" && joined) {
    return <GuestFight joined={joined} onLeave={() => { setJoined(null); dispatch({ type: "toTitle" }); }} />;
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
    <CameraPanelContext value={{ status: cameraStatus, onCamera: startCamera }}>
      <WebcamGate
        key={flow.seed}
        enemy={enemy}
        style={flow.style}
        tracker={tracker}
        link={flow.hosting ? hostLink : null}
        seed={flow.seed}
        god={god?.god ?? null}
        onRestart={() => { dispatch({ type: "restart", seed: Date.now() }); }}
        onQuit={() => { hostLink?.stop(); dispatch({ type: "quit" }); }}
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
    </CameraPanelContext>
  );
}
