// The "How do you fight?" stylesheet against the pebble look: colours only from theme variables, rules the menu's own cannot override, chips that are not kit buttons.
// It does not check contrast or size on screen: that was looked at in a browser. It never reads src/theme.css, only that every colour is a variable.
// This reads the CSS as text. It does not render anything.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const SHEET = readFileSync("src/ai/ui/styleScreen.css", "utf8");
const SCREEN = readFileSync("src/ai/ui/StyleScreen.tsx", "utf8");

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
/** True when a rule, or the element it is a state or part of, paints a background of its own. */
function hasPlaque(rule: Rule): boolean {
  const own = rule.declarations.get("background");
  if (own !== undefined) return own !== "transparent";
  const base = rule.selector.replace(/::?[\w-]+(\([^)]*\))?$/, "");
  const parent = base === rule.selector ? undefined : RULES.find((other) => other.selector === base)?.declarations.get("background");
  return parent !== undefined && parent !== "transparent";
}

test("every colour comes from a theme variable, so the screen follows the theme when it changes", () => {
  const coloured = RULES.filter((rule) => rule.declarations.has("color"));
  expect(coloured.length).toBeGreaterThanOrEqual(6);
  for (const rule of RULES) {
    for (const property of ["color", "background", "border-color"]) {
      const value = rule.declarations.get(property);
      if (value !== undefined && value !== "transparent" && value !== "none") expect(value, `${rule.selector} ${property}`).toMatch(/^var\(--[\w-]+\)$/);
    }
    expect([...rule.declarations.values()].join(" "), rule.selector).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  }
});

test("nothing readable is faded, and a pulsing label sits on its own plaque", () => {
  for (const rule of RULES) {
    if (rule.declarations.has("opacity")) expect(rule.selector).toMatch(/:disabled$/);
  }
  const stops = /@keyframes style-pulse\s*\{((?:[^{}]*\{[^{}]*\})+)\s*\}/.exec(SHEET)?.[1] ?? "";
  const faintest = Math.min(...parse(stops).map((stop) => Number(stop.declarations.get("opacity"))));
  expect(faintest).toBeGreaterThan(0);
  expect(faintest).toBeLessThan(1);
  const pulsing = RULES.filter((rule) => rule.declarations.get("animation")?.startsWith("style-pulse") === true);
  // Only the "Listening..." button pulses. The waiting line stands still at full strength: the stones under it do the moving.
  expect(pulsing.map((rule) => rule.selector).sort()).toEqual([".style-screen .style-listening"]);
  // A label that fades keeps a plaque of its own, so it never fades into whatever the theme puts behind the menu.
  for (const rule of pulsing) expect(hasPlaque(rule), rule.selector).toBe(true);
});

test("every rule sits under .style-screen with two classes, so it outranks the menu's .menu p rule", () => {
  expect(RULES.length).toBeGreaterThan(20);
  for (const { selector } of RULES) {
    if (selector === "main.style-screen") continue;
    expect(selector).toMatch(/^\.style-screen[ .]/);
    expect(selector.match(/\.[\w-]+/g)?.length ?? 0, selector).toBeGreaterThanOrEqual(2);
  }
});

test("every paragraph on the screen sets its own size, which the menu's .menu p would otherwise replace, and none is under 20 px", () => {
  const paragraphs = [...SCREEN.matchAll(/<p className="(style-[\w-]+)"/g)].map((match) => match[1] ?? "");
  expect([...paragraphs].sort()).toEqual(["style-heard", "style-kicker", "style-lede", "style-monster", "style-note", "style-said", "style-setting", "style-taunt", "style-working"]);
  for (const name of paragraphs) {
    const rule = RULES.find((candidate) => candidate.selector === `.style-screen .${name}`);
    expect(rule?.declarations.has("margin"), name).toBe(true);
    // Read from two metres away: a size in px is 20 or more, and the one clamp() starts at 2rem.
    const size = rule?.declarations.get("font-size") ?? "";
    expect(size, name).toMatch(/^(\d+px|clamp\(2rem, .+\))$/);
    if (size.endsWith("px")) expect(Number.parseInt(size, 10), name).toBeGreaterThanOrEqual(20);
  }
});

test("an example chip has no width floor, capitals or letter spacing: it is a quote, not a button label", () => {
  const chip = RULES.find((rule) => rule.selector === ".style-screen .style-chip")?.declarations;
  expect(chip?.get("min-width")).toBe("0");
  expect(chip?.get("text-transform")).toBe("none");
  expect(chip?.get("letter-spacing")).toBe("normal");
});

test("every class the screen uses has a rule, and every rule is for a class the screen uses", () => {
  const used = new Set([...SCREEN.matchAll(/style-[a-z]+/g)].map((match) => match[0]));
  const styled = new Set(RULES.flatMap((rule) => rule.selector.match(/style-[a-z]+/g) ?? []));
  for (const name of used) expect(styled, name).toContain(name);
  for (const name of styled) expect(used, name).toContain(name);
});
