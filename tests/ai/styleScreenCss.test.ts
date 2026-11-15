// The "How do you fight?" stylesheet against the pottery theme: text that can be read on clay, rules the theme cannot override, chips that are not theme buttons.
// This reads the CSS as text. It does not render anything.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const SHEET = readFileSync("src/ai/ui/styleScreen.css", "utf8");
const THEME = readFileSync("src/theme.css", "utf8");
const SCREEN = readFileSync("src/ai/ui/StyleScreen.tsx", "utf8");

/** WCAG AA for body text. */
const READABLE = 4.5;
type Rgb = readonly [number, number, number];

interface Rule {
  readonly selector: string;
  readonly declarations: ReadonlyMap<string, string>;
}

/** Every innermost "selector { property: value; }" block, with comments removed. Keyframe stops come out as rules too. */
function parse(css: string): Rule[] {
  const found: Rule[] = [];
  for (const [, selectors = "", body = ""] of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = new Map<string, string>();
    for (const line of body.split(";")) {
      const colon = line.indexOf(":");
      if (colon > 0) declarations.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
    }
    for (const selector of selectors.split(",")) found.push({ selector: selector.trim(), declarations });
  }
  return found;
}

const ALL = parse(SHEET);
/** The rules that style an element, as opposed to keyframe stops such as "50%" and "from". */
const RULES = ALL.filter((rule) => /^(main)?\./.test(rule.selector));
const TOKENS = new Map(parse(THEME).flatMap((rule) => [...rule.declarations]));

function colour(value: string): Rgb {
  const token = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
  if (token !== undefined) return colour(TOKENS.get(token) ?? `no token ${token}`);
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (!hex) throw new Error(`not a colour this test can read: ${value}`);
  return [parseInt(hex[1] ?? "", 16), parseInt(hex[2] ?? "", 16), parseInt(hex[3] ?? "", 16)];
}

function luminance([r, g, b]: Rgb): number {
  const linear = (channel: number): number => {
    const share = channel / 255;
    return share <= 0.03928 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [dark, light] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

/** A colour drawn at `opacity` over `under`. */
function over(top: Rgb, under: Rgb, opacity: number): Rgb {
  const mix = (index: 0 | 1 | 2): number => top[index] * opacity + under[index] * (1 - opacity);
  return [mix(0), mix(1), mix(2)];
}

const CLAY = colour("var(--clay)");

/** What a rule's text is drawn on: its own background, the background of the element it is a state or part of, or the menu's clay. */
function ground(rule: Rule): Rgb | null {
  const own = rule.declarations.get("background");
  if (own !== undefined) return own === "transparent" ? null : colour(own);
  const base = rule.selector.replace(/::?[\w-]+(\([^)]*\))?$/, "");
  const parent = base === rule.selector ? undefined : RULES.find((other) => other.selector === base)?.declarations.get("background");
  return parent === undefined || parent === "transparent" ? null : colour(parent);
}

test("the theme tokens this test leans on are the ones on main", () => {
  expect(contrast(colour("var(--ink)"), CLAY)).toBeGreaterThan(READABLE);
  // The old dark-theme names now mean light clay and off-white: both are too faint for text laid straight on clay.
  expect(contrast(colour("var(--gold)"), CLAY)).toBeLessThan(READABLE);
  expect(contrast(colour("var(--marble)"), CLAY)).toBeLessThan(READABLE);
});

test("every colour the sheet sets can be read on what it sits on", () => {
  const coloured = RULES.filter((rule) => rule.declarations.has("color"));
  expect(coloured.length).toBeGreaterThanOrEqual(6);
  for (const rule of coloured) {
    const text = colour(rule.declarations.get("color") ?? "");
    expect(contrast(text, ground(rule) ?? CLAY), rule.selector).toBeGreaterThanOrEqual(READABLE);
  }
});

test("nothing readable is faded, and a pulsing label is still readable at its faintest", () => {
  for (const rule of RULES) {
    if (rule.declarations.has("opacity")) expect(rule.selector).toMatch(/:disabled$/);
  }
  const stops = /@keyframes style-pulse\s*\{((?:[^{}]*\{[^{}]*\})+)\s*\}/.exec(SHEET)?.[1] ?? "";
  const faintest = Math.min(...parse(stops).map((stop) => Number(stop.declarations.get("opacity"))));
  expect(faintest).toBeGreaterThan(0);
  expect(faintest).toBeLessThan(1);
  const pulsing = RULES.filter((rule) => rule.declarations.get("animation")?.startsWith("style-pulse") === true);
  expect(pulsing.map((rule) => rule.selector).sort()).toEqual([".style-screen .style-listening", ".style-screen .style-working"]);
  for (const rule of pulsing) {
    const plaque = ground(rule);
    if (plaque === null) throw new Error(`${rule.selector} pulses without a plaque of its own`);
    const text = colour(rule.declarations.get("color") ?? "");
    expect(contrast(over(text, CLAY, faintest), over(plaque, CLAY, faintest)), rule.selector).toBeGreaterThanOrEqual(READABLE);
  }
});

test("every rule sits under .style-screen with two classes, so it outranks the theme's .menu p and button rules", () => {
  expect(RULES.length).toBeGreaterThan(20);
  for (const { selector } of RULES) {
    if (selector === "main.style-screen") continue;
    expect(selector).toMatch(/^\.style-screen[ .]/);
    expect(selector.match(/\.[\w-]+/g)?.length ?? 0, selector).toBeGreaterThanOrEqual(2);
  }
});

test("every paragraph on the screen sets its own size, which the theme's .menu p would otherwise replace", () => {
  const paragraphs = [...SCREEN.matchAll(/<p className="(style-[\w-]+)"/g)].map((match) => match[1] ?? "");
  expect([...paragraphs].sort()).toEqual(["style-heard", "style-lede", "style-monster", "style-note", "style-said", "style-setting", "style-working"]);
  for (const name of paragraphs) {
    const rule = RULES.find((candidate) => candidate.selector === `.style-screen .${name}`);
    expect(rule?.declarations.has("font-size"), name).toBe(true);
    expect(rule?.declarations.has("margin"), name).toBe(true);
  }
});

test("an example chip undoes the theme button's width, capitals and letter spacing", () => {
  const chip = RULES.find((rule) => rule.selector === ".style-screen .style-chip")?.declarations;
  expect(chip?.get("min-width")).toBe("0");
  expect(chip?.get("text-transform")).toBe("none");
  expect(chip?.get("letter-spacing")).toBe("normal");
  expect(chip?.get("color")).toBe("var(--ink)");
});

test("every class the screen uses has a rule, and every rule is for a class the screen uses", () => {
  const used = new Set([...SCREEN.matchAll(/style-[a-z]+/g)].map((match) => match[0]));
  const styled = new Set(RULES.flatMap((rule) => rule.selector.match(/style-[a-z]+/g) ?? []));
  for (const name of used) expect(styled, name).toContain(name);
  for (const name of styled) expect(used, name).toContain(name);
});
