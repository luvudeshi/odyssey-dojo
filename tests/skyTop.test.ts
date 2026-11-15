import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PLAYER_HP, startFight } from "../src/combat/engine";
import type { CombatState, EnemySpec } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { PhaseLine, roman } from "../src/hud/sky/SkyBanners";
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

  it("copes with the longest enemy names", () => {
    for (const e of ENEMIES) expect(render(startFight(e, 2), e)).toContain(`${e.name} health`);
  });
});

describe("phase line", () => {
  it("writes the numeral and the name", () => {
    expect(renderToStaticMarkup(createElement(PhaseLine, { index: 1, name: "The Club" }))).toContain("<small>II</small>The Club");
    expect([roman(1), roman(4), roman(12)]).toEqual(["I", "IV", "12"]);
  });
});
