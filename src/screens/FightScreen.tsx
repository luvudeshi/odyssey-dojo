// Runs one fight: reads input every frame, steps the combat engine, and hands the state to the scene and HUD.
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { playEvent } from "../audio/sfx";
import { playVoice } from "../audio/voice";
import { startFight, step } from "../combat/engine";
import type { Baseline, EnemySpec, FightingStyle, PoseFrame, PoseHistory } from "../core/types";
import { Hud } from "../hud/Hud";
import { notePhase } from "../hud/PhaseBanner";
import { noteHit } from "../hud/RatingFlash";
import { createKeyboard } from "../input/keyboard";
import { createPoseInput, mergeInputs } from "../input/poseInput";
import { MOVES } from "../moves/registry";
import { keyboardTakesOver } from "../pose/escape";
import { GATE_START, gateStep, presenceAt } from "../pose/presence";
import { pushFrame } from "../pose/signals";
import type { PoseTracker } from "../pose/tracker";
import { battle, noteInput } from "../render/battle";
import { Scene } from "../render/Scene";
import { useSettings } from "../settings/store";
import { PauseMenu } from "../ui/PauseMenu";
import { pressEscape, shiftBattleTimes } from "../ui/pauseState";
import type { PauseView } from "../ui/pauseState";

export function FightScreen(props: {
  enemy: EnemySpec;
  style: FightingStyle;
  tracker: PoseTracker | null;
  seed: number;
  /** Set by calibration; null for keyboard play. */
  baseline?: Baseline | null;
  /** Buttons shown once the fight is over. */
  /** Pause menu: start this fight again, or leave it for the quest map. */
  onRestart?: () => void;
  onQuit?: () => void;
  renderEnd: (won: boolean, score: number, mastery: Readonly<Record<string, number>>) => ReactNode;
}) {
  const { enemy, style, tracker, seed, renderEnd, onRestart, onQuit, baseline = null } = props;
  const { mirror } = useSettings();
  const [view, setView] = useState<PauseView>("off");
  const pausedRef = useRef(false);
  const overRef = useRef(false);
  const [lost, setLost] = useState(false);
  const [state, setState] = useState(() => startFight(enemy, seed));
  const poseRef = useRef<PoseFrame | null>(null);
  const preview = useRef<HTMLDivElement>(null);

  useEffect(() => {
    battle.styleId = style.id;
    const keyboard = createKeyboard(MOVES);
    const readPose = createPoseInput(MOVES);
    let current = startFight(enemy, seed);
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
        gate = gateStep(gate, presenceAt(history, now).ok, dt);
        setLost(gate.paused);
        if (gate.paused) { last = now; handle = requestAnimationFrame(tick); return; }
      }
      setLost(false);
      const input = mergeInputs(keys, readPose(history));
      noteInput(input, now / 1000);
      const result = step(current, enemy, style, input, dt);
      last = now;
      current = result.state;
      result.events.forEach((event) => { playEvent(event); noteHit(event); notePhase(event); });
      playVoice(result.events, current.phase);
      setState(current);
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(handle);
      keyboard.dispose();
    };
  }, [enemy, style, tracker, seed, baseline]);

  const over = state.phase.kind === "won" || state.phase.kind === "lost";
  const running = view === "off";
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
    const since = performance.now();
    return () => { shiftBattleTimes(battle, performance.now() - since); };
  }, [running]);

  useEffect(() => {
    const holder = preview.current;
    if (!tracker || !holder) return;
    holder.append(tracker.video);
    return () => { tracker.video.remove(); };
  }, [tracker]);

  return (
    <div className="fight">
      <Scene enemy={enemy} state={state} poseRef={poseRef} paused={view !== "off"} />
      <Hud enemy={enemy} state={state} />
      <div className={mirror ? "preview mirror" : "preview"} ref={preview} />
      {lost && !over && <div className="overlay"><h1>Step back, I can't see you</h1><p className="notice">Or press any move key to play on the keyboard</p></div>}
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
      {over && (
        <div className="overlay">
          <h1>{state.phase.kind === "won" ? `${enemy.name} falls` : "You are struck down"}</h1>
          <p>Score {state.score}</p>
          {renderEnd(state.phase.kind === "won", state.score, state.mastery)}
        </div>
      )}
    </div>
  );
}
