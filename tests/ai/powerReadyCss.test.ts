// The "power is ready" stylesheet, read as text: every rule is scoped to the banner with two classes, it never takes a
// click, its colours are the god's accent or a theme variable with a fallback, and it has a rule for every class it uses.
// It does not read the theme and pins no theme colour: the theme is being replaced, and the fallbacks cover a missing name.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const SHEET = readFileSync("src/ai/power/powerReady.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const BANNER = readFileSync("src/ai/power/PowerReady.tsx", "utf8");

interface Rule {
  readonly selector: string;
  readonly declarations: ReadonlyMap<string, string>;
}

/** Every innermost "selector { property: value; }" block. Keyframe stops come out as rules too. */
function parse(css: string): Rule[] {
  const found: Rule[] = [];
  for (const [, selectors = "", body = ""] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = new Map<string, string>();
    for (const line of body.split(";")) {
      const colon = line.indexOf(":");
      if (colon > 0) declarations.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
    }
    for (const selector of selectors.split(",")) found.push({ selector: selector.trim(), declarations });
  }
  return found;
}

/** Keyframe stops ("from", "50%") style no element of their own. */
const RULES = parse(SHEET).filter((rule) => !/^(from|to|\d+%)$/.test(rule.selector));

test("every rule sits under .power-ready with two classes, so the theme cannot override it and nothing leaks out", () => {
  expect(RULES.length).toBeGreaterThanOrEqual(10);
  for (const rule of RULES) {
    const selector = rule.selector;
    expect(selector).toMatch(/^\.power-ready[ .]/);
    expect(selector.match(/\.[\w-]+/g)?.length ?? 0, selector).toBeGreaterThanOrEqual(2);
    // No bare element or id selectors: only the banner's own classes, and "*" for its descendants.
    expect(selector.replace(/\.power-ready[\w-]*/g, "").trim(), selector).toMatch(/^\*?$/);
  }
});

test("it never hides for something outside the banner: a defend fills the meter, and the banner must stay up while the DODGED chip shows", () => {
  expect(RULES.filter((rule) => !rule.selector.startsWith(".power-ready")).map((rule) => rule.selector)).toEqual([]);
  expect(SHEET).not.toContain(":has(");
  expect(SHEET).not.toContain("hb-defend");
  // Nothing but the entrance keyframe ever takes the banner to opacity 0.
  for (const rule of RULES) expect(rule.declarations.get("opacity") ?? "1", rule.selector).not.toBe("0");
});

test("keyframes carry the banner's name, so they cannot replace another stylesheet's", () => {
  const names = [...SHEET.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1] ?? "");
  expect(names.length).toBeGreaterThan(0);
  for (const name of names) expect(name).toMatch(/^power-ready-/);
  for (const rule of RULES) {
    const used = rule.declarations.get("animation");
    if (used === undefined || used === "none") continue;
    // Each animation in the list starts with its name.
    for (const each of used.split(",")) expect(names, rule.selector).toContain(each.trim().split(/\s+/)[0]);
  }
});

test("the banner and everything in it lets clicks through", () => {
  const root = RULES.find((rule) => rule.selector === ".power-ready.power-ready--live")?.declarations;
  expect(root?.get("pointer-events")).toBe("none");
  expect(root?.get("position")).toBe("absolute");
  expect(RULES.find((rule) => rule.selector === ".power-ready.power-ready--live *")?.declarations.get("pointer-events")).toBe("none");
  for (const rule of RULES) expect(rule.declarations.get("pointer-events") ?? "none", rule.selector).toBe("none");
});

test("it is centred on the lower edge of the fight, and is wide, not tall: the name on the left, the gesture on the right", () => {
  const root = RULES.find((rule) => rule.selector === ".power-ready.power-ready--live")?.declarations;
  expect(root?.get("left")).toBe("var(--power-ready-left, 0px)");
  expect(root?.get("right")).toBe("var(--power-ready-right, 0px)");
  expect(root?.get("justify-content")).toBe("center");
  expect(root?.get("bottom")).toMatch(/^var\(--power-ready-bottom, clamp\(\d+px, [\d.]+vh, \d+px\)\)$/);
  expect(root?.has("top")).toBe(false);
  const plate = RULES.find((rule) => rule.selector === ".power-ready .power-ready__plate")?.declarations;
  expect(plate?.get("grid-template-areas")).toBe('"title how" "move how"');
});

test("the champion plate sits just right of the power ring, level with it, still, and leaves a narrow screen", () => {
  const ring = /\.power-circle \{[^}]*--pc-size: (clamp\([^;]+\));[^}]*bottom: (clamp\([^;]+\));/.exec(readFileSync("src/hud/powerCircle.css", "utf8"));
  const [, size = "?", bottom = "?"] = ring ?? [];
  const plate = RULES.find((rule) => rule.selector === ".power-ready.power-ready--champion" && rule.declarations.has("position"))?.declarations;
  expect(plate?.get("position")).toBe("absolute");
  // The ring's own size and bottom offset, read from the HUD's sheet: a resized ring must fail here, not slide under the plate.
  expect(plate?.get("left")).toBe(`calc(50% + ${size} / 2 + clamp(8px, 0.9vw, 14px))`);
  expect(plate?.get("bottom")).toBe(bottom);
  expect(plate?.get("height")).toBe(size);
  expect(plate?.has("animation")).toBe(false);
  expect(SHEET).toMatch(/@media \(max-width: 760px\) \{\s*\.power-ready\.power-ready--champion \{ display: none; \}/);
});

test("colours are the god's accent or a theme variable, each with a fallback for a theme that drops the name", () => {
  let coloured = 0;
  for (const rule of RULES) {
    for (const property of ["color", "background", "border", "border-color"]) {
      const value = rule.declarations.get(property);
      if (value === undefined) continue;
      coloured += 1;
      expect(value, `${rule.selector} ${property}`).toMatch(/var\(--(power-ready-accent|ink|white), #[0-9a-f]{6}\)/);
      // Nothing but the variable paints: no second colour beside it.
      expect(value.replace(/var\([^)]*\)/g, ""), `${rule.selector} ${property}`).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    }
  }
  expect(coloured).toBeGreaterThanOrEqual(8);
  // Every var() in the sheet has a fallback, sizes and positions included.
  for (const use of SHEET.match(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g) ?? []) expect(use).toMatch(/^var\(--[\w-]+,\s*\S/);
});

test("the god's accent reaches the sheet as --power-ready-accent, set by the banner itself", () => {
  expect(BANNER).toContain('"--power-ready-accent": prompt.accent');
  expect(SHEET).toContain("var(--power-ready-accent,");
});

test("the pulse is off for a player who asked for less motion, and only moves and fades", () => {
  expect(SHEET).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.power-ready \.power-ready__frame \{ animation: none; \}/);
  const stops = parse([...SHEET.matchAll(/@keyframes[^{]+\{((?:[^{}]*\{[^{}]*\})+)\s*\}/g)].map((match) => match[1] ?? "").join("\n"));
  expect(stops.length).toBeGreaterThan(0);
  for (const stop of stops) for (const property of stop.declarations.keys()) expect(["transform", "opacity"]).toContain(property);
});

test("every class the banner uses has a rule, and every rule is for a class the banner uses", () => {
  const used = new Set([...BANNER.matchAll(/power-ready(?:__|--)[a-z]+/g)].map((match) => match[0]));
  const styled = new Set(RULES.flatMap((rule) => rule.selector.match(/power-ready(?:__|--)[a-z]+/g) ?? []));
  // The per-god class (power-ready--zeus) is a hook for later; it is built from the god's id and has no rule yet.
  expect([...used].sort()).toEqual([
    "power-ready--champion", "power-ready--keys", "power-ready--live", "power-ready__edge", "power-ready__frame", "power-ready__god",
    "power-ready__how", "power-ready__key", "power-ready__move", "power-ready__of", "power-ready__patron", "power-ready__plate",
    "power-ready__or", "power-ready__title",
  ].sort());
  expect([...styled].sort()).toEqual([...used].sort());
});
