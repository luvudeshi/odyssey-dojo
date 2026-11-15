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

test("it sits on the lower edge between the player's crescent and the prompt card, and runs under neither", () => {
  // Both neighbours are read from the Forge HUD's own sheets: a crescent or a card that moves must fail here, not slide under the plate.
  const forge = readFileSync("src/hud/sky/forge.css", "utf8");
  const card = readFileSync("src/hud/sky/card.css", "utf8");
  const middle = Number(/--fg-cres-x: (-?\d+)px;/.exec(forge)?.[1]);
  const width = Number(/\.sky-hud \.fg-crescent \{[^}]*width: (\d+)px;/.exec(forge)?.[1]);
  // How far left of the middle of the screen the crescent ends.
  const crescentEnd = -(middle + width / 2);
  expect(crescentEnd).toBeGreaterThan(0);
  const [, cardRight = "?", cardWidth = "?"] = /\.sky-card \{[^}]*right: (\d+)px;[^}]*width: (\d+)px;/.exec(card) ?? [];
  const cardSpan = Number(cardRight) + Number(cardWidth);
  const root = RULES.find((rule) => rule.selector === ".power-ready.power-ready--live")?.declarations;
  expect(root?.get("left")).toBe(`var(--power-ready-left, calc(50% - ${String(crescentEnd)}px + 14px))`);
  expect(root?.get("right")).toBe(`var(--power-ready-right, calc(${String(cardSpan)}px + 10px))`);
  expect(root?.get("justify-content")).toBe("flex-start");
  expect(root?.get("bottom")).toMatch(/^var\(--power-ready-bottom, clamp\(\d+px, [\d.]+vh, \d+px\)\)$/);
  expect(root?.has("top")).toBe(false);
  // The plate grows from the crescent's side and stops at the card's: it never spills out of the strip.
  expect(RULES.find((rule) => rule.selector === ".power-ready .power-ready__frame")?.declarations.get("max-width")).toBe("100%");
  // Two rows, the name over how to throw it: short enough to stay under the lifted ring.
  const plate = RULES.find((rule) => rule.selector === ".power-ready .power-ready__plate")?.declarations;
  expect(plate?.get("grid-template-areas")).toBe('"move" "how"');
  // On a big screen the HUD is drawn larger, the card with it: the strip ends sooner by the same factor.
  const [, big = "?", zoom = "?"] = /@media (\(min-width: \d+px\) and \(min-height: \d+px\)) \{\s*\.fight > \.sky-hud \{ zoom: ([\d.]+); \}/.exec(readFileSync("src/hud/sky/top.css", "utf8")) ?? [];
  expect(SHEET).toContain(`@media ${big} {\n  .power-ready.power-ready--live { right: var(--power-ready-right, calc(${String(cardSpan)}px * ${zoom} + 10px)); }`);
  // Upright on a phone the crescent is not at the foot of the screen: there the banner is centred, the title on top.
  expect(SHEET).toMatch(/@media \(max-width: 760px\) \{[^@]*\.power-ready\.power-ready--live \{ left: var\(--power-ready-left, 0px\); right: var\(--power-ready-right, 0px\); flex-direction: column; align-items: center; \}/);
  expect(SHEET).toMatch(/@media \(max-width: 760px\) \{[^@]*\.power-ready \.power-ready__beside \{ position: static;/);
});

test("whose power it is stands just right of the lifted ring, level with it, on two lines", () => {
  const ring = readFileSync("src/hud/powerCircle.css", "utf8");
  const size = /--pc-size: (clamp\([^;]+\));/.exec(ring)?.[1] ?? "?";
  // The ring's bottom offset while the banner is up, as the HUD's sheet writes it.
  const lifted = /\.power-circle\.is-lifted \{ bottom: calc\(([^;]+)\); \}/.exec(ring)?.[1] ?? "?";
  const root = RULES.find((rule) => rule.selector === ".power-ready.power-ready--live")?.declarations;
  const beside = RULES.find((rule) => rule.selector === ".power-ready .power-ready__beside")?.declarations;
  expect(beside?.get("position")).toBe("absolute");
  // From the strip's left edge: back to the middle of the screen, half the ring, and the gap the champion plate keeps.
  const [, crescentEnd = "?", gap = "?"] = /calc\(50% - (\d+px) \+ (\d+px)\)/.exec(root?.get("left") ?? "") ?? [];
  expect(beside?.get("left")).toBe(`calc(${crescentEnd} - ${gap} + ${size} / 2 + clamp(8px, 0.9vw, 14px))`);
  // From the strip's foot: the lifted ring's offset, less the strip's own.
  expect(beside?.get("bottom")).toBe(`calc(${lifted} - ${root?.get("bottom") ?? "?"})`);
  expect(beside?.get("height")).toBe(size);
  expect(beside?.get("align-items")).toBe("center");
  // Each line is as wide as its words and no wider, so the plate ends well short of the card.
  const title = RULES.find((rule) => rule.selector === ".power-ready .power-ready__title")?.declarations;
  expect(title?.get("white-space")).toBe("nowrap");
  expect(title?.has("max-width")).toBe(false);
  expect(RULES.find((rule) => rule.selector === ".power-ready .power-ready__tail")?.declarations.get("display")).toBe("block");
  expect(BANNER).toContain('<span className="power-ready__tail">{tail}</span>');
});

test("no text is under 18px on any screen", () => {
  let sized = 0;
  for (const rule of RULES) {
    const size = rule.declarations.get("font-size");
    if (size === undefined) continue;
    sized += 1;
    // Either a fixed size or a clamp, whose first number is the smallest it gets.
    const least = /^clamp\((\d+(?:\.\d+)?)px, [\d.]+vw, \d+(?:\.\d+)?px\)$/.exec(size)?.[1] ?? /^(\d+(?:\.\d+)?)px$/.exec(size)?.[1];
    expect(Number(least), `${rule.selector}: ${size}`).toBeGreaterThanOrEqual(18);
  }
  // Every element that holds words sets its own size; the key cap, the "or press" and the title's second line inherit it.
  for (const part of ["title", "move", "how", "wait", "of", "god"]) {
    expect(RULES.find((rule) => rule.selector === `.power-ready .power-ready__${part}`)?.declarations.has("font-size"), part).toBe(true);
  }
  expect(sized).toBeGreaterThanOrEqual(8);
  for (const rule of RULES) {
    const font = rule.declarations.get("font");
    if (font !== undefined) expect(font, rule.selector).toBe("inherit");
  }
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

test("between cards the plate dims, holds still and says to wait, 0.8 s late so the beat after a strike changes nothing; a kept press shows at once", () => {
  const rule = (selector: string): ReadonlyMap<string, string> | undefined => RULES.find((each) => each.selector === selector)?.declarations;
  const waiting = ".power-ready.power-ready--waiting";
  const queued = ".power-ready.power-ready--queued";
  // Hidden until the banner waits; then it stands where the key or the gesture was.
  expect(rule(".power-ready .power-ready__wait")?.get("visibility")).toBe("hidden");
  expect(rule(".power-ready .power-ready__wait")?.get("grid-area")).toBe("how");
  expect(rule(`${waiting} .power-ready__wait`)?.get("visibility")).toBe("visible");
  expect(rule(`${waiting} .power-ready__how`)?.get("visibility")).toBe("hidden");
  expect(rule(`${waiting} .power-ready__edge`)?.get("opacity")).toBe("0.55");
  // The entrance runs on; only the pulse (the second animation of the frame) holds.
  expect(rule(".power-ready .power-ready__frame")?.get("animation")).toMatch(/^power-ready-in [^,]+, power-ready-pulse /);
  expect(rule(`${waiting} .power-ready__frame`)?.get("animation-play-state")).toBe("running, paused");
  // Longer than the engine's beat after a strike, far shorter than the one after a phase change.
  const [, recover = "?", phaseRecover = "?"] = /const RECOVER_MS = (\d+);[\s\S]*const PHASE_RECOVER_MS = (\d+);/.exec(readFileSync("src/combat/engine.ts", "utf8")) ?? [];
  for (const part of ["edge", "how", "wait"]) {
    const delay = /(\d+(?:\.\d+)?)s$/.exec(rule(`${waiting} .power-ready__${part}`)?.get("transition") ?? "")?.[1];
    expect(Number(delay) * 1000, part).toBeGreaterThan(Number(recover));
    expect(Number(delay) * 1000, part).toBeLessThan(Number(phaseRecover) / 2);
    // Not a shorter delay: that would not move a transition that is already counting down.
    expect(rule(`${queued} .power-ready__${part}`)?.get("transition"), part).toBe("none");
    // Leaving the wait has no delay: the rule without --waiting carries none.
    expect(rule(`.power-ready .power-ready__${part}`)?.get("transition") ?? "", part).not.toMatch(/s \d/);
  }
  // The --queued rules come after the --waiting ones, so at equal weight they win.
  expect(SHEET.indexOf(`${queued} .power-ready__edge`)).toBeGreaterThan(SHEET.indexOf(`${waiting} .power-ready__edge`));
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
    "power-ready--champion", "power-ready--keys", "power-ready--live", "power-ready--queued", "power-ready--waiting", "power-ready__beside",
    "power-ready__edge", "power-ready__frame", "power-ready__god", "power-ready__how", "power-ready__key", "power-ready__move", "power-ready__of",
    "power-ready__patron", "power-ready__plate", "power-ready__or", "power-ready__tail", "power-ready__title", "power-ready__wait",
  ].sort());
  expect([...styled].sort()).toEqual([...used].sort());
});
