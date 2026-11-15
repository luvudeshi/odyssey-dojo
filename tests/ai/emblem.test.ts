// With no picture of the player (the lot), the reveal's portrait circle holds the god's emblem, never an empty disc.
import { expect, test } from "vitest";
import { EMBLEMS, emblemPortrait, emblemSvg, firstPortrait } from "../../src/ai/gods/emblem";
import { GODS, GOD_IDS } from "../../src/ai/gods/gods";
import { revealGod } from "../../src/ai/revealGod";

test("every god has an emblem of its own, drawn as one self-contained SVG", () => {
  const drawings = new Set<string>();
  for (const god of GOD_IDS) {
    expect(EMBLEMS[god].name.length).toBeGreaterThan(2);
    const svg = emblemSvg(god);
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    // Nothing is fetched: the only address in it is the SVG namespace, and every reference is to its own parts.
    expect(svg.match(/https?:[^"]*/g)).toEqual(["http://www.w3.org/2000/svg"]);
    expect(svg).not.toMatch(/<image|<script|@import/);
    // The god's own colour is in the picture, and so is the laurel the marble portrait wears.
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(GODS[god].accent.slice(at, at + 2), 16));
    expect(svg).toContain(`rgb(${String(r)},${String(g)},${String(b)})`);
    expect(svg.match(/href="#leaf"/g)?.length).toBeGreaterThan(20);
    drawings.add(EMBLEMS[god].draw("ink", "cut"));
  }
  expect(drawings.size).toBe(GOD_IDS.length);
});

test("the emblem is a picture an img can show without the network", () => {
  for (const god of GOD_IDS) {
    const url = emblemPortrait(god);
    expect(url.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(url.slice(url.indexOf(",") + 1))).toBe(emblemSvg(god));
  }
});

test("no picture gives the emblem at once; a picture taken leaves the circle waiting for the portrait", () => {
  for (const god of GOD_IDS) {
    expect(firstPortrait(god, false)).toBe(emblemPortrait(god));
    expect(firstPortrait(god, true)).toBeNull();
  }
});

test("the lot's reveal resolves its portrait to the emblem, as the screen asks for it", async () => {
  const reveal = await revealGod(
    { snapshot: null, frame: null, tint: null, seed: 7 },
    { request: () => Promise.reject(new Error("the lot must not call the server")), drawPortrait: emblemPortrait },
  );
  expect(await reveal.portrait).toBe(emblemPortrait(reveal.god));
});
