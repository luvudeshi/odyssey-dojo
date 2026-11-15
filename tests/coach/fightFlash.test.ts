// The fight's feedback flash: which moments get one, when the body is read, how long it stays, one at a time,
// and what the MISS flash's element draws for each grade.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { startFight, step } from "../../src/combat/engine";
import {
  GRADE_KEYS, KEY_WINDOW_MS, MISS_MS, NO_FLASH, POP_HOLD_MS, POP_IN_MS, POP_OUT_MS, POP_TOTAL_MS,
  createFeedbackWatch, defendJustCounted, flashMs, flashStep, spokenLine,
} from "../../src/coach/extra/fightFlash";
import type { FlashFeedback, FlashState } from "../../src/coach/extra/fightFlash";
import { FEEDBACK_POINTS, strikeFeedback } from "../../src/coach/extra/strikeFeedback";
import type { FeedbackGrade } from "../../src/coach/extra/strikeFeedback";
import type { CombatEvent, CombatInput, CombatPhase, PoseHistory } from "../../src/core/types";
import { ENEMIES } from "../../src/enemies/registry";
import { defendCounted, defendSeen } from "../../src/hud/DefendFlash";
import { FeedbackWords, MissFlash } from "../../src/hud/MissFlash";
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
const GRADES: readonly FeedbackGrade[] = ["EXCELLENT", "GREAT", "GOOD", "NEEDS IMPROVEMENT"];
const result = (grade: FeedbackGrade, tip: string | null = null): FlashFeedback => ({ grade, points: FEEDBACK_POINTS[grade], tip });
/** A body that stands still and makes no move: read for any move, it has something to fix. */
const standing: PoseHistory = recording([[STANDING, 500]]).reduce(pushFrame, EMPTY_HISTORY);
const intro: CombatPhase = { kind: "intro", msLeft: 100 };
const hit = (move: string, quality: number): CombatEvent => ({ type: "enemyHit", move, damage: 10, quality });

/** A keyboard fight in 50 ms steps: every defend held as asked, every strike pressed on every other step. Returns each flash with its step's events. */
function playByKeys(steps: number, watched = true): { flashes: { feedback: FlashFeedback; events: readonly CombatEvent[] }[]; chips: number; score: number } {
  const watch = createFeedbackWatch();
  let state = startFight(enemy, 7);
  const flashes: { feedback: FlashFeedback; events: readonly CombatEvent[] }[] = [];
  let chips = 0;
  for (let i = 0; i < steps; i++) {
    const phase = state.phase;
    const strike = phase.kind === "strike" || phase.kind === "finisher" ? phase.move : null;
    const keys: CombatInput = phase.kind === "defend"
      ? { held: new Set([phase.attack.counter]), struck: [] }
      : strike !== null && i % 2 === 0 ? { held: new Set<string>(), struck: [{ move: strike, quality: 0.7, player: 0 }] } : idle;
    const next = step(state, enemy, style, keys, 50);
    if (defendCounted(defendSeen(phase), defendSeen(next.state.phase)) !== null) chips += 1;
    const feedback = watched ? watch(phase, next.state.phase, keys, next.events, standing, i * 50) : null;
    if (feedback) flashes.push({ feedback, events: next.events });
    state = next.state;
  }
  return { flashes, chips, score: state.score };
}

test("every strike that lands and every defend that counts gets one flash, and nothing else does", () => {
  const { flashes, chips } = playByKeys(1200);
  const strikes = flashes.filter((flash) => flash.events.some((event) => event.type === "enemyHit"));
  expect(strikes.length).toBeGreaterThan(3);
  // A defend's grade comes up with the HUD's defend chip: the same moments, counted by the HUD's own rule.
  expect(chips).toBeGreaterThan(3);
  expect(flashes.length - strikes.length).toBe(chips);
  // Standing still through the same fight: hits taken, attacks announced, time running out. No flash.
  const watch = createFeedbackWatch();
  let state = startFight(enemy, 7);
  for (let i = 0; i < 400; i++) {
    const next = step(state, enemy, style, idle, 50);
    expect(watch(state.phase, next.state.phase, idle, next.events, standing, i * 50)).toBeNull();
    state = next.state;
  }
});

test("the defend that counts is the one the HUD's chip calls out, at the same moment", () => {
  let state = startFight(enemy, 11);
  let seen = 0;
  for (let i = 0; i < 600; i++) {
    const phase = state.phase;
    // Made once, 300 ms into the warning, then let go; every third attack is held from before it was shown instead.
    const early = phase.kind === "defend" && phase.totalMs - phase.msLeft >= 300 && phase.totalMs - phase.msLeft < 400;
    const keys: CombatInput = early ? { held: new Set([phase.attack.counter]), struck: [] } : idle;
    const next = step(state, enemy, style, keys, 50).state;
    const chip = defendCounted(defendSeen(phase), defendSeen(next.phase));
    expect(defendJustCounted(phase, next.phase)).toBe(chip);
    if (chip !== null) seen += 1;
    state = next;
  }
  expect(seen).toBeGreaterThan(0);
});

test("a move made on a key is graded with no tip, even with the camera on; a move the body made is read from the body", () => {
  const fromBody = strikeFeedback("jab", standing, 0.7);
  const fromKey = strikeFeedback("jab", null, 0.7);
  // The made-up body stands still, so read as a jab it has a tip; the key press has none.
  expect(fromBody.tip).not.toBeNull();
  expect(fromKey.tip).toBeNull();
  const byKey: CombatInput = { held: new Set<string>(), struck: [{ move: "jab", quality: 0.7, player: 0 }] };
  expect(createFeedbackWatch()(intro, intro, byKey, [hit("jab", 0.7)], standing, 1000)).toEqual(fromKey);
  expect(createFeedbackWatch()(intro, intro, idle, [hit("jab", 0.7)], standing, 1000)).toEqual(fromBody);
  // No camera: no history, a grade from the strike's quality alone.
  expect(createFeedbackWatch()(intro, intro, idle, [hit("jab", 0.95)], null, 1000)).toEqual(strikeFeedback("jab", null, 0.95));
  // The key counts for a moment after the press, and for its own move only.
  const watch = createFeedbackWatch();
  expect(watch(intro, intro, byKey, [], standing, 1000)).toBeNull();
  expect(watch(intro, intro, idle, [hit("jab", 0.7)], standing, 1000 + KEY_WINDOW_MS)).toEqual(fromKey);
  expect(watch(intro, intro, idle, [hit("cross", 0.7)], standing, 1000 + KEY_WINDOW_MS)).toEqual(strikeFeedback("cross", standing, 0.7));
  expect(watch(intro, intro, idle, [hit("jab", 0.7)], standing, 1001 + KEY_WINDOW_MS)).toEqual(fromBody);
});

test("the bonus is shown only: the fight's score is the same with and without the feedback", () => {
  const withFeedback = playByKeys(600);
  expect(withFeedback.flashes.some((flash) => flash.feedback.points > 0)).toBe(true);
  expect(withFeedback.score).toBe(playByKeys(600, false).score);
  // And the module imports nothing that could change it or make a sound.
  expect(read("coach/extra/fightFlash.ts")).not.toMatch(/from "\.\.\/\.\.\/(combat|audio)\//);
});

test("a grade pops in, holds about 1.4 s and fades; MISS keeps its 700 ms; the stylesheet runs the same times", () => {
  expect(POP_HOLD_MS).toBeGreaterThanOrEqual(1300);
  expect(POP_HOLD_MS).toBeLessThanOrEqual(1500);
  expect(POP_TOTAL_MS).toBe(POP_IN_MS + POP_HOLD_MS + POP_OUT_MS);
  expect(flashMs({ id: 1, feedback: result("GREAT") })).toBe(POP_TOTAL_MS);
  expect(flashMs({ id: 1, feedback: null })).toBe(MISS_MS);
  expect(MISS_MS).toBe(700);
  expect(css).toContain(`animation: fb-flash ${String(POP_TOTAL_MS)}ms`);
  const percent = (ms: number): string => `${((ms / POP_TOTAL_MS) * 100).toFixed(1)}%`;
  expect(css).toContain(`${percent(POP_IN_MS)} { opacity: 1`);
  expect(css).toContain(`${percent(POP_IN_MS + POP_HOLD_MS)} { opacity: 1`);
});

test("one flash at a time: a new one replaces the one showing, and a replaced flash's timer cannot take the new one down", () => {
  const first = flashStep(NO_FLASH, { type: "show", feedback: result("GREAT") });
  expect(first.showing).toEqual({ id: 1, feedback: result("GREAT") });
  // A second result while the first is still fresh: only the second is left.
  const second = flashStep(first, { type: "show", feedback: result("NEEDS IMPROVEMENT", "Hands too low") });
  expect(second.showing).toEqual({ id: 2, feedback: result("NEEDS IMPROVEMENT", "Hands too low") });
  // The first one's timer fires late: nothing changes. The second one's own timer takes it down.
  expect(flashStep(second, { type: "expire", id: 1 })).toBe(second);
  expect(flashStep(second, { type: "expire", id: 2 }).showing).toBeNull();
  // A burst: never more than one, always the last.
  let state: FlashState = NO_FLASH;
  for (const grade of GRADES) state = flashStep(state, { type: "show", feedback: result(grade) });
  expect(state.showing?.feedback?.grade).toBe("NEEDS IMPROVEMENT");
  // MISS and a grade share the element: whichever came last is shown.
  const miss = flashStep(state, { type: "show", feedback: null });
  expect(miss.showing).toEqual({ id: 5, feedback: null });
  expect(flashStep(miss, { type: "show", feedback: result("GOOD") }).showing?.feedback?.grade).toBe("GOOD");
  // Ids never repeat, so a flash after an empty spell is still a new one.
  expect(flashStep(flashStep(miss, { type: "expire", id: 5 }), { type: "show", feedback: null }).showing?.id).toBe(6);
});

test("each grade shows its word, its points and the tip, and is read out politely as one sentence", () => {
  const tips: Readonly<Record<FeedbackGrade, string | null>> = { EXCELLENT: null, GREAT: "Elbow out", GOOD: "Hands too low", "NEEDS IMPROVEMENT": "Extend your arm fully" };
  const looks = new Set<string>();
  for (const grade of GRADES) {
    const tip = tips[grade];
    const out = renderToStaticMarkup(createElement(FeedbackWords, { feedback: result(grade, tip) }));
    expect(out).toContain(`<strong>${grade}</strong>`);
    expect(out).toContain(`<b>+${String(FEEDBACK_POINTS[grade])}</b>`);
    if (tip === null) expect(out).not.toContain("hb-feedback__tip");
    else expect(out).toContain(`>${tip}</span>`);
    // The MISS flash's own element and place, with the grade's own look.
    expect(out).toContain('class="hb-rating hb-feedback"');
    expect(out).toContain(`data-feedback="${GRADE_KEYS[grade]}"`);
    expect(css).toContain(`.hb-feedback[data-feedback="${GRADE_KEYS[grade]}"] {`);
    looks.add(GRADE_KEYS[grade]);
    expect(out).toContain('aria-live="polite"');
    expect(out).toContain(`aria-label="${spokenLine(result(grade, tip))}"`);
  }
  expect(looks.size).toBe(4);
  expect(spokenLine(result("NEEDS IMPROVEMENT", "Hands too low"))).toBe("Needs improvement, 25 points. Hands too low.");
  expect(spokenLine(result("EXCELLENT"))).toBe("Excellent, 150 points.");
});

test("nothing is drawn when there is no result", () => {
  expect(renderToStaticMarkup(createElement(MissFlash))).toBe("");
});

test("it stands still under reduced motion, uses no picture or font file, and makes no sound", () => {
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*[^{]*\.hb-rating\.hb-feedback \{ animation-name: fb-flash-still/);
  const still = /@keyframes fb-flash-still \{(.*)\}/.exec(css)?.[1] ?? "";
  expect(still).toContain("opacity: 1");
  expect(still).not.toMatch(/scale|translateY/);
  expect(css).not.toMatch(/url\(|@font-face|@import/);
  for (const file of ["coach/extra/fightFlash.ts", "hud/MissFlash.tsx"]) expect(read(file)).not.toMatch(/audio\/|speechSynthesis|new Audio|playVoice|speakLine/);
});
