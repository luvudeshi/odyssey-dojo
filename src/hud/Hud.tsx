// Everything drawn over the 3D view: health bars, the prompt card and the end banner.
import { PLAYER_HP, promptLevel } from "../combat/engine";
import type { CombatState, EnemySpec, MoveDef, MoveDiagram } from "../core/types";
import { PowerBar } from "./PowerBar";
import { PhaseBanner } from "./PhaseBanner";
import { RatingFlash } from "./RatingFlash";
import { MOVES } from "../moves/registry";

function StickFigure({ diagram }: { diagram: MoveDiagram }) {
  const dx = diagram.shiftX ?? 0;
  const dy = diagram.shiftY ?? 0;
  const arm = (shoulderX: number, elbow: readonly [number, number], wrist: readonly [number, number]): string =>
    `${String(shoulderX)},32 ${String(elbow[0])},${String(elbow[1])} ${String(wrist[0])},${String(wrist[1])}`;
  return (
    <svg viewBox="0 0 100 100" className="stick" aria-hidden="true">
      <g transform={`translate(${String(dx)} ${String(dy)})`}>
        <circle cx="50" cy="18" r="8" />
        <polyline points="38,32 62,32 50,62 38,32" />
        <polyline points={arm(38, diagram.leftElbow, diagram.leftWrist)} />
        <polyline points={arm(62, diagram.rightElbow, diagram.rightWrist)} />
        <polyline points="50,62 42,80 40,96" />
        <polyline points="50,62 58,80 60,96" />
      </g>
    </svg>
  );
}

/** Letters in upper case ("L", not a lower-case l that reads as 1); Space spelled out. */
export function keyLabel(key: string): string {
  return key === " " ? "Space" : key.length === 1 ? key.toUpperCase() : key;
}

export function PromptCard(props: { move: MoveDef; target: string; successes: number; left: number }) {
  const { move, target, successes, left } = props;
  const level = promptLevel(successes);
  const key = <kbd>{keyLabel(move.key)}</kbd>;
  return (
    <div className={`prompt ${move.kind} ${level}`}>
      {level === "full" && <StickFigure diagram={move.diagram} />}
      <div>
        <div className="prompt-word">{move.prompt}</div>
        {level !== "mini" && <div className="prompt-target">{target}</div>}
        {/* A defend only counts if it is still held when the attack lands. */}
        <div className="prompt-hint">
          {move.kind === "defend" && <strong className="prompt-hold">HOLD </strong>}
          {level === "full" && `${move.hint} `}
          {key}
        </div>
        {level === "full" && move.teaches && <div className="prompt-teaches">{move.teaches}</div>}
        <div className="timer" style={{ width: `${String(left * 100)}%` }} />
      </div>
    </div>
  );
}

function Bar({ label, value, max, side }: { label: string; value: number; max: number; side: string }) {
  return (
    <div className={`bar ${side}`}>
      <span>{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${String((value / max) * 100)}%` }} />
      </div>
    </div>
  );
}

export function Hud({ enemy, state }: { enemy: EnemySpec; state: CombatState }) {
  const phase = state.phase;
  const moveId = phase.kind === "defend" ? phase.attack.counter : phase.kind === "strike" || phase.kind === "finisher" ? phase.move : null;
  const move = moveId === null ? undefined : MOVES.get(moveId);
  return (
    <div className="hud">
      <Bar label="You" value={state.playerHp} max={PLAYER_HP} side="left" />
      <Bar label={enemy.name} value={state.enemyHp} max={enemy.hp} side="right" />
      <div className="score">
        {state.score} {state.combo > 1 && <span>x{state.combo} combo</span>}
      </div>
      <PowerBar power={state.power} />
      <RatingFlash />
      <PhaseBanner />
      {phase.kind === "intro" && <div className="banner">{enemy.name}<small>{enemy.title}</small></div>}
      {move && (phase.kind === "defend" || phase.kind === "strike" || phase.kind === "finisher") && (
        <PromptCard
          move={move}
          target={
            phase.kind === "defend"
              ? `${phase.attack.name} incoming`
              : phase.kind === "finisher"
                ? "Finish it"
                : `Hit ${phase.weakSpot.label}`
          }
          successes={state.mastery[move.id] ?? 0}
          left={phase.msLeft / phase.totalMs}
        />
      )}
    </div>
  );
}
