// The fight's flash for attempts that need work: which moments get one (and that strong strikes get none), when the
// body is read, what the line under the word says, how long it stays, one at a time, and what the MISS flash's
// element draws for each case.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { startFight, step } from "../../src/combat/engine";
import {
  KEY_WINDOW_MS, MISS_MS, NO_FLASH, POP_HOLD_MS, POP_IN_MS, POP_OUT_MS, POP_TOTAL_MS, REACT_TIP, WORD_KEYS,
  createFeedbackWatch, failedDefend, flashMs, flashStep, howTo, keyReminder, landedStrike, missedStrike,
  shouldShowFeedback, spokenLine,
} from "../../src/coach/extra/fightFlash";
import type { FlashFeedback, FlashState, FlashWord } from "../../src/coach/extra/fightFlash";
import { FEEDBACK_POINTS, TIP_MAX, strikeFeedback } from "../../src/coach/extra/strikeFeedback";
import type { FeedbackGrade, StrikeFeedback } from "../../src/coach/extra/strikeFeedback";
import type { CombatEvent, CombatInput, CombatPhase, PoseHistory } from "../../src/core/types";
import { ENEMIES } from "../../src/enemies/registry";
import { FeedbackWords, MissFlash } from "../../src/hud/MissFlash";
import { MOVES } from "../../src/moves/registry";
import { EMPTY_HISTORY, pushFrame } from "../../src/pose/signals";
import { STYLES } from "../../src/styles/registry";
import { STANDING, recording } from "../poseFixture";

function first<T>(list: readonly T[]): T {
  const item = list[0];
  if (item === undefined) throw new Error("empty registry");
  return item;
}
const enemy = first(ENEMIES);
const style = first(STYLES);

const css = readFileSync(new URL("../../src/coach/extra/fightFlash.css", import.meta.url), "utf8");
const read = (path: string): string => readFileSync(new URL(`../../src/${path}`, import.meta.url), "utf8");
const idle: CombatInput = { held: new Set<string>(), struck: [] };
const graded = (grade: FeedbackGrade, tip: string | null): StrikeFeedback => ({ grade, points: FEEDBACK_POINTS[grade], tip });
/** A body that stands still and makes no move: read for any move, it has something to fix. */
const standing: PoseHistory = recording([[STANDING, 500]]).reduce(pushFrame, EMPTY_HISTORY);
const intro: CombatPhase = { kind: "intro", msLeft: 100 };
const jabPrompt: CombatPhase = { kind: "strike", move: "jab", msLeft: 1000, totalMs: 2000 } as CombatPhase;
const hit = (move: string, quality: number): CombatEvent => ({ type: "enemyHit", move, damage: 10, quality });

test("the story-mode rule: EXCELLENT and GREAT are never flashed; GOOD and NEEDS IMPROVEMENT only with a tip", () => {
  expect(shouldShowFeedback(graded("EXCELLENT", null))).toBe(false);
  expect(shouldShowFeedback(graded("EXCELLENT", "Hands too low"))).toBe(false);
  expect(shouldShowFeedback(graded("GREAT", null))).toBe(false);
  expect(shouldShowFeedback(graded("GREAT", "Guard hand by your chin"))).toBe(false);
  expect(shouldShowFeedback(graded("GOOD", null))).toBe(false);
  expect(shouldShowFeedback(graded("GOOD", "Turn your hips into it"))).toBe(true);
  expect(shouldShowFeedback(graded("NEEDS IMPROVEMENT", null))).toBe(false);
  expect(shouldShowFeedback(graded("NEEDS IMPROVEMENT", "Guard hand by your chin"))).toBe(true);
  expect(landedStrike(graded("GREAT", "Elbow out"))).toBeNull();
  expect(landedStrike(graded("NEEDS IMPROVEMENT", "Guard hand by your chin"))).toEqual({ word: "NEEDS IMPROVEMENT", tip: "Guard hand by your chin" });
});

test("a strong strike gets no flash; a weak one read from the body gets its tip; a key press gets none", () => {
  const watch = createFeedbackWatch();
  // No body (keyboard): a key press has one quality and nothing to fix, so nothing is flashed, whatever the grade.
  for (const quality of [0.3, 0.6, 0.85, 0.99]) expect(watch(intro, intro, idle, [hit("jab", quality)], null, 1000, false)).toBeNull();
  // A body that stood still, read as a jab: something to fix.
  const fromBody = strikeFeedback("jab", standing, 0.7);
  const shown = createFeedbackWatch()(intro, intro, idle, [hit("jab", 0.7)], standing, 1000, false);
  expect(shown).toEqual(landedStrike(fromBody));
  if (shouldShowFeedback(fromBody)) expect(shown?.tip).toBe(fromBody.tip);
  // The same strike made on a key while the camera is on: the body is not read for it.
  const byKey: CombatInput = { held: new Set<string>(), struck: [{ move: "jab", quality: 0.7, player: 0 }] };
  expect(createFeedbackWatch()(intro, intro, byKey, [hit("jab", 0.7)], standing, 1000, false)).toBeNull();
  const later = createFeedbackWatch();
  later(intro, intro, byKey, [], standing, 1000, false);
  expect(later(intro, intro, idle, [hit("jab", 0.7)], standing, 1000 + KEY_WINDOW_MS, false)).toBeNull();
});

test("a missed strike prompt flashes MISS with how to do it: the key on the keyboard, the body's tip or the move's own line on camera", () => {
  const ran = [{ type: "whiffed" } as CombatEvent];
  expect(createFeedbackWatch()(jabPrompt, intro, idle, ran, null, 2000, false)).toEqual({ word: "MISS", tip: keyReminder("jab", false) });
  expect(keyReminder("jab", false)).toBe(`Press ${(MOVES.get("jab")?.key ?? "").toUpperCase()}`);
  // A wrong key (the MISS watch fired): the key for the move asked.
  const wrong: CombatInput = { held: new Set<string>(), struck: [{ move: "cross", quality: 0.7, player: 0 }] };
  expect(createFeedbackWatch()(jabPrompt, jabPrompt, wrong, [], standing, 2000, true)).toEqual({ word: "MISS", tip: keyReminder("jab", false) });
  // On camera: the body over the prompt, else the move's first tip.
  const onCamera = missedStrike("jab", standing, 0);
  expect(onCamera.word).toBe("MISS");
  expect(onCamera.tip).toBe(strikeFeedback("jab", standing.frames).tip ?? howTo("jab"));
  expect(missedStrike("jab", { frames: [], baseline: null }, 0).tip).toBe(howTo("jab"));
  // Every askable move has a how-to that fits a glance.
  for (const id of MOVES.keys()) {
    const line = howTo(id);
    if (line !== null) expect(line.length).toBeLessThanOrEqual(TIP_MAX);
  }
  // Nothing asked, nothing flashed.
  expect(createFeedbackWatch()(intro, intro, idle, [], standing, 2000, false)).toBeNull();
});

test("a failed defend flashes NEEDS IMPROVEMENT: the key to hold on the keyboard, what went wrong on camera", () => {
  expect(failedDefend("block", null, 0, 1000)).toEqual({ word: "NEEDS IMPROVEMENT", tip: keyReminder("block", true) });
  expect(keyReminder("block", true)).toBe("Hold Space");
  for (const [id, move] of MOVES) if (move.key.startsWith("Arrow")) expect(keyReminder(id, true)).toMatch(/^Hold [←→↑↓]$/);
  expect(failedDefend("block", standing, 0, 1000)).toEqual({ word: "NEEDS IMPROVEMENT", tip: REACT_TIP });
});

/** A keyboard fight in 50 ms steps with the given choices. Returns each flash and the final score. */
function play(steps: number, choose: (phase: CombatPhase, i: number) => CombatInput, watched = true): { flashes: FlashFeedback[]; score: number; hits: number; strikes: number } {
  const watch = createFeedbackWatch();
  let state = startFight(enemy, 7);
  const flashes: FlashFeedback[] = [];
  let hits = 0;
  let strikes = 0;
  for (let i = 0; i < steps; i++) {
    const phase = state.phase;
    const keys = choose(phase, i);
    const next = step(state, enemy, style, keys, 50);
    hits += next.events.filter((event) => event.type === "playerHit").length;
    strikes += next.events.filter((event) => event.type === "enemyHit").length;
    const flash = watched ? watch(phase, next.state.phase, keys, next.events, null, i * 50, false) : null;
    if (flash) flashes.push(flash);
    state = next.state;
    if (state.phase.kind === "won" || state.phase.kind === "lost") break;
  }
  return { flashes, score: state.score, hits, strikes };
}

test("over a real keyboard fight: perfect play flashes nothing; doing nothing flashes a MISS per prompt and a NEEDS IMPROVEMENT per hit", () => {
  const perfect = play(1200, (phase, i) => (phase.kind === "defend"
    ? { held: new Set([phase.attack.counter]), struck: [] }
    : (phase.kind === "strike" || phase.kind === "finisher") && i % 2 === 0 ? { held: new Set<string>(), struck: [{ move: phase.move, quality: 0.7, player: 0 }] } : idle));
  expect(perfect.strikes).toBeGreaterThan(3);
  expect(perfect.flashes).toEqual([]);
  const still = play(600, () => idle);
  expect(still.hits).toBeGreaterThan(1);
  const words = still.flashes.map((flash) => flash.word);
  // One per hit taken (the hit that ends the fight gets none: the result panel is up).
  const failed = words.filter((word) => word === "NEEDS IMPROVEMENT").length;
  expect(failed).toBeGreaterThanOrEqual(still.hits - 1);
  expect(failed).toBeLessThanOrEqual(still.hits);
  expect(words.every((word) => word === "NEEDS IMPROVEMENT")).toBe(true);
  // Every defend held, no strike ever made: one MISS per strike prompt that runs out, with the key for it.
  const noStrikes = play(1200, (phase) => (phase.kind === "defend" ? { held: new Set([phase.attack.counter]), struck: [] } : idle));
  expect(noStrikes.flashes.length).toBeGreaterThan(2);
  for (const flash of noStrikes.flashes) expect(flash.word).toBe("MISS");
  for (const flash of still.flashes) expect(flash.tip).toMatch(/^(Press|Hold) /);
  // The flash is shown only: the fight's score is the same with and without it.
  expect(play(600, () => idle, false).score).toBe(still.score);
});

test("nothing it shows carries points, nothing is spoken, and it imports nothing that could change the score", () => {
  const source = read("coach/extra/fightFlash.ts");
  expect(source).not.toMatch(/from "\.\.\/\.\.\/(combat|audio)\//);
  for (const file of ["coach/extra/fightFlash.ts", "hud/MissFlash.tsx"]) expect(read(file)).not.toMatch(/audio\/|speechSynthesis|new Audio|playVoice|speakLine/);
  expect(read("hud/MissFlash.tsx")).not.toMatch(/points|\+\{/);
});

test("a flash with a line pops in, holds about 1.4 s and fades; a plain MISS keeps its 700 ms; the stylesheet runs the same times", () => {
  expect(POP_HOLD_MS).toBeGreaterThanOrEqual(1300);
  expect(POP_HOLD_MS).toBeLessThanOrEqual(1500);
  expect(flashMs({ id: 1, feedback: { word: "GOOD", tip: "Hands too low" } })).toBe(POP_TOTAL_MS);
  expect(flashMs({ id: 1, feedback: null })).toBe(MISS_MS);
  expect(MISS_MS).toBe(700);
  expect(POP_TOTAL_MS).toBe(POP_IN_MS + POP_HOLD_MS + POP_OUT_MS);
  expect(css).toContain(`animation: fb-flash ${String(POP_TOTAL_MS)}ms`);
  const percent = (ms: number): string => `${((ms / POP_TOTAL_MS) * 100).toFixed(1)}%`;
  expect(css).toContain(`${percent(POP_IN_MS)} { opacity: 1`);
  expect(css).toContain(`${percent(POP_IN_MS + POP_HOLD_MS)} { opacity: 1`);
});

test("one flash at a time: a new one replaces the one showing, and a replaced flash's timer cannot take the new one down", () => {
  const a: FlashFeedback = { word: "MISS", tip: "Press J" };
  const b: FlashFeedback = { word: "NEEDS IMPROVEMENT", tip: "Hold Space" };
  const first1 = flashStep(NO_FLASH, { type: "show", feedback: a });
  const second = flashStep(first1, { type: "show", feedback: b });
  expect(second.showing).toEqual({ id: 2, feedback: b });
  expect(flashStep(second, { type: "expire", id: 1 })).toBe(second);
  expect(flashStep(second, { type: "expire", id: 2 }).showing).toBeNull();
  let state: FlashState = NO_FLASH;
  for (const feedback of [a, b, null, a]) state = flashStep(state, { type: "show", feedback });
  expect(state.showing).toEqual({ id: 4, feedback: a });
});

test("each case is drawn with its word and its line, in its own look, and read out politely as one sentence", () => {
  const cases: readonly [string, FlashFeedback][] = [
    ["weak strike", { word: "NEEDS IMPROVEMENT", tip: "Guard hand by your chin" }],
    ["fair strike", { word: "GOOD", tip: "Turn your hips into it" }],
    ["missed prompt", { word: "MISS", tip: "Extend your arm fully" }],
    ["failed defend", { word: "NEEDS IMPROVEMENT", tip: REACT_TIP }],
    ["keyboard miss", { word: "MISS", tip: "Press J" }],
  ];
  for (const [, feedback] of cases) {
    const out = renderToStaticMarkup(createElement(FeedbackWords, { feedback }));
    expect(out).toContain(`>${feedback.word}</strong>`);
    expect(out).toContain(`>${feedback.tip ?? ""}</span>`);
    expect(out).toContain(`data-feedback="${WORD_KEYS[feedback.word]}"`);
    expect(out).toContain("hb-rating hb-feedback");
    expect(out).not.toMatch(/\+\d/);
    expect(out).toContain('aria-live="polite"');
    expect(out).toContain(`aria-label="${spokenLine(feedback)}"`);
  }
  for (const word of Object.keys(WORD_KEYS) as FlashWord[]) expect(css).toContain(`.hb-feedback[data-feedback="${WORD_KEYS[word]}"]`);
  expect(spokenLine({ word: "NEEDS IMPROVEMENT", tip: "Hands too low" })).toBe("Needs improvement. Hands too low.");
  expect(renderToStaticMarkup(createElement(MissFlash))).toBe("");
});

test("it stands still under reduced motion and uses no picture or font file", () => {
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*[^{]*\.hb-rating\.hb-feedback \{ animation-name: fb-flash-still/);
  const still = /@keyframes fb-flash-still \{(.*)\}/.exec(css)?.[1] ?? "";
  expect(still).not.toMatch(/scale|translateY/);
  expect(css).not.toMatch(/url\(|@font-face|@import/);
});
