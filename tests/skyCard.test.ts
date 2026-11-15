import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { keyLabel } from "../src/hud/Hud";
import { SkyPromptCard, longestWord } from "../src/hud/sky/SkyPromptCard";
import { MOVES } from "../src/moves/registry";

function move(id: string) {
  const m = MOVES.get(id);
  if (!m) throw new Error(`no move ${id}`);
  return m;
}

describe("SkyPromptCard at every mastery level", () => {
  for (const successes of [0, 2, 6]) {
    for (const id of ["hook", "block", "dodge_left"]) {
      it(`${id} at ${String(successes)} successes shows the word, the key and the timer`, () => {
        const m = move(id);
        const html = renderToStaticMarkup(createElement(SkyPromptCard, { move: m, target: "t", successes, left: 0.5 }));
        expect(html).toContain(m.prompt);
        expect(html).toContain(`<kbd>${keyLabel(m.key)}</kbd>`);
        expect(html).toContain('role="meter"');
        expect(html).toContain('aria-valuenow="50"');
        expect(html.includes("HOLD")).toBe(false); // a defend made once counts, so no card asks for a hold
        expect(html).toContain("move-guide"); // the moving figure stays at every mastery level: it is how the player knows the pose
      });
    }
  }
});

describe("SkyPromptCard kinds", () => {
  it("tells DEFEND, STRIKE and FINISH apart by tag word and shape class", () => {
    const render = (id: string, finisher: boolean) => renderToStaticMarkup(createElement(SkyPromptCard, { move: move(id), target: "t", successes: 0, left: 1, finisher }));
    const defend = render("dodge_left", false), strike = render("hook", false), finish = render("hook", true);
    expect(defend).toContain("DEFEND");
    expect(defend).toContain("sky-card--defend");
    expect(strike).toContain("STRIKE");
    expect(strike).toContain("sky-card--strike");
    expect(finish).toContain("FINISH");
    expect(finish).toContain("sky-card--finish");
    expect(finish).toContain("sky-card__burst");
    expect(strike).not.toContain("sky-card__burst");
  });
});

describe("SkyPromptCard move names", () => {
  it("sizes the name by its longest word, so it breaks only between words", () => {
    expect(longestWord("OVERHEAD STRIKE")).toBe(8);
    expect(longestWord("DODGE LEFT")).toBe(5);
    expect(longestWord("")).toBe(1);
    const html = renderToStaticMarkup(createElement(SkyPromptCard, { move: move("hook"), target: "t", successes: 0, left: 1 }));
    expect(html).toContain(`--chars:${String(longestWord(move("hook").prompt))}`);
  });
});
