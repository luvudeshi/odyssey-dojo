// The top of the fight HUD in the star-chart look: everything the pebble Hud draws except the prompt card.
import { PLAYER_HP } from "../../combat/engine";
import type { CombatState, EnemySpec } from "../../core/types";
import { SkyFlashes, SkyIntro, SkyPhase } from "./SkyBanners";
import { SkyBar, SkyPower, SkyScore } from "./SkyBars";
import "./top.css";

export function SkyTop({ enemy, state }: { enemy: EnemySpec; state: CombatState }) {
  return (
    <>
      <SkyBar label="You" value={state.playerHp / PLAYER_HP} side="left" readout={`${String(Math.round(state.playerHp))}/${String(PLAYER_HP)}`} />
      <SkyBar label={enemy.name} value={state.enemyHp / enemy.hp} side="right" />
      <SkyScore score={state.score} combo={state.combo} />
      <SkyPower power={state.power} />
      <SkyPhase enemy={enemy} index={state.phaseIndex} />
      <SkyFlashes two={state.players === 2} />
      {state.phase.kind === "intro" && <SkyIntro enemy={enemy} />}
    </>
  );
}
