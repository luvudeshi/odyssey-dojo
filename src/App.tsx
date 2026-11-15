// Screen flow (see screens/flow.ts): main menu -> style -> quest map -> fight -> result -> map.
import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { achievements, type Achievement } from "./account/achievements";
import { getProfile, recordDojo, recordFight, recordRoom, useProfile } from "./account/store";
import { newlyUnlocked } from "./account/unlocks";
import { UnlockNotice } from "./account/ui/UnlockNotice";
import "./screens/menus.css";
import "./screens/cursor.css";
import "./screens/rooms.css";
import { setMusicVolume, startMusic, stopMusic } from "./audio/music";
import type { GodReveal } from "./ai/revealGod";
import { CharacterPicker } from "./characters/CharacterPicker";
import { loadCharacter } from "./characters/characters";
import type { CharacterId } from "./characters/characters";
import { characterFromScan, confirmCharacter } from "./characters/godCharacter";
import { assessmentFrom } from "./coach";
import { Dojo } from "./coach/ui/Dojo";
import { log } from "./core/log";
import { ENEMIES } from "./enemies/registry";
import { CameraPanelContext } from "./hud/cameraPanel";
import { cameraErrorMessage } from "./pose/cameraError";
import { createCameraSession } from "./pose/cameraSession";
import { startTracker } from "./pose/tracker";
import type { PoseTracker } from "./pose/tracker";
import { MONSTER_MODELS } from "./render/monsters/registry";
import { SharePanel } from "./replay/ui/SharePanel";
import { Account } from "./screens/Account";
import { EndPanel } from "./screens/EndScreen";
import { lessonsFrom } from "./lessons/lessons";
import { recordDefense } from "./lessons/defenseStore";
import { enemyFor, flowReducer, openAt, playable } from "./screens/flow";
import { GodScan } from "./screens/GodScan";
import { GuestFight } from "./screens/GuestFight";
import { narrateIntro } from "./screens/hookups";
import { MenuOrMuse as MainMenu } from "./ai/ui/museDoor"; // The main menu (screens/MainMenu), or the Muse's fight in its place when the address has ?ai=1.
import { QuestMap } from "./screens/QuestMap";
import { Multiplayer } from "./screens/Multiplayer";
import type { Joined } from "./screens/RoomJoin";
import { roomFromSearch } from "./screens/roomUrl";
import type { HostLink } from "./net/host";
import { WebcamGate } from "./screens/WebcamGate";
import { getSettings, useSettings } from "./settings/store";
import { StyleSelect } from "./screens/StyleSelect";
import { STYLES } from "./styles/registry";

const CAN_PLAY = playable(ENEMIES, MONSTER_MODELS);
// The one camera of the session: every calibration and fight reads it, and nothing between fights stops it.
const camera = createCameraSession(startTracker);

export function App() {
  const [tracker, setTracker] = useState<PoseTracker | null>(null);
  const [notice, setNotice] = useState("");
  const [cameraProblem, setCameraProblem] = useState("");
  // The main menu's side doors. They are panels of the title screen, not steps of the quest flow.
  const [panel, setPanel] = useState<"account" | "training" | "multiplayer" | null>(null);
  const profile = useProfile();
  // Homer's line before a stop now plays as its fight opens; this stops it when the player leaves that fight.
  const stopIntro = useRef<() => void>(() => undefined);
  // The seed of the last fight written to the profile, so one result is counted once.
  const recorded = useRef(0);
  // Achievements the last fight unlocked, shown over its result screen for a few seconds.
  const [fresh, setFresh] = useState<readonly Achievement[]>([]);
  const [flow, dispatch] = useReducer(flowReducer, null, () => openAt(ENEMIES, new URLSearchParams(window.location.search).get("stop"), roomFromSearch(window.location.search), getProfile().cleared));
  const [hostLink, setHostLink] = useState<HostLink | null>(null);
  const [joined, setJoined] = useState<Joined | null>(null);

  // The god the scan found; null until then, and for keyboard play or a skipped scan. The scan is asked for once.
  const [god, setGod] = useState<GodReveal | null>(null);
  const [scanned, setScanned] = useState(false);
  // The character shown in the picker (the scan's, or the stored one), and whether the player has confirmed it.
  const [character, setCharacter] = useState<CharacterId>(loadCharacter);
  const [characterPicked, setCharacterPicked] = useState(false);
  // Writes to the profile through `change` and shows whatever that unlocked.
  const noting = (change: () => void): void => {
    const before = achievements(getProfile(), ENEMIES);
    change();
    setFresh(newlyUnlocked(before, achievements(getProfile(), ENEMIES)));
  };
  const unlocks = <UnlockNotice items={fresh} onDone={() => { setFresh([]); }} />;
  // A notice belongs to its own result screen: leaving it (retry, map, quit) drops what was left of it.
  useEffect(() => { if (flow.screen !== "result") setFresh([]); }, [flow.screen]);
  const { musicVolume } = useSettings();
  useEffect(() => { setMusicVolume(musicVolume); }, [musicVolume]);
  // Menu music on every screen but the fight and its result. Silent until the first click, then it starts.
  useEffect(() => { if (flow.screen !== "fight" && flow.screen !== "result") startMusic("menu"); }, [flow.screen]);
  useEffect(() => stopMusic, []);

  // The monster for this fight: tuned to the player when the optional warm-up was done. Stable between renders so the fight does not restart.
  const stop = ENEMIES[flow.index];
  const tuned = useMemo(() => (stop ? enemyFor(stop, flow.assessment) : undefined), [stop, flow.assessment]);

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

  // "Play on the keyboard" on the camera problem card, and Story mode when the setting says Keyboard.
  const startKeyboard = (): void => { keyboardOnly.current = true; setCameraProblem(""); setTracker(null); dispatch({ type: "ready" }); };

  const openTraining = (): void => {
    setCameraProblem("");
    setPanel("training");
    // The setting decides, each time the dojo opens: Keyboard drops a camera started earlier and asks for none.
    keyboardOnly.current = getSettings().controls === "keyboard";
    if (keyboardOnly.current) setTracker(null);
    else if (!tracker) camera.start().then(setTracker, (error: unknown) => { log("warn", "tracker_failed", error); });
  };

  if (flow.screen === "title" && panel === "training") {
    return (
      <Dojo
        tracker={tracker}
        style={flow.style}
        onDone={(summary) => {
          if (summary.reps.length > 0) noting(() => { recordDojo(summary.moves.some((move) => move.reps > 0 && move.grades.excellent === move.reps)); });
          dispatch({ type: "warmed", assessment: assessmentFrom(summary) });
          setPanel(null);
        }}
        onQuit={() => { setPanel(null); }}
      />
    );
  }

  if (flow.screen === "title" && panel === "account") {
    return <Account enemies={ENEMIES} onBack={() => { setPanel(null); }} />;
  }

  // One screen for rooms: the Multiplayer card, a room being hosted from it, and a scanned join link all land here.
  if (flow.screen === "host" || flow.screen === "join" || (flow.screen === "title" && panel === "multiplayer")) {
    return (
      <Multiplayer
        hosting={flow.screen === "host"}
        code={roomFromSearch(window.location.search) ?? ""}
        onOpen={() => { dispatch({ type: "hostRoom" }); }}
        onStart={(link) => { setHostLink(link); dispatch({ type: "hosted", together: true }); startCamera(); }}
        onSolo={() => { keyboardOnly.current = true; dispatch({ type: "hosted", together: false }); }}
        onClose={() => { setPanel("multiplayer"); dispatch({ type: "toTitle" }); }}
        onJoined={(next) => { setJoined(next); dispatch({ type: "joinRoom" }); dispatch({ type: "joined" }); }}
        onBack={() => { setPanel(null); dispatch({ type: "toTitle" }); }}
      />
    );
  }

  if (flow.screen === "title") {
    return <>
      <MainMenu
        name={profile.name}
        notice={notice}
        problem={cameraProblem}
        onStory={() => { if (getSettings().controls === "keyboard") startKeyboard(); else startCamera(); }}
        onCamera={startCamera}
        onKeyboard={startKeyboard}
        onMultiplayer={() => { setPanel("multiplayer"); }}
        onTraining={openTraining}
        onAccount={() => { setPanel("account"); }}
      />
      {unlocks}
    </>;
  }

  if (flow.screen === "guest" && joined) {
    return <>
      <GuestFight joined={joined} onOver={() => { noting(recordRoom); }} onLeave={() => { setJoined(null); dispatch({ type: "toTitle" }); }} />
      {unlocks}
    </>;
  }

  if (flow.screen === "style" && tracker && !scanned) {
    return <GodScan tracker={tracker} onDone={(found) => { setGod(found); setCharacter(characterFromScan(found?.god)); setScanned(true); }} onBack={() => { dispatch({ type: "toTitle" }); }} />;
  }

  // After the scan, before the style: the five characters, with the god's one already chosen.
  if (flow.screen === "style" && !characterPicked) {
    return (
      <main className="menu">
        <CharacterPicker value={character} onChange={setCharacter} onDone={(id) => { setCharacter(confirmCharacter(id)); setCharacterPicked(true); }} />
      </main>
    );
  }

  if (flow.screen === "style") {
    return (
      <StyleSelect styles={STYLES} notice={notice} onPick={(style) => { dispatch({ type: "pickStyle", style }); }} onCharacter={() => { setCharacterPicked(false); }} onBack={() => { dispatch({ type: "toTitle" }); }} />
    );
  }

  const enemy = tuned;
  if (flow.screen === "map" || !enemy || !flow.style) {
    return (
      <QuestMap
        enemies={ENEMIES}
        cleared={flow.cleared}
        open={(index) => CAN_PLAY[index] ?? false}
        onEnter={(index) => {
          const next = ENEMIES[index];
          if (next) stopIntro.current = narrateIntro(next.id);
          dispatch({ type: "enter", index, seed: Date.now() });
        }}
        onStyle={() => { dispatch({ type: "changeStyle" }); }}
        onMenu={() => { setPanel(null); dispatch({ type: "toTitle" }); }}
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
        onQuit={() => { stopIntro.current(); hostLink?.stop(); dispatch({ type: "quit" }); }}
        renderEnd={(won, score, mastery, tally, events) => (
          <EndPanel
            won={won}
            defense={lessonsFrom(events)}
            enemyId={enemy.id}
            mastery={mastery}
            card={(close) => <SharePanel god={god} won={won} enemyName={enemy.name} fightTitle={enemy.title} score={score} style={flow.style?.name ?? ""} onClose={close} />}
            onShown={() => {
              if (recorded.current !== flow.seed) {
                recorded.current = flow.seed;
                const styleId = flow.style?.id ?? "";
                noting(() => { recordFight({ enemyId: enemy.id, won, score, mastery, styleId, tally }); });
                recordDefense(events, enemy.id);
              }
              dispatch({ type: "ended", enemyId: enemy.id, won });
            }}
            onRetry={() => { dispatch({ type: "retry", seed: Date.now() }); }}
            onMap={() => { dispatch({ type: "toMap" }); }}
            onStyle={() => { dispatch({ type: "changeStyle" }); }}
          />
        )}
      />
      {unlocks}
    </CameraPanelContext>
  );
}
