// Runs one fight: reads input every frame, steps the combat engine, and hands the state to the scene and HUD.
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { playEvent } from "../audio/sfx";
import { startFight, step } from "../combat/engine";
import type { Baseline, EnemySpec, FightingStyle, PoseFrame, PoseHistory } from "../core/types";
import { Hud } from "../hud/Hud";
import { createKeyboard } from "../input/keyboard";
import { createPoseInput, mergeInputs } from "../input/poseInput";
import { MOVES } from "../moves/registry";
import { keyboardTakesOver } from "../pose/escape";
import { GATE_START, gateStep, presenceAt } from "../pose/presence";
import { pushFrame } from "../pose/signals";
import type { PoseTracker } from "../pose/tracker";
import { Scene } from "../render/Scene";

const DEBUG = new URLSearchParams(window.location.search).has("debug");

export function FightScreen(props: {
  enemy: EnemySpec;
  style: FightingStyle;
  tracker: PoseTracker | null;
  seed: number;
  /** Set by calibration; null for keyboard play. */
  baseline?: Baseline | null;
  /** Buttons shown once the fight is over. */
  renderEnd: (won: boolean, score: number) => ReactNode;
}) {
  const { enemy, style, tracker, seed, renderEnd, baseline = null } = props;
  const [lost, setLost] = useState(false);
  const [state, setState] = useState(() => startFight(enemy, seed));
  const [confidences, setConfidences] = useState<readonly (readonly [string, number])[]>([]);
  const poseRef = useRef<PoseFrame | null>(null);
  const preview = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
      keyboardMode = keyboardTakesOver(keyboardMode, gate.paused, keys);
      if (tracker && !keyboardMode) {
        gate = gateStep(gate, presenceAt(history, now).ok, dt);
        setLost(gate.paused);
        if (gate.paused) { last = now; handle = requestAnimationFrame(tick); return; }
      }
      setLost(false);
      const input = mergeInputs(keys, readPose(history));
      const result = step(current, enemy, style, input, dt);
      last = now;
      current = result.state;
      result.events.forEach(playEvent);
      setState(current);
      if (DEBUG) setConfidences([...MOVES.values()].map((move) => [move.id, move.detect(history)]));
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(handle);
      keyboard.dispose();
    };
  }, [enemy, style, tracker, seed, baseline]);

  useEffect(() => {
    const holder = preview.current;
    if (!tracker || !holder) return;
    holder.append(tracker.video);
    return () => { tracker.video.remove(); };
  }, [tracker]);

  const over = state.phase.kind === "won" || state.phase.kind === "lost";
  return (
    <div className="fight">
      <Scene enemy={enemy} state={state} poseRef={poseRef} />
      <Hud enemy={enemy} state={state} />
      <div className="preview" ref={preview} />
      {DEBUG && (
        <pre className="debug">
          {confidences.map(([id, value]) => `${id.padEnd(16)} ${value.toFixed(2)}`).join("\n")}
        </pre>
      )}
      {lost && !over && <div className="overlay"><h1>Step back, I can't see you</h1><p className="notice">Or press any move key to play on the keyboard</p></div>}
      {over && (
        <div className="overlay">
          <h1>{state.phase.kind === "won" ? `${enemy.name} falls` : "You are struck down"}</h1>
          <p>Score {state.score}</p>
          {renderEnd(state.phase.kind === "won", state.score)}
        </div>
      )}
    </div>
  );
}
