// The sound of the god reveal: the sting at once, Athena's call of the god's move as the power line fades in, and
// neither over a line that is already being spoken nor after the screen was left.
import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { GODS, GOD_IDS } from "../../src/ai/gods/gods";
import { CALL_DELAY_MS, CALL_GIVE_UP_MS, CALL_RETRY_MS, revealSound } from "../../src/ai/ui/revealSound";

function fake(playing: () => string | null = () => null) {
  const heard: string[] = [];
  return {
    heard,
    deps: {
      sting: () => { heard.push("sting"); },
      speak: (id: string) => { heard.push(id); return true; },
      playing,
    },
  };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

test.each(GOD_IDS)("%s: the sting at once, then Athena calls the god's move when the power line fades in, from a clip that exists", (god) => {
  const { heard, deps } = fake();
  revealSound(god, deps);
  expect(heard).toEqual(["sting"]);
  vi.advanceTimersByTime(CALL_DELAY_MS - 1);
  expect(heard).toEqual(["sting"]);
  vi.advanceTimersByTime(1);
  const call = `call_${GODS[god].power.moveId}`;
  expect(heard).toEqual(["sting", call]);
  expect(existsSync(`public/audio/athena/${call}.mp3`)).toBe(true);
  expect(JSON.parse(readFileSync("public/audio/athena/index.json", "utf8"))).toContain(call);
  // Said once.
  vi.advanceTimersByTime(60_000);
  expect(heard).toEqual(["sting", call]);
});

test("the call waits for the power line's own delay in the reveal's stylesheet", () => {
  const delay = /\.reveal-power \{ animation: reveal-rise [\d.]+s ([\d.]+)s /.exec(readFileSync("src/ai/ui/reveal.css", "utf8"))?.[1];
  expect(Number(delay) * 1000).toBe(CALL_DELAY_MS);
});

test("it does not cut a line already being spoken (Homer's title line after a fast click): it waits for it to end", () => {
  let speaking: string | null = "homer_title";
  const { heard, deps } = fake(() => speaking);
  revealSound("poseidon", deps);
  vi.advanceTimersByTime(CALL_DELAY_MS + 2000);
  expect(heard).toEqual(["sting"]);
  speaking = null;
  vi.advanceTimersByTime(CALL_RETRY_MS);
  expect(heard).toEqual(["sting", "call_trident_sweep"]);
});

test("a voice that stays busy drops the call instead of saying it late", () => {
  const { heard, deps } = fake(() => "homer_title");
  revealSound("zeus", deps);
  vi.advanceTimersByTime(CALL_GIVE_UP_MS * 3);
  expect(heard).toEqual(["sting"]);
  expect(vi.getTimerCount()).toBe(0);
});

test("leaving the screen before the call calls it off", () => {
  const { heard, deps } = fake();
  const quiet = revealSound("apollo", deps);
  vi.advanceTimersByTime(CALL_DELAY_MS - 100);
  quiet();
  vi.advanceTimersByTime(60_000);
  expect(heard).toEqual(["sting"]);
  expect(vi.getTimerCount()).toBe(0);
});

test("a sound that throws does not break the reveal", () => {
  const quiet = revealSound("athena", { sting: () => { throw new Error("no audio"); }, speak: () => { throw new Error("no voice"); }, playing: () => null });
  expect(() => { vi.advanceTimersByTime(CALL_GIVE_UP_MS); }).not.toThrow();
  expect(() => { quiet(); }).not.toThrow();
});

test("the reveal screen starts the sound when the god is on screen and calls it off when it is left", () => {
  const screen = readFileSync("src/ai/ui/RevealScreen.tsx", "utf8");
  expect(screen).toContain("quiet.current = revealSound(reveal.god);");
  expect(screen).toMatch(/alive\.current = false;\s*quiet\.current\?\.\(\);/);
});
