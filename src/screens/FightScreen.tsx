// Runs one fight: reads input every frame, steps the combat engine, and hands the state to the scene and HUD.
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { playEvent } from "../audio/sfx";
import { startFight, step } from "../combat/engine";
import type { EnemySpec, FightingStyle, PoseFrame } from "../core/types";
import { Hud } from "../hud/Hud";
import { noteHit } from "../hud/RatingFlash";
import { createKeyboard } from "../input/keyboard";
import { createPoseInput, mergeInputs } from "../input/poseInput";
import { MOVES } from "../moves/registry";
import { EMPTY_HISTORY, pushFrame } from "../pose/signals";
import type { PoseTracker } from "../pose/tracker";
import { Scene } from "../render/Scene";

const DEBUG = new URLSearchParams(window.location.search).has("debug");

export function FightScreen(props: {
  enemy: EnemySpec;
  style: FightingStyle;
  tracker: PoseTracker | null;
  seed: number;
  /** Buttons shown once the fight is over. */
  renderEnd: (won: boolean, score: number) => ReactNode;
}) {
  const { enemy, style, tracker, seed, renderEnd } = props;
  const [state, setState] = useState(() => startFight(enemy, seed));
  const [confidences, setConfidences] = useState<readonly (readonly [string, number])[]>([]);
  const poseRef = useRef<PoseFrame | null>(null);
  const preview = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const keyboard = createKeyboard(MOVES);
    const readPose = createPoseInput(MOVES);
    let current = startFight(enemy, seed);
    let history = EMPTY_HISTORY;
    let last = performance.now();
    let handle = 0;

    const tick = (now: number): void => {
      const frame = tracker?.read() ?? null;
      if (frame) {
        poseRef.current = frame;
        history = pushFrame(history, frame);
      }
      const input = mergeInputs(keyboard.read(), readPose(history));
      const result = step(current, enemy, style, input, Math.min(now - last, 100));
      last = now;
      current = result.state;
      result.events.forEach((event) => { playEvent(event); noteHit(event); });
      setState(current);
      if (DEBUG) setConfidences([...MOVES.values()].map((move) => [move.id, move.detect(history)]));
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(handle);
      keyboard.dispose();
    };
  }, [enemy, style, tracker, seed]);

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
