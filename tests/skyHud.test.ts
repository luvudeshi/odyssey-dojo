import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { startFight } from "../src/combat/engine";
import type { CombatPhase, EnemySpec } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { SkyHud } from "../src/hud/sky/SkyHud";
import { finisherLine } from "../src/enemies/finishers";

const enemy: EnemySpec = ENEMIES[0] ?? (() => { throw new Error("no enemies"); })();
const base = startFight(enemy, 1);
const attack = enemy.attacks[0];
const spot = enemy.weakSpots[0];
const render = (phase: CombatPhase): string => renderToStaticMarkup(createElement(SkyHud, { enemy, state: { ...base, phase } }));

describe("SkyHud", () => {
  it("shows a DEFEND card with the incoming attack and both bars", () => {
    const html = render({ kind: "defend", attack, msLeft: 500, totalMs: 1000 });
    expect(html).toContain("sky-card--defend");
    expect(html).toContain(`${attack.name} incoming`);
    expect(html).toContain("You health");
    expect(html).toContain(`${enemy.name} health`);
  });

  it("shows a STRIKE card with the weak spot", () => {
    const html = render({ kind: "strike", weakSpot: spot, move: "hook", msLeft: 500, totalMs: 1000 });
    expect(html).toContain("sky-card--strike");
    expect(html).toContain(`Hit ${spot.label}`);
  });

  it("shows a FINISH card for the finisher", () => {
    const html = render({ kind: "finisher", move: "hook", msLeft: 500, totalMs: 1000 });
    expect(html).toContain("sky-card--finish");
    expect(html).toContain(finisherLine(enemy.id));
  });

  it("shows no card while recovering", () => {
    expect(render({ kind: "recover", msLeft: 500 })).not.toContain("sky-card");
  });
});
