// Everything the fight HUD draws except the prompt card and the power meter, which is the ring at the bottom centre
// (src/hud/PowerCircle.tsx). Forge Fire layout: the monster's bar alone across the top, the score at the top right, and
// the player's bar as a lintel on the camera panel at the bottom left, with the defend chip just above it.
import { PLAYER_HP } from "../../combat/engine";
import type { CombatState, EnemySpec } from "../../core/types";
import { DefendFlash } from "../DefendFlash";
import { BossBar, ForgeScore, PlayerLintel } from "./ForgeBars";
import { SkyFlashes, SkyIntro, SkyPhase } from "./SkyBanners";
import "./top.css";

export function SkyTop({ enemy, state }: { enemy: EnemySpec; state: CombatState }) {
  return (
    <>
      <BossBar enemy={enemy} value={state.enemyHp / enemy.hp} phaseIndex={state.phaseIndex} />
      <PlayerLintel hp={state.playerHp} maxHp={PLAYER_HP} />
      <ForgeScore score={state.score} combo={state.combo} />
      <SkyPhase enemy={enemy} index={state.phaseIndex} />
      <SkyFlashes two={state.players === 2} />
      <DefendFlash phase={state.phase} />
      {state.phase.kind === "intro" && <SkyIntro enemy={enemy} />}
    </>
  );
}
