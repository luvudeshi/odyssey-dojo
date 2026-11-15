// The picture that goes back to the phone: where things go (pure layout), what they say, and that it is all readable.
import { describe, expect, test } from "vitest";
import { PLAYER_HP, startFight } from "../src/combat/engine";
import type { CombatState, MoveDef } from "../src/core/types";
import { ENEMIES } from "../src/enemies/registry";
import { wrapLines } from "../src/facetime/frameDraw";
import { HERO_HP, frameHud, gradeWord } from "../src/facetime/frameHud";
import { SAFE_MARGIN, barFill, containFit, coverCrop, figurePoint, fitFont, frameLayout, inside, overlaps } from "../src/facetime/frameLayout";
import type { FrameLayout, Rect } from "../src/facetime/frameLayout";
import { MOVES } from "../src/moves/registry";
import { rating } from "../src/pose/quality";

const enemy = ENEMIES[0];
if (!enemy) throw new Error("no enemy to test with");
const strike = [...MOVES.values()].find((move) => move.kind === "strike") as MoveDef;
const fresh = startFight(enemy, 1);
const READABLE: readonly (keyof FrameLayout)[] = ["enemyName", "enemyBar", "heroLabel", "heroBar", "clock", "tag", "figure", "word", "line", "timer", "grade"];

describe.each(["portrait", "landscape"] as const)("the %s frame", (shape) => {
  const layout = frameLayout(shape);
  const box = (name: keyof FrameLayout): Rect => layout[name] as Rect;

  test("is a phone-sized picture with a safe margin", () => {
    expect([layout.width, layout.height]).toEqual(shape === "portrait" ? [720, 1280] : [1280, 720]);
    expect(layout.safe).toEqual({ x: SAFE_MARGIN, y: SAFE_MARGIN, w: layout.width - SAFE_MARGIN * 2, h: layout.height - SAFE_MARGIN * 2 });
  });

  test("everything that must be read is inside the safe margin", () => {
    for (const name of READABLE) expect(inside(box(name), layout.safe), name).toBe(true);
  });

  test("the picture and the card fill the frame and do not overlap", () => {
    const whole: Rect = { x: 0, y: 0, w: layout.width, h: layout.height };
    expect(inside(layout.picture, whole)).toBe(true);
    expect(inside(layout.card, whole)).toBe(true);
    expect(overlaps(layout.picture, layout.card)).toBe(false);
  });

  test("the card's parts sit inside the card and clear of each other", () => {
    const parts: readonly (keyof FrameLayout)[] = ["tag", "figure", "word", "line", "timer"];
    for (const name of parts) expect(inside(box(name), layout.card), name).toBe(true);
    for (const a of parts) for (const b of parts) if (a !== b) expect(overlaps(box(a), box(b)), `${a} over ${b}`).toBe(false);
    expect(overlaps(layout.enemyBar, layout.heroBar)).toBe(false);
    expect(overlaps(layout.enemyName, layout.clock)).toBe(false);
  });

  test("is large enough to read on a phone", () => {
    // The frame is shown about 2.2 times smaller on a phone: a figure 250 px wide is still over 2.5 cm.
    expect(Math.min(layout.figure.w, layout.figure.h)).toBeGreaterThanOrEqual(250);
    expect(layout.word.h).toBeGreaterThanOrEqual(100);
    expect(layout.timer.h).toBeGreaterThanOrEqual(36);
    expect(layout.enemyBar.h).toBeGreaterThanOrEqual(26);
    expect(layout.timer.w).toBeGreaterThanOrEqual(360);
  });
});

describe("fitting pictures", () => {
  test("a wide fight is cut at the sides to fill a tall box, around the middle", () => {
    const crop = coverCrop(1280, 720, { x: 0, y: 180, w: 720, h: 560 });
    expect(crop.h).toBe(720);
    expect(crop.w).toBeCloseTo(720 * (720 / 560), 5);
    expect(crop.x).toBeCloseTo((1280 - crop.w) / 2, 5);
    expect(crop.y).toBe(0);
    expect(crop.w / crop.h).toBeCloseTo(720 / 560, 5);
  });

  test("a tall source is cut top and bottom, and a focus near an edge stays inside the source", () => {
    const tall = coverCrop(720, 1280, { x: 0, y: 0, w: 400, h: 400 });
    expect(tall).toEqual({ x: 0, y: 280, w: 720, h: 720 });
    const left = coverCrop(1280, 720, { x: 0, y: 0, w: 720, h: 720 }, 0);
    expect(left.x).toBe(0);
    const right = coverCrop(1280, 720, { x: 0, y: 0, w: 720, h: 720 }, 1);
    expect(right.x + right.w).toBe(1280);
    expect(coverCrop(0, 720, { x: 0, y: 0, w: 10, h: 10 })).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  test("the friend's upright picture is shown whole in the 4:3 box the detectors read", () => {
    const fit = containFit(720, 1280, 640, 480);
    expect(fit.h).toBe(480);
    expect(fit.w).toBeCloseTo(270, 5);
    expect(fit.x).toBeCloseTo(185, 5);
    expect(fit.y).toBe(0);
    // A webcam picture already has that shape.
    expect(containFit(640, 480, 640, 480)).toEqual({ x: 0, y: 0, w: 640, h: 480 });
    expect(containFit(1280, 720, 640, 480)).toEqual({ x: 0, y: 60, w: 640, h: 360 });
    expect(containFit(0, 0, 640, 480)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  test("the figure keeps its shape in a box that is not square", () => {
    const box = { x: 36, y: 820, w: 300, h: 340 };
    expect(figurePoint(box, 0, 0)).toEqual([36, 840]);
    expect(figurePoint(box, 100, 100)).toEqual([336, 1140]);
    expect(figurePoint(box, 50, 50)).toEqual([186, 990]);
  });

  test("bars and words", () => {
    const bar = { x: 10, y: 20, w: 200, h: 30 };
    expect(barFill(bar, 0.25)).toEqual({ x: 10, y: 20, w: 50, h: 30 });
    expect(barFill(bar, 7).w).toBe(200);
    expect(barFill(bar, -1).w).toBe(0);
    expect(barFill(bar, Number.NaN).w).toBe(0);
    expect(fitFont(3, 300, 120)).toBe(120);
    expect(fitFont(14, 300, 120)).toBe(34);
    expect(fitFont(200, 300, 120)).toBe(18);
    const measure = (line: string): number => line.length * 10;
    expect(wrapLines("Punch straight out with your front hand", 150, measure, 3)).toEqual(["Punch straight", "out with your", "front hand"]);
    expect(wrapLines("Punch straight out with your front hand", 150, measure, 2)).toEqual(["Punch straight", "out with your..."]);
    expect(wrapLines("", 150, measure, 2)).toEqual([]);
    expect(wrapLines("Supercalifragilistic", 50, measure, 2)).toEqual(["Supercalifragilistic"]);
  });
});

describe("what the frame says", () => {
  const base = { enemy, moves: MOVES, clock: "4:07", grade: null };
  const at = (phase: CombatState["phase"], more: Partial<CombatState> = {}): CombatState => ({ ...fresh, ...more, phase });
  const weakSpot = enemy.weakSpots[0];
  const attack = enemy.attacks[0];

  test("before a fight it tells the friend to step back, with the call clock", () => {
    const hud = frameHud({ ...base, state: null, enemy: null });
    expect(hud.word).toBe("STAND BACK");
    expect(hud.clock).toBe("4:07");
    expect(hud.timer).toBeNull();
    expect(hud.diagram).toBeNull();
  });

  test("a strike shows the move's word, its hint, its figure and the time left", () => {
    const hud = frameHud({ ...base, state: at({ kind: "strike", weakSpot, move: strike.id, msLeft: 900, totalMs: 3600 }, { enemyHp: enemy.hp / 2, playerHp: 40 }) });
    expect(hud).toMatchObject({ tone: "strike", tag: "STRIKE NOW", word: strike.prompt, line: strike.hint, timer: 0.25, enemyName: enemy.name, enemyShare: 0.5, heroShare: 0.4 });
    expect(hud.diagram).toBe(strike.diagram);
  });

  test("the finisher is its own card", () => {
    const hud = frameHud({ ...base, state: at({ kind: "finisher", move: strike.id, msLeft: 3000, totalMs: 3000 }) });
    expect(hud).toMatchObject({ tone: "finish", tag: "FINISH IT", word: strike.prompt, timer: 1 });
  });

  test("a defend is the host's: the friend is told to wait, with no figure to copy", () => {
    const hud = frameHud({ ...base, state: at({ kind: "defend", attack, msLeft: 500, totalMs: 1000 }) });
    expect(hud.tone).toBe("defend");
    expect(hud.tag).toBe("YOUR FRIEND DEFENDS");
    expect(hud.word).toBe(MOVES.get(attack.counter)?.prompt);
    expect(hud.line).toContain(attack.name);
    expect(hud.diagram).toBeNull();
    expect(hud.timer).toBe(0.5);
  });

  test("the rest of a fight: waiting, won, lost", () => {
    expect(frameHud({ ...base, state: at({ kind: "recover", msLeft: 400 }) })).toMatchObject({ tone: "calm", tag: "GET READY", timer: null });
    expect(frameHud({ ...base, state: at({ kind: "intro", msLeft: 400 }) }).tag).toBe("GET READY");
    expect(frameHud({ ...base, state: at({ kind: "won" }, { enemyHp: 0 }) })).toMatchObject({ tone: "won", tag: "VICTORY", enemyShare: 0, word: `${enemy.name.toUpperCase()} FALLS` });
    expect(frameHud({ ...base, state: at({ kind: "lost" }, { playerHp: 0 }) })).toMatchObject({ tone: "lost", word: "STRUCK DOWN", heroShare: 0 });
  });

  test("health is a share of the same maximum the engine uses, and never outside 0..1", () => {
    expect(HERO_HP).toBe(PLAYER_HP);
    expect(frameHud({ ...base, state: fresh })).toMatchObject({ heroShare: 1, enemyShare: 1 });
    expect(frameHud({ ...base, state: at({ kind: "won" }, { enemyHp: -20, playerHp: 400 }) })).toMatchObject({ heroShare: 1, enemyShare: 0 });
  });

  test("an unknown move still gives a word to read", () => {
    const hud = frameHud({ ...base, state: at({ kind: "strike", weakSpot, move: "made_up_move", msLeft: 100, totalMs: 100 }) });
    expect(hud.word).toBe("MADE_UP_MOVE");
    expect(hud.diagram).toBeNull();
  });

  test("the grade word: the best of the frame's hits, and TOGETHER beats them", () => {
    const hit = (quality: number, together?: true) => ({ type: "enemyHit" as const, move: strike.id, damage: 5, quality, ...(together ? { together } : {}) });
    expect(gradeWord([], rating)).toBeNull();
    expect(gradeWord([{ type: "whiffed" }], rating)).toBeNull();
    expect(gradeWord([hit(0.95)], rating)).toBe("PERFECT");
    expect(gradeWord([hit(0.85)], rating)).toBe("GREAT");
    expect(gradeWord([hit(0.6)], rating)).toBe("GOOD");
    expect(gradeWord([hit(0.2)], rating)).toBeNull();
    expect(gradeWord([hit(0.6), hit(0.95, true)], rating)).toBe("TOGETHER!");
  });
});
