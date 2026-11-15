import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PLAYER_HP, startFight } from "../src/combat/engine";
import type { CombatState, EnemySpec } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { PhaseLine, SkyPhase, phaseShown, roman } from "../src/hud/sky/SkyBanners";
import { litStar } from "../src/hud/sky/SkyBars";
import { SkyTop } from "../src/hud/sky/SkyTop";

const enemy: EnemySpec = ENEMIES[0] ?? (() => { throw new Error("no enemies"); })();
const render = (state: CombatState, e: EnemySpec = enemy): string => renderToStaticMarkup(createElement(SkyTop, { enemy: e, state }));
const base = startFight(enemy, 1);

describe("SkyTop", () => {
  it("shows both health meters, the player's number and the score", () => {
    const html = render({ ...base, playerHp: 72, enemyHp: enemy.hp / 2, score: 420 });
    expect(html).toContain("72/" + String(PLAYER_HP));
    expect(html).toContain("You health");
    expect(html).toContain(`${enemy.name} health`);
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain(">420<");
  });

  it("darkens the lost stars", () => {
    const html = render({ ...base, playerHp: PLAYER_HP / 2 });
    expect(html.match(/sk-node--off/g)?.length).toBe(6);
  });

  it("shows the combo only above one", () => {
    expect(render({ ...base, combo: 1 })).not.toContain("combo");
    expect(render({ ...base, combo: 3 })).toContain("x3 combo");
  });

  it("hides power at 0, shows the percentage at 0.35 and READY with the full class at 1", () => {
    expect(render({ ...base, power: 0 })).not.toContain("Divine power");
    const part = render({ ...base, power: 0.35 });
    expect(part).toContain("35%");
    expect(part).not.toContain("is-full");
    const full = render({ ...base, power: 1 });
    expect(full).toContain("READY");
    expect(full).toContain("is-full");
    expect(full).toContain('aria-valuenow="100"');
  });

  it("names the enemy on the intro, and the tag for two players", () => {
    const html = render({ ...base, phase: { kind: "intro", msLeft: 1000 }, players: 2 });
    expect(html).toContain(enemy.name.toUpperCase());
    expect(html).toContain(enemy.title);
    expect(html).toContain("You + Friend");
    expect(render({ ...base, phase: { kind: "recover", msLeft: 1000 } })).not.toContain("sk-intro");
  });

  it("lights no star at zero health, every star at full", () => {
    expect(render({ ...base, playerHp: 0, enemyHp: 0 }).match(/sk-node--off/g)?.length).toBe(24);
    expect(render(base)).not.toContain("sk-node--off");
    expect([0, 11].map((i) => litStar(i, 0, true))).toEqual([false, false]);
    expect([0, 11].map((i) => litStar(i, 0, false))).toEqual([false, false]);
    // A sliver of health keeps the one star at the outer end: the player's first, the monster's last.
    expect([litStar(0, 0.01, true), litStar(11, 0.01, false), litStar(1, 0.01, true)]).toEqual([true, true, false]);
  });

  it("writes every enemy's name as plain text in the bar, cut with an ellipsis by CSS when it is too long", () => {
    for (const e of ENEMIES) expect(render(startFight(e, 2), e)).toContain(`<span class="sk-bar__name">${e.name}</span>`);
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
