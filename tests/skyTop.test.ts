import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PLAYER_HP, startFight } from "../src/combat/engine";
import type { CombatState, EnemySpec } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { PhaseLine, SkyPhase, phaseShown, roman } from "../src/hud/sky/SkyBanners";
import { crescentPoint, phaseMarks } from "../src/hud/sky/ForgeBars";
import { SkyTop } from "../src/hud/sky/SkyTop";

const enemy: EnemySpec = ENEMIES[0] ?? (() => { throw new Error("no enemies"); })();
const render = (state: CombatState, e: EnemySpec = enemy): string => renderToStaticMarkup(createElement(SkyTop, { enemy: e, state }));
const base = startFight(enemy, 1);

const polyphemus: EnemySpec = ENEMIES.find((e) => e.id === "polyphemus") ?? enemy;
const kept = (html: string): string[] => [...html.matchAll(/--kept:([0-9.]+)/g)].map((m) => m[1] ?? "");

describe("SkyTop", () => {
  it("shows both health meters, the player's number and the score", () => {
    const html = render({ ...base, playerHp: 72, enemyHp: enemy.hp / 2, score: 420 });
    expect(html).toContain("72<small>/" + String(PLAYER_HP) + "</small>");
    expect(html).toContain("You health");
    expect(html).toContain(`${enemy.name} health`);
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain(">50%<");
    expect(html).toContain(">420<");
  });

  it("fills each molten channel to its health share: the boss first, then the player", () => {
    expect(kept(render({ ...base, playerHp: PLAYER_HP * 0.72, enemyHp: enemy.hp * 0.45 }))).toEqual(["0.45", "0.72"]);
    expect(kept(render({ ...base, playerHp: -5, enemyHp: enemy.hp * 2 }))).toEqual(["1", "0"]);
  });

  it("puts the boss alone at the top and the player's bar on the floor as a crescent", () => {
    const html = render(base);
    expect(html.match(/class="fg-boss"/g)?.length).toBe(1);
    expect(html.match(/class="fg-crescent"/g)?.length).toBe(1);
    expect(html).not.toContain("sk-bar");
  });

  it("puts the crescent's sparks at the front of the kept metal, measured along the curve", () => {
    const at = (share: number): number[] => crescentPoint(share).map((n) => Math.round(n));
    expect(at(0)).toEqual([20, 20]);
    expect(at(0.5)).toEqual([120, 46]);
    expect(at(1)).toEqual([220, 20]);
    expect(at(-1)).toEqual([20, 20]);
    expect(at(2)).toEqual([220, 20]);
    const [x, y] = crescentPoint(0.72);
    expect(render({ ...base, playerHp: PLAYER_HP * 0.72 })).toContain(`translate(${String(x)}px, ${String(y)}px)`);
  });

  it("shows the combo coin only above one", () => {
    expect(render({ ...base, combo: 1 })).not.toContain("fg-coin");
    expect(render({ ...base, combo: 3 })).toContain("<b>x3</b><small>combo</small>");
  });

  it("draws no power meter: the ring at the bottom centre is the only one", () => {
    for (const power of [0, 0.35, 1]) {
      const html = render({ ...base, power });
      expect(html).not.toContain("Divine power");
      expect(html).not.toContain("sk-power");
    }
  });

  it("names the enemy on the intro, and the tag for two players", () => {
    const html = render({ ...base, phase: { kind: "intro", msLeft: 1000 }, players: 2 });
    expect(html).toContain(enemy.name.toUpperCase());
    expect(html).toContain(enemy.title);
    expect(html).toContain("You + Friend");
    expect(render({ ...base, phase: { kind: "recover", msLeft: 1000 } })).not.toContain("sk-intro");
  });

  it("marks each later phase's start with a wedge, cold once it has begun, and names the phase", () => {
    expect(phaseMarks(polyphemus, 1).map((m) => m.passed)).toEqual([true, false]);
    expect(phaseMarks(polyphemus, 0).every((m) => !m.passed)).toBe(true);
    expect(phaseMarks({ ...polyphemus, phases: undefined }, 0)).toEqual([]);
    const html = render({ ...startFight(polyphemus, 1), phaseIndex: 1 }, polyphemus);
    expect(html.match(/fg-wedge--passed/g)?.length).toBe(1);
    expect(html.match(/class="fg-wedge"/g)?.length).toBe(1);
    expect(html).toContain("Phase II");
  });

  it("writes every enemy's name as plain text in the boss bar", () => {
    for (const e of ENEMIES) expect(render(startFight(e, 2), e)).toContain(`<span class="fg-boss__name">${e.name}</span>`);
  });
});

describe("phase line", () => {
  it("shows a new phase, not the fight's start, and clears on a restart back to 0", () => {
    expect(phaseShown(0, 0, null)).toBeNull();
    expect(phaseShown(0, 1, null)).toBe(1);
    expect(phaseShown(1, 2, 1)).toBe(2);
    expect(phaseShown(2, 0, 2)).toBeNull();
    expect(phaseShown(1, 1, 1)).toBe(1);
  });

  it("draws nothing on its first render, whatever the index", () => {
    const phase = { name: "One", belowHp: 1, attackIds: ["a"], telegraphScale: 1 } as const;
    const phased: EnemySpec = { ...enemy, phases: [phase, { ...phase, name: "Two", belowHp: 0.5 }] };
    expect(renderToStaticMarkup(createElement(SkyPhase, { enemy: phased, index: 0 }))).toBe("");
    expect(renderToStaticMarkup(createElement(SkyPhase, { enemy: phased, index: 1 }))).toBe("");
  });

  it("writes the numeral and the name", () => {
    expect(renderToStaticMarkup(createElement(PhaseLine, { index: 1, name: "The Club" }))).toContain("<small>II</small>The Club");
    expect([roman(1), roman(4), roman(12)]).toEqual(["I", "IV", "12"]);
  });
});
