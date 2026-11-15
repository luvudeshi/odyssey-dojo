// Everything drawn over the 3D view: health bars, the prompt card and the end banner.
// Only edge pieces are laid in pebbles, so the fight stays visible; what a player reads in half a second is plain type.
import { PLAYER_HP, promptLevel } from "../combat/engine";
import type { CombatState, EnemySpec, MoveDef, MoveDiagram } from "../core/types";
import { situationFor } from "../enemies/situations";
import { PowerBar } from "./PowerBar";
import { PhaseBanner } from "./PhaseBanner";
import { RatingFlash } from "./RatingFlash";
import { TogetherFlash } from "./TogetherFlash";
import { HpBar, ScorePlate } from "./HudBars";
import { MOVES } from "../moves/registry";
import { useSettings } from "../settings/store";
import { CardFrame, PebbleHeading } from "../ui/pebble";
import "./hud.css";

/** The robed figure's pose, drawn as a line of pebbles with terracotta joints. */
function StickFigure({ diagram }: { diagram: MoveDiagram }) {
  const dx = diagram.shiftX ?? 0;
  const dy = diagram.shiftY ?? 0;
  const arm = (shoulderX: number, elbow: readonly [number, number], wrist: readonly [number, number]): string =>
    `${String(shoulderX)},32 ${String(elbow[0])},${String(elbow[1])} ${String(wrist[0])},${String(wrist[1])}`;
  const joints: readonly (readonly [number, number])[] = [
    [38, 32], [62, 32], diagram.leftElbow, diagram.leftWrist, diagram.rightElbow, diagram.rightWrist, [50, 62], [42, 80], [58, 80],
  ];
  return (
    <svg viewBox="0 0 100 100" className="stick" aria-hidden="true">
      <g transform={`translate(${String(dx)} ${String(dy)})`}>
        <circle cx="50" cy="18" r="8" className="stick-head" />
        <polyline points="38,32 62,32 50,62 38,32" />
        <polyline points={arm(38, diagram.leftElbow, diagram.leftWrist)} />
        <polyline points={arm(62, diagram.rightElbow, diagram.rightWrist)} />
        <polyline points="50,62 42,80 40,96" />
        <polyline points="50,62 58,80 60,96" />
        {joints.map(([x, y]) => <circle key={`${String(x)},${String(y)}`} cx={x} cy={y} r="3.2" className="stick-joint" />)}
      </g>
    </svg>
  );
}

/** Letters in upper case ("L", not a lower-case l that reads as 1); Space spelled out. */
export function keyLabel(key: string): string {
  return key === " " ? "Space" : key.length === 1 ? key.toUpperCase() : key;
}

/** The ONE prompt card, at the right edge: a slate shield for DEFEND, a warm spearhead for STRIKE. */
export function PromptCard(props: { move: MoveDef; target: string; successes: number; left: number; situation?: string | null }) {
  const { move, target, successes, left, situation } = props;
  const level = promptLevel(successes);
  const { keyHints } = useSettings();
  const key = keyHints ? <kbd>{keyLabel(move.key)}</kbd> : null;
  return (
    <CardFrame kind={move.kind} timer={left} className={`hb-card ${level}`}>
      {level === "full" && <StickFigure diagram={move.diagram} />}
      <div className="pb-move">{move.prompt}</div>
      {level !== "mini" && <div className="pb-target">{target}</div>}
      {situation && <div className="hb-situation">{situation}</div>}
      {/* No HOLD tag: a defend made once while the attack is coming counts. */}
      <div className="pb-hint">
        {level === "full" && ` ${move.hint} `}
        {key}
      </div>
      {level === "full" && move.teaches && <div className="pb-teach">{move.teaches}</div>}
    </CardFrame>
  );
}

export function Hud({ enemy, state }: { enemy: EnemySpec; state: CombatState }) {
  const phase = state.phase;
  const moveId = phase.kind === "defend" ? phase.attack.counter : phase.kind === "strike" || phase.kind === "finisher" ? phase.move : null;
  const move = moveId === null ? undefined : MOVES.get(moveId);
  return (
    <div className="hud">
      <HpBar label="You" value={state.playerHp / PLAYER_HP} side="left" />
      <HpBar label={enemy.name} value={state.enemyHp / enemy.hp} side="right" />
      <ScorePlate score={state.score} combo={state.combo} />
      <PowerBar power={state.power} />
      <RatingFlash />
      <TogetherFlash two={state.players === 2} />
      <PhaseBanner />
      {phase.kind === "intro" && (
        <div className="hb-intro">
          <PebbleHeading text={enemy.name.toUpperCase()} px={72} tone="ochre" />
          <small>{enemy.title}</small>
        </div>
      )}
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
          situation={phase.kind === "defend" ? situationFor(enemy.id, phase.attack.id) : null}
          successes={state.mastery[move.id] ?? 0}
          left={phase.msLeft / phase.totalMs}
        />
      )}
    </div>
  );
}
