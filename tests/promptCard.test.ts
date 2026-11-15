import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { promptLevel } from "../src/combat/engine";
import { keyLabel, PromptCard } from "../src/hud/Hud";
import { MOVES } from "../src/moves/registry";

describe("promptLevel", () => {
  it("shrinks with mastery in three steps and never goes away", () => {
    expect([0, 1, 2, 4, 5, 6, 50].map(promptLevel)).toEqual(["full", "full", "word", "word", "mini", "mini", "mini"]);
  });
});

describe("keyLabel", () => {
  it("upper-cases letters, spells out Space and leaves named keys", () => {
    expect([keyLabel("l"), keyLabel("j"), keyLabel(" "), keyLabel("ArrowLeft")]).toEqual(["L", "J", "Space", "ArrowLeft"]);
  });
});

describe("PromptCard at every mastery level", () => {
  for (const successes of [0, 2, 6]) {
    for (const id of ["hook", "block", "dodge_left"]) {
      it(`${id} at ${String(successes)} successes shows the word, the key and the timer`, () => {
        const move = MOVES.get(id);
        if (!move) throw new Error(`no move ${id}`);
        const html = renderToStaticMarkup(createElement(PromptCard, { move, target: "t", successes, left: 0.5 }));
        expect(html).toContain(move.prompt);
        expect(html).toContain(`<kbd>${keyLabel(move.key)}</kbd>`);
        expect(html).toContain('role="meter"');
        expect(html.includes("HOLD")).toBe(false); // a defend made once counts, so no card asks for a hold
        expect(html.includes("stick")).toBe(successes < 2);
      });
    }
  }
});
