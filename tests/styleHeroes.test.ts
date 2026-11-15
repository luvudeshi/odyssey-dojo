// Every fighting style is tied to the figure from myth who best stands for it, and says so to the player.
import { expect, test } from "vitest";
import { HEROES, heroFor } from "../src/styles/heroes";
import { STYLES } from "../src/styles/registry";

test("every style on the style screen has its figure and names that figure in its line", () => {
  for (const style of STYLES) {
    const hero = heroFor(style.id);
    expect(hero, `${style.id} has no figure in src/styles/heroes.ts`).toBeDefined();
    expect(style.blurb, `${style.id} blurb`).toContain(hero?.name ?? "\u0000");
  }
});

test("the chosen figures are the ones agreed on the board", () => {
  const chosen = Object.fromEntries(Object.entries(HEROES).map(([id, hero]) => [id, hero.name]));
  expect(chosen).toEqual({
    boxer: "Polydeuces",
    jiu_jitsu: "Theseus",
    karate: "Heracles",
    kung_fu: "Proteus",
    taekwondo: "Achilles",
  });
  expect(heroFor("no_such_style")).toBeUndefined();
});

test("every figure is complete: a title, a reason, a source, a look and two colours, and no figure is used twice", () => {
  const heroes = Object.entries(HEROES);
  expect(new Set(heroes.map(([, hero]) => hero.name)).size).toBe(heroes.length);
  for (const [id, hero] of heroes) {
    for (const text of [hero.name, hero.epithet, hero.why, hero.source, hero.look]) {
      expect(text.trim().length, id).toBeGreaterThan(3);
    }
    // One line each: the style screen has little room.
    expect(hero.why.length, `${id} why`).toBeLessThanOrEqual(130);
    for (const colour of hero.colors) expect(colour, id).toMatch(/^#[0-9a-f]{6}$/);
    expect(hero.colors[0]).not.toBe(hero.colors[1]);
  }
});
