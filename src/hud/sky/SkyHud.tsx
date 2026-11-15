// The fight HUD in the star-chart look: same decisions as the pebble Hud, only the look differs.
import { situationFor } from "../../enemies/situations";
import type { CombatState, EnemySpec, PoseHistory } from "../../core/types";
import { MOVES } from "../../moves/registry";
import { SkyTop } from "./SkyTop";
import { SkyPromptCard } from "./SkyPromptCard";
import "./tokens.css";

export function SkyHud({ enemy, state, history }: { enemy: EnemySpec; state: CombatState; history?: () => PoseHistory | null }) {
  const phase = state.phase;
  const moveId = phase.kind === "defend" ? phase.attack.counter : phase.kind === "strike" || phase.kind === "finisher" ? phase.move : null;
  const move = moveId === null ? undefined : MOVES.get(moveId);
  return (
    <div className="sky-hud" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <SkyTop enemy={enemy} state={state} />
      {move && (phase.kind === "defend" || phase.kind === "strike" || phase.kind === "finisher") && (
        <SkyPromptCard
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
          finisher={phase.kind === "finisher"}
          history={history}
        />
      )}
    </div>
  );
}
