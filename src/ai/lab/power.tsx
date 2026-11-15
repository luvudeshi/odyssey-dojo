// A test page for the "power is ready" banner on its own: http://localhost:5173/src/ai/lab/power.html
// With no query it shows every god and no god, camera and keyboard, side by side.
// ?god=poseidon (or any god id, or "none") shows that one banner where it sits in a fight, among the real HUD:
// the monster's bar, the player's crescent, the score, the prompt card and the power ring, with a dashed box where the
// camera panel is. Add &keys=1 for keyboard play and &voice=1 to hear Athena.
//   &phase=strike | defend | recover   the card that is up; "recover" is the wait between cards (default strike)
//   &power=0.6                         a meter that is still filling: the champion plate (default 1, the banner)
//   &enemy=scylla&spot=0&move=overhead_strike   which fight and which card; this one is the tallest card in the game
// Not linked from the game and not part of the production build.
import { StrictMode } from "react";
import type { CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { startFight } from "../../combat/engine";
import type { CombatPhase, CombatState, EnemySpec } from "../../core/types";
import { ENEMIES } from "../../enemies/registry";
import { PowerCircle } from "../../hud/PowerCircle";
import { SkyHud } from "../../hud/sky/SkyHud";
import { GODS, GOD_IDS } from "../gods/gods";
import type { GodId } from "../gods/gods";
import { PowerReady } from "../power/PowerReady";
import { powerUsable } from "../power/powerPrompt";
import "../../index.css";

const query = new URLSearchParams(window.location.search);
const asked = query.get("god");
const KEYS = query.get("keys") === "1";
const VOICE = query.get("voice") === "1";
const silent = (): boolean => true;
const ALL: readonly (GodId | null)[] = [...GOD_IDS, null];

const DARK = "radial-gradient(ellipse at 50% 30%, #3a2a3f, #0d0a12)";
const NOTE = "12px ui-monospace, monospace";
const box: CSSProperties = { position: "absolute", border: "1px dashed #fff6", color: "#fff9", font: NOTE, padding: 4 };

/** A fight frozen at the moment the query asks for: which card is up and how full the meter is. */
function frozenFight(): { enemy: EnemySpec; state: CombatState } | null {
  const enemy = ENEMIES.find((each) => each.id === query.get("enemy")) ?? ENEMIES[0];
  if (!enemy) return null;
  const spot = enemy.weakSpots[Number(query.get("spot") ?? "0")] ?? enemy.weakSpots[0];
  const kind = query.get("phase") ?? "strike";
  const phase: CombatPhase =
    kind === "defend" ? { kind: "defend", attack: enemy.attacks[0], msLeft: 1800, totalMs: 3000 }
      : kind === "recover" ? { kind: "recover", msLeft: 2000 }
        : { kind: "strike", weakSpot: spot, move: query.get("move") ?? spot.moves[0] ?? "jab", msLeft: 1800, totalMs: 3000 };
  const power = Number(query.get("power") ?? "1");
  return { enemy, state: { ...startFight(enemy, 1), enemyHp: enemy.hp * 0.47, score: 1110, combo: 5, phase, power: Number.isFinite(power) ? power : 1 } };
}

/** One banner where the fight screen puts it, among the real HUD, mounted as FightScreen mounts them. */
function Stage({ god }: { god: GodId | null }) {
  const fight = frozenFight();
  if (!fight) return null;
  const { enemy, state } = fight;
  const shared = { god, power: state.power, phase: state.phase.kind, keyboard: KEYS };
  return (
    <div className="fight" style={{ background: DARK, overflow: "hidden" }}>
      <SkyHud enemy={enemy} state={state} />
      <PowerCircle power={state.power} lifted={powerUsable(state.power, state.phase.kind)} accent={GODS[god ?? "athena"].accent} />
      {VOICE ? <PowerReady {...shared} /> : <PowerReady {...shared} announce={silent} />}
      <div style={{ ...box, left: 20, bottom: 20, width: "clamp(10rem, 16.7vw, 15rem)", aspectRatio: "4 / 3" }}>camera panel</div>
    </div>
  );
}

/** Every god and no god, camera and keyboard, each in a short dark cell with the banner at its foot. */
function Wall() {
  const cell = { position: "relative", height: 260, background: DARK, "--power-ready-bottom": "22px", "--power-ready-left": "8px", "--power-ready-right": "8px" } as CSSProperties;
  return (
    <main style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: 6, background: "#000" }}>
      {ALL.flatMap((god) =>
        [false, true].map((keyboard) => (
          <div key={`${god ?? "none"}-${String(keyboard)}`} style={cell}>
            <small style={{ position: "absolute", left: 8, top: 6, color: "#fff9", font: NOTE }}>
              {god ?? "no god"}, {keyboard ? "keyboard" : "camera"}
            </small>
            <PowerReady god={god} power={1} keyboard={keyboard} announce={silent} />
          </div>
        )),
      )}
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("the lab page has no #root element");
const one = asked === null ? undefined : asked === "none" ? null : GOD_IDS.find((id) => id === asked);
createRoot(root).render(<StrictMode>{one === undefined ? <Wall /> : <Stage god={one} />}</StrictMode>);
