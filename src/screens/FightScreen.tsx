// Runs one fight: reads input every frame, steps the combat engine, and hands the state to the scene and HUD.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { newTally, tallyFrame } from "../account/tally";
import type { FightTally } from "../account/tally";
import { playEvent } from "../audio/sfx";
import { pauseMusic, resumeMusic, startMusic } from "../audio/music";
import { speakMonsterTaunt } from "../audio/storyVoice";
import { useStopAudio } from "../audio/useStopAudio";
import { playVoice, speakLine } from "../audio/voice";
import { PowerReady } from "../ai/power/PowerReady";
import { powerUsable } from "../ai/power/powerPrompt";
import { PowerEffect } from "../ai/ui/PowerEffect";
import { GODS } from "../ai/gods/gods";
import type { GodId } from "../ai/gods/gods";
import { startFight, step } from "../combat/engine";
import type { Baseline, CombatEvent, EnemySpec, FightingStyle, PoseFrame, PoseHistory } from "../core/types";
import { ENEMIES } from "../enemies/registry";
import { CameraView } from "../hud/CameraView";
import { PowerCircle } from "../hud/PowerCircle";
import { SkyHud } from "../hud/sky/SkyHud";
import { notePhase } from "../hud/PhaseBanner";
import { noteHit } from "../hud/RatingFlash";
import { noteMiss } from "../hud/MissFlash";
import { createMissWatch, watchPhase } from "../input/missWatch";
import { forTwo } from "../net/host";
import type { HostLink } from "../net/host";
import { createKeyboard } from "../input/keyboard";
import { createPoseInput, mergeInputs } from "../input/poseInput";
import { MOVES } from "../moves/registry";
import { keyboardTakesOver } from "../pose/escape";
import { sentence } from "../pose/cameraError";
import { GATE_START, gateStep, presenceAt } from "../pose/presence";
import { pushFrame } from "../pose/signals";
import type { PoseTracker } from "../pose/tracker";
import { battle, noteInput, stampPower } from "../render/battle";
import { Scene } from "../render/Scene";
import { LEAP_SECONDS } from "../render/strikeReach";
import { PauseMenu } from "../ui/PauseMenu";
import { pressEscape, shiftBattleTimes } from "../ui/pauseState";
import type { PauseView } from "../ui/pauseState";
import { fallsLine } from "../enemies/wording";

/** A win's result panel waits this long, so the last blow is seen: the hero's leap out and back, then a beat on the falling monster. */
const LAST_BLOW_MS = Math.round(LEAP_SECONDS * 1000) + 450;

export function FightScreen(props: {
  enemy: EnemySpec;
  style: FightingStyle;
  tracker: PoseTracker | null;
  seed: number;
  /** Set by calibration; null for keyboard play. */
  baseline?: Baseline | null;
  /** The god the scan found, for the divine power effect; null for none. */
  god?: GodId | null;
  /** Buttons shown once the fight is over. */
  /** Pause menu: start this fight again, or leave it for the quest map. */
  onRestart?: () => void;
  onQuit?: () => void;
  /** Online room: the guest's strikes join the fight and the state goes back to them. Left out in single play. */
  link?: HostLink | null;
  renderEnd: (won: boolean, score: number, mastery: Readonly<Record<string, number>>, tally: Readonly<FightTally>, events: readonly CombatEvent[]) => ReactNode;
}) {
  const { enemy, style, tracker, seed, renderEnd, onRestart, onQuit, baseline = null, god = null, link = null } = props;
  const [powerCount, setPowerCount] = useState(0);
  const [view, setView] = useState<PauseView>("off");
  const pausedRef = useRef(false);
  const patronRef = useRef<GodId>(god ?? "athena");
  const overRef = useRef(false);
  // What this fight adds to the profile's counters; handed to the result panel with the score.
  const tally = useRef<FightTally>(newTally());
  // Every event of this fight, for the defence record and the result panel's "Defended X of Y".
  const fightEvents = useRef<CombatEvent[]>([]);
  const [lost, setLost] = useState(false);
  const [lostWhy, setLostWhy] = useState("");
  const [state, setState] = useState(() => startFight(enemy, seed));
  const poseRef = useRef<PoseFrame | null>(null);
  // The frames the detectors read, for the prompt card's move guide. Null on the keyboard.
  const historyRef = useRef<PoseHistory | null>(null);
  const readHistory = useCallback(() => historyRef.current, []);

  useEffect(() => {
    battle.styleId = style.id;
    // The last stop on the map gets its own, heavier track.
    startMusic(enemy.id === ENEMIES.at(-1)?.id ? "boss" : "fight");
    speakLine("fight_start");
    const keyboard = createKeyboard(MOVES);
    const readPose = createPoseInput(MOVES);
    const watchMiss = createMissWatch();
    let current = link ? forTwo(startFight(enemy, seed)) : startFight(enemy, seed);
    tally.current = newTally();
    fightEvents.current = [];
    let history: PoseHistory = { frames: [], baseline };
    let gate = GATE_START;
    let keyboardMode = false;
    let last = performance.now();
    let handle = 0;

    const tick = (now: number): void => {
      const frame = tracker?.read() ?? null;
      if (frame) {
        poseRef.current = frame;
        history = pushFrame(history, frame);
        historyRef.current = history;
      }
      const dt = Math.min(now - last, 100);
      const keys = keyboard.read();
      if (pausedRef.current) {
        // Paused: the clock, the gate and the keys stand still; keys pressed meanwhile are dropped.
        keyboard.read();
        last = now;
        handle = requestAnimationFrame(tick);
        return;
      }
      keyboardMode = keyboardTakesOver(keyboardMode, gate.paused, keys);
      if (tracker && !keyboardMode) {
        const seen = presenceAt(history, now);
        gate = gateStep(gate, seen.ok, dt);
        if (!seen.ok) setLostWhy(sentence(seen.reason));
        setLost(gate.paused);
        if (gate.paused) { last = now; handle = requestAnimationFrame(tick); return; }
      }
      setLost(false);
      const own = mergeInputs(keys, readPose(history));
      // With the guest gone, nothing waits for a second strike: the host carries on alone at once.
      const input = link?.guestHere() ? link.takeInput(own, now) : own;
      noteInput(input, now / 1000);
      const from = current;
      const result = step(current, enemy, style, input, dt);
      last = now;
      current = result.state;
      if (watchPhase(watchMiss, from.phase, input, result.events, now)) noteMiss();
      link?.publish(current, result.events, now);
      tallyFrame(tally.current, result.events, current.combo, link?.guestHere() ?? false);
      fightEvents.current.push(...result.events);
      result.events.forEach((event) => {
        playEvent(event); noteHit(event); notePhase(event);
        if (event.type === "won") startMusic("win");
        if (event.type === "lost") startMusic("loss");
        if (event.type === "phaseChanged" && event.index > 0) void speakMonsterTaunt(enemy.id);
      });
      playVoice(result.events, current.phase);
      if (result.events.some((event) => event.type === "powerUnleashed")) {
        stampPower(battle, patronRef.current, now / 1000, from);
        setPowerCount((n) => n + 1);
      }
      setState(current);
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(handle);
      keyboard.dispose();
      // Homer's opening line is left to run to its end: leaving the fight (App's onQuit) and the result panel stop him.
    };
  }, [enemy, style, tracker, seed, baseline, link]);

  useEffect(() => { link?.start(enemy.id, style.id, seed); }, [link, enemy, style, seed]);

  const over = state.phase.kind === "won" || state.phase.kind === "lost";
  // A loss shows its panel at once; a win holds it until the finishing strike has landed and been seen.
  const won = state.phase.kind === "won";
  const [blowSeen, setBlowSeen] = useState(false);
  useEffect(() => {
    if (!won) return;
    const timer = setTimeout(() => { setBlowSeen(true); }, LAST_BLOW_MS);
    return () => { clearTimeout(timer); };
  }, [won]);
  // With no god (keyboard play or a skipped scan) Athena lends her aegis, as the power-ready banner says.
  const patron: GodId = god ?? "athena";
  useEffect(() => { patronRef.current = patron; }, [patron]);
  const running = view === "off";
  useStopAudio(enemy.id, !running || over);
  useEffect(() => { overRef.current = over; pausedRef.current = !running; }, [over, running]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.repeat || event.defaultPrevented) return;
      setView((current) => pressEscape(current, overRef.current));
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, []);

  useEffect(() => {
    if (running) return;
    pauseMusic();
    const since = performance.now();
    return () => { resumeMusic(); shiftBattleTimes(battle, performance.now() - since); };
  }, [running]);

  return (
    <div className="fight">
      <Scene enemy={enemy} state={state} poseRef={poseRef} paused={view !== "off"} />
      <SkyHud enemy={enemy} state={state} history={readHistory} />
      <PowerEffect god={patron} powerName={GODS[patron].power.name} accent={GODS[patron].accent} trigger={powerCount} nameOnly />
      {!over && <PowerCircle power={state.power} lifted={powerUsable(state.power, state.phase.kind)} accent={GODS[patron].accent} />}
      <PowerReady god={god} power={state.power} phase={state.phase.kind} keyboard={!tracker} paused={view !== "off"} />
      <CameraView tracker={tracker} poseRef={poseRef} paused={view !== "off"} />
      {lost && !over && <div className="overlay"><h1>{lostWhy}</h1><p className="notice">Or press any move key to play on the keyboard</p></div>}
      {view !== "off" && !over && (
        <PauseMenu
          view={view}
          onResume={() => { setView("off"); }}
          onRestart={() => { onRestart?.(); }}
          onSettings={() => { setView("settings"); }}
          onBackToMenu={() => { setView("menu"); }}
          onQuit={() => { onQuit?.(); }}
        />
      )}
      {over && (!won || blowSeen) && (
        <div className="overlay">
          <h1>{state.phase.kind === "won" ? fallsLine(enemy.id, enemy.name) : "You are struck down"}</h1>
          <p>Score {state.score}</p>
          {renderEnd(state.phase.kind === "won", state.score, state.mastery, tally.current, fightEvents.current)}
        </div>
      )}
    </div>
  );
}
