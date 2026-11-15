import { expect, test } from "vitest";
import { fallsLine, holdFastLine } from "../src/enemies/wording";
import { ENEMIES } from "../src/enemies/registry";

test("the win headline agrees with every enemy", () => {
  const lines = Object.fromEntries(ENEMIES.map((e) => [e.id, fallsLine(e.id, e.name)]));
  expect(lines).toEqual({
    polyphemus: "Polyphemus falls",
    circe: "Circe falls",
    sirens: "The Sirens fall",
    scylla: "Scylla falls",
    charybdis: "Charybdis falls",
    suitors: "The Suitors fall",
  });
});

test("the intro line uses the right pronoun for every enemy", () => {
  const pronouns = Object.fromEntries(ENEMIES.map((e) => [e.id, /through (\w+)\.$/.exec(holdFastLine(e.id))?.[1]]));
  expect(pronouns).toEqual({ polyphemus: "him", circe: "her", sirens: "them", scylla: "her", charybdis: "her", suitors: "them" });
});

test("an unknown enemy gets a safe line", () => {
  expect(fallsLine("nobody", "The Stranger")).toBe("The Stranger falls");
  expect(holdFastLine("nobody")).not.toMatch(/\b(him|her|them)\b/);
});
