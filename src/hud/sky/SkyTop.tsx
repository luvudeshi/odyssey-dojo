// The top of the fight HUD in the star-chart look: everything the pebble Hud draws except the prompt card and
// the power meter, which is the ring at the bottom centre (src/hud/PowerCircle.tsx).
import { PLAYER_HP } from "../../combat/engine";
import type { CombatState, EnemySpec } from "../../core/types";
import { DefendFlash } from "../DefendFlash";
import { SkyFlashes, SkyIntro, SkyPhase } from "./SkyBanners";
import { SkyBar, SkyScore } from "./SkyBars";
import "./top.css";

export function SkyTop({ enemy, state }: { enemy: EnemySpec; state: CombatState }) {
  return (
    <>
      <SkyBar label="You" value={state.playerHp / PLAYER_HP} side="left" readout={`${String(Math.round(state.playerHp))}/${String(PLAYER_HP)}`} />
      <SkyBar label={enemy.name} value={state.enemyHp / enemy.hp} side="right" />
      <SkyScore score={state.score} combo={state.combo} />
      <SkyPhase enemy={enemy} index={state.phaseIndex} />
      <SkyFlashes two={state.players === 2} />
      <DefendFlash phase={state.phase} />
      {state.phase.kind === "intro" && <SkyIntro enemy={enemy} />}
    </>
  );
}
