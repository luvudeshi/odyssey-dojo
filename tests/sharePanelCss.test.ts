// The share panel's stylesheet against the theme: colours only from theme variables or inherited, rules the theme cannot override, a small button that is not a theme button.
// It does not check contrast and does not read src/theme.css: the theme is being replaced, so readability needs a look in a browser once that lands.
// This reads the CSS as text. It does not render anything.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const SHEET = readFileSync("src/replay/ui/sharePanel.css", "utf8");
const PANEL = readFileSync("src/replay/ui/SharePanel.tsx", "utf8");

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

/** The rules that style an element, as opposed to keyframe stops such as "50%". */
const RULES = parse(SHEET).filter((rule) => /^(section)?\./.test(rule.selector));
const rule = (selector: string): ReadonlyMap<string, string> | undefined => RULES.find((candidate) => candidate.selector === selector)?.declarations;

test("every colour comes from a theme variable or from where the panel is mounted, so the panel follows the theme when it changes", () => {
  const THEMED = /^(var\(--[\w-]+\)|inherit|currentColor|transparent)$/;
  let coloured = 0;
  for (const { selector, declarations } of RULES) {
    for (const property of ["color", "background", "background-color", "border-color", "outline-color"]) {
      const value = declarations.get(property);
      if (value === undefined) continue;
      coloured += 1;
      expect(value, `${selector} ${property}`).toMatch(THEMED);
    }
    // A border or outline written in one line ends with its colour.
    for (const property of ["border", "outline"]) {
      const value = declarations.get(property);
      if (value === undefined || value === "none" || value === "0") continue;
      coloured += 1;
      expect(value.split(" ").at(-1), `${selector} ${property}`).toMatch(THEMED);
    }
    expect(declarations.has("box-shadow"), `${selector} box-shadow`).toBe(false);
  }
  expect(coloured).toBeGreaterThanOrEqual(4);
  expect(SHEET.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
});

test("every rule sits under .share-panel with two classes, so it outranks the theme's button and paragraph rules", () => {
  expect(RULES.length).toBeGreaterThanOrEqual(12);
  for (const { selector } of RULES) {
    if (selector === "section.share-panel") continue;
    expect(selector).toMatch(/^\.share-panel \./);
    expect(selector.match(/\.[\w-]+/g)?.length ?? 0, selector).toBeGreaterThanOrEqual(2);
  }
});

test("the small Close button undoes the theme button's width, capitals and letter spacing, and Share and Save undo its width", () => {
  const close = rule(".share-panel .share-quiet");
  expect(close?.get("min-width")).toBe("0");
  expect(close?.get("text-transform")).toBe("none");
  expect(close?.get("letter-spacing")).toBe("normal");
  expect(rule(".share-panel .share-action")?.get("min-width")).toBe("0");
});

test("the paragraph sets its own size and margin, which the theme's paragraph rules would otherwise replace", () => {
  const paragraphs = [...PANEL.matchAll(/<p className="(share-[\w-]+)"/g)].map((match) => match[1] ?? "");
  expect(paragraphs).toEqual(["share-small"]);
  expect(rule(".share-panel .share-small")?.has("font-size")).toBe(true);
  expect(rule(".share-panel .share-small")?.has("margin")).toBe(true);
});

test("nothing readable is faded: only a held button and the moving progress bar change opacity", () => {
  for (const { selector, declarations } of RULES) {
    if (declarations.has("opacity")) expect(selector).toBe(".share-panel .share-action:disabled");
  }
  const pulsing = RULES.filter((candidate) => candidate.declarations.get("animation")?.startsWith("share-pulse") === true);
  expect(pulsing.map((candidate) => candidate.selector)).toEqual([".share-panel .share-progress span"]);
});

test("every class the panel uses has a rule, and every rule is for a class the panel uses", () => {
  // "share-stage-" is completed by the upload's stage: card or video. Only the video stage needs a rule of its own.
  const used = new Set([...PANEL.matchAll(/share-[a-z]+(?:-[a-z]+)*/g)].map((match) => match[0]));
  used.delete("share-stage");
  const styled = new Set(RULES.flatMap((candidate) => candidate.selector.match(/share-[a-z]+(?:-[a-z]+)*/g) ?? []));
  styled.delete("share-stage-video");
  expect([...used].sort()).toEqual([...styled].sort());
  expect(PANEL).toContain("share-stage-${view.stage}");
  // The stage class must not be the card's own class, or the progress bar would take the card's size and border.
  expect(used).toContain("share-card");
  expect(PANEL).not.toContain("share-${");
});
