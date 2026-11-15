// Prints how long each stop's fight lasts and when its phases begin, for the numbers in docs/pitch.md.
// Run: npx tsx scripts/fight-timings.ts [--fights=30] [--style=boxer]
//
// The made-up player is the one in the pacing tests (tests/content.test.ts and tests/pacingStops.test.ts): the same
// random numbers, the same seeds (1000 + n * 7919), 20 ms steps and a ten-minute cap. A new prompt (attack, opening
// or finishing-move offer) is one roll: the player gets it right or does nothing. Times are from the start of the
// engine's fight, which opens with its 1.5 s intro before the first prompt; the cutscene and the calibration count
// come before that and are not counted here.
import { promptLevel, startFight, step } from "../src/combat/engine";
import type { EnemySpec, FightingStyle, Strike } from "../src/core/types";
// The registries gather their files with Vite's import.meta.glob, which plain Node lacks, so the files are named here.
import { enemy as charybdis } from "../src/enemies/defs/charybdis";
import { enemy as circe } from "../src/enemies/defs/circe";
import { enemy as polyphemus } from "../src/enemies/defs/polyphemus";
import { enemy as scylla } from "../src/enemies/defs/scylla";
import { enemy as sirens } from "../src/enemies/defs/sirens";
import { enemy as suitors } from "../src/enemies/defs/suitors";
import { style as boxer } from "../src/styles/defs/boxer";
import { style as jiuJitsu } from "../src/styles/defs/jiuJitsu";
import { style as karate } from "../src/styles/defs/karate";
import { style as kungFu } from "../src/styles/defs/kungFu";
import { style as taekwondo } from "../src/styles/defs/taekwondo";

const ENEMIES: readonly EnemySpec[] = [polyphemus, circe, sirens, scylla, charybdis, suitors];
const STYLES: readonly FightingStyle[] = [boxer, jiuJitsu, karate, kungFu, taekwondo];

interface Player {
  readonly label: string;
  readonly skill: number;
  readonly reactMs: number;
  readonly quality: number;
}

const PLAYERS: readonly Player[] = [
  // The keyboard gives every strike quality 0.7 (src/input/keyboard.ts).
  { label: "perfect keyboard: every prompt, strike 0.3 s, quality 0.7", skill: 1, reactMs: 300, quality: 0.7 },
  { label: "covered: 95% right, 0.8 s, quality 0.7", skill: 0.95, reactMs: 800, quality: 0.7 },
  { label: "the tests' player: 85% right, 0.8 s, quality 0.7", skill: 0.85, reactMs: 800, quality: 0.7 },
  { label: "slower: 70% right, 1 s, quality 0.7", skill: 0.7, reactMs: 1000, quality: 0.7 },
];

interface Fight {
  readonly seconds: number;
  readonly won: boolean;
  /** Seconds from the fight's start to each phase after the first, in order; missing when not reached. */
  readonly phaseAt: readonly number[];
  /** Seconds to the first finishing-move offer, when reached. */
  readonly finisherAt: number | undefined;
  /** Seconds to the first prompt. */
  readonly firstPromptAt: number;
  /** Seconds to the first prompt shown at the smallest card size (word, key and timer only), when reached. */
  readonly firstMiniAt: number | undefined;
  /** Prompts shown, and how many of them at the smallest card size. */
  readonly prompts: number;
  readonly minis: number;
}

function play(enemy: EnemySpec, style: FightingStyle, player: Player, seed: number): Fight {
  let chance = seed;
  const lucky = (): boolean => {
    chance = (Math.imul(chance, 1103515245) + 12345) >>> 0;
    return chance / 4294967296 < player.skill;
  };
  let state = startFight(enemy, seed);
  let ms = 0;
  let decided = "";
  let good = false;
  let strikeAt = 0;
  let finisherTries = 0;
  let finisherLeft = 0;
  const phaseAt: number[] = [];
  let finisherAt: number | undefined;
  let firstPromptAt = -1;
  let firstMiniAt: number | undefined;
  let prompts = 0;
  let minis = 0;
  const STEP = 20;
  while (state.phase.kind !== "won" && state.phase.kind !== "lost" && ms < 600_000) {
    const phase = state.phase;
    if (firstPromptAt < 0 && phase.kind !== "intro") firstPromptAt = ms / 1000;
    if (phase.kind === "finisher") {
      if (finisherAt === undefined) finisherAt = ms / 1000;
      if (phase.msLeft > finisherLeft) finisherTries += 1;
      finisherLeft = phase.msLeft;
    }
    const key = `${phase.kind}:${String(state.seed)}:${String(state.playerHp)}:${String(state.enemyHp)}:${String(finisherTries)}`;
    if (key !== decided) {
      decided = key;
      if (phase.kind === "defend" || phase.kind === "strike" || phase.kind === "finisher") {
        const move = phase.kind === "defend" ? phase.attack.counter : phase.move;
        prompts += 1;
        if (promptLevel(state.mastery[move] ?? 0) === "mini") {
          minis += 1;
          firstMiniAt ??= ms / 1000;
        }
      }
      good = lucky();
      strikeAt = ms + player.reactMs;
    }
    const held = new Set<string>();
    const struck: Strike[] = [];
    if (phase.kind === "defend" && good) held.add(phase.attack.counter);
    if ((phase.kind === "strike" || phase.kind === "finisher") && good && ms >= strikeAt) {
      struck.push({ move: phase.move, quality: player.quality, player: 0 });
    }
    state = step(state, enemy, style, { held, struck }, STEP).state;
    ms += STEP;
    // One strike can skip a phase; both then begin at the same moment.
    while (phaseAt.length < state.phaseIndex) phaseAt.push(ms / 1000);
  }
  return { seconds: ms / 1000, won: state.phase.kind === "won", phaseAt, finisherAt, firstPromptAt, firstMiniAt, prompts, minis };
}

const arg = (name: string): string | undefined => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const FIGHTS = Number(arg("fights") ?? 30);
const style = STYLES.find((candidate) => candidate.id === (arg("style") ?? "boxer"));
if (!style) throw new Error("no such style");

const s = (value: number): string => `${value.toFixed(0)} s`;
const spread = (list: readonly number[]): string =>
  list.length === 0 ? "none" : `${s(list.reduce((a, b) => a + b, 0) / list.length)} (${s(Math.min(...list))} to ${s(Math.max(...list))}, n=${String(list.length)})`;

for (const enemy of [...ENEMIES].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
  console.log(`\n## ${enemy.name} (hp ${String(enemy.hp)}), ${style.id}, ${String(FIGHTS)} fights`);
  for (const player of PLAYERS) {
    const fights = Array.from({ length: FIGHTS }, (_, index) => play(enemy, style, player, 1000 + index * 7919));
    const won = fights.filter((fight) => fight.won);
    const lost = fights.filter((fight) => !fight.won);
    const capped = fights.filter((fight) => fight.seconds >= 600).length;
    console.log(`- ${player.label}`);
    console.log(`  won ${String(won.length)}/${String(FIGHTS)}${capped ? `, ${String(capped)} hit the 10-minute cap` : ""}; first prompt at ${s(fights[0]?.firstPromptAt ?? 0)}`);
    console.log(`  all fights: ${spread(fights.map((f) => f.seconds))}`);
    console.log(`  won fights: ${spread(won.map((f) => f.seconds))}`);
    console.log(`  lost fights: ${spread(lost.map((f) => f.seconds))}`);
    (enemy.phases ?? []).slice(1).forEach((phase, index) => {
      const at = fights.map((f) => f.phaseAt[index]).filter((t): t is number => t !== undefined);
      console.log(`  phase ${String(index + 2)} "${phase.name}" begins: ${spread(at)}`);
    });
    const all = fights.reduce((sum, f) => sum + f.prompts, 0);
    const small = fights.reduce((sum, f) => sum + f.minis, 0);
    console.log(`  smallest card first shown: ${spread(fights.map((f) => f.firstMiniAt).filter((t): t is number => t !== undefined))}; ${String(Math.round((100 * small) / all))}% of prompts`);
    console.log(`  finishing move first offered: ${spread(fights.map((f) => f.finisherAt).filter((t): t is number => t !== undefined))}`);
  }
}
