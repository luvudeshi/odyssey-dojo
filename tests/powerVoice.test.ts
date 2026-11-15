// Athena's "your power is ready" line against the voice's priority rules: it says the god move's own call, an ordinary
// call cannot cut it, it does not cut a phase line or the result, and it never starts once the fight is over.
// Driven as tests/voicePriorities.test.ts is: the real audio modules over stand-in audio elements and a fake clock.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { GODS, GOD_IDS } from "../src/ai/gods/gods";
import type { ClipAudio } from "../src/audio/voice";
import type { CombatEvent } from "../src/core/types";
import { enemy as polyphemus } from "../src/enemies/defs/polyphemus";

/** How long each clip runs, in ms. The god calls are close to their real lengths; the test only needs them longer than a beat. */
const LENGTH: Readonly<Record<string, number>> = {
  call_cross: 2040, call_block: 1880, call_stake_thrust: 2770, phase_1: 1720, win: 3320, loss: 3790, praise_1: 1410, warn_1: 1150, fight_start: 1280,
  call_thunderbolt: 2100, call_trident_sweep: 1900, call_aegis_push: 1800, call_swift_dash: 1600, call_moon_arrow: 1700, call_sun_burst: 1750,
};

function attack(counter: string): CombatEvent {
  const found = polyphemus.attacks.find((each) => each.counter === counter);
  if (!found) throw new Error(`Polyphemus has no attack countered by ${counter}`);
  return { type: "telegraph", attack: found };
}
function opening(move: string): CombatEvent {
  return { type: "opening", weakSpot: polyphemus.weakSpots[0], move };
}
const hit: CombatEvent = { type: "enemyHit", move: "cross", damage: 12, quality: 1 };
const phaseTwo: CombatEvent = { type: "phaseChanged", index: 1, name: "The Club" };

/** Loads the audio modules afresh over stand-in audio elements that end on their own after the clip's length. */
async function startFight(missing: readonly string[] = []) {
  /** "id@ms" for every clip that started, ended on its own, or was cut off. */
  const started: string[] = [];
  const ended: string[] = [];
  const cut: string[] = [];
  class FakeAudio implements ClipAudio {
    volume = 1;
    private readonly id: string;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private onEnded: () => void = () => undefined;
    constructor(url: string) {
      this.id = url.slice(url.lastIndexOf("/") + 1).replace(".mp3", "");
    }
    play(): Promise<void> {
      started.push(`${this.id}@${String(Date.now())}`);
      this.timer = setTimeout(() => {
        this.timer = undefined;
        ended.push(`${this.id}@${String(Date.now())}`);
        this.onEnded();
      }, LENGTH[this.id] ?? 1500);
      return Promise.resolve();
    }
    pause(): void {
      if (this.timer === undefined) return;
      clearTimeout(this.timer);
      this.timer = undefined;
      cut.push(`${this.id}@${String(Date.now())}`);
    }
    addEventListener(type: "ended" | "error", listener: () => void): void {
      if (type === "ended") this.onEnded = listener;
    }
  }
  vi.resetModules();
  vi.stubGlobal("Audio", FakeAudio);
  const listed = Object.keys(LENGTH).filter((id) => !missing.includes(id));
  vi.stubGlobal("fetch", (url: string) => Promise.resolve({ ok: true, json: () => Promise.resolve(url.includes("athena") ? listed : []) }));
  vi.spyOn(Math, "random").mockReturnValue(0);
  const voice = await import("../src/audio/voice");
  await vi.advanceTimersByTimeAsync(0);
  return { voice, started, ended, cut };
}

beforeEach(() => {
  vi.useFakeTimers({ now: 0 });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test.each(GOD_IDS)("%s: the line is the god move's own call clip, and it reports that it was heard", async (god) => {
  const { voice, started, ended } = await startFight();
  const move = GODS[god].power.moveId;
  expect(voice.speakPowerReady(move)).toBe(true);
  expect(started).toEqual([`call_${move}@0`]);
  expect(voice.voicePlaying()).toBe(voice.powerLineId(move));
  await vi.advanceTimersByTimeAsync(4000);
  expect(ended).toEqual([`call_${move}@${String(LENGTH[`call_${move}`])}`]);
  expect(voice.voicePlaying()).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});

test("it cuts the opening call of the beat that filled the meter, and the calls that follow do not cut it", async () => {
  const { voice, started, ended, cut } = await startFight();
  // A defend fills the meter: the opening's call starts in that frame and the banner announces a moment later.
  voice.playVoice([{ type: "defended", attack: polyphemus.attacks[0] }, opening("cross")], { kind: "strike", move: "cross", weakSpot: polyphemus.weakSpots[0], msLeft: 3000, totalMs: 3000 });
  await vi.advanceTimersByTimeAsync(16);
  expect(voice.speakPowerReady("trident_sweep")).toBe(true);
  // Praise for the strike and the next attack's call both arrive while it plays, and both are dropped.
  await vi.advanceTimersByTimeAsync(600);
  voice.playVoice([hit]);
  await vi.advanceTimersByTimeAsync(700);
  voice.playVoice([attack("block")]);
  await vi.advanceTimersByTimeAsync(3000);
  expect(started).toEqual(["call_cross@0", "call_trident_sweep@16"]);
  expect(cut).toEqual(["call_cross@16"]);
  expect(ended).toEqual([`call_trident_sweep@${String(16 + (LENGTH.call_trident_sweep ?? 0))}`]);
  // Once it is over the calls are heard again.
  voice.playVoice([attack("block")]);
  expect(started.at(-1)).toBe("call_block@4316");
});

test("it does not cut a phase line: it is refused, and heard when asked again after the line", async () => {
  const { voice, started, ended, cut } = await startFight();
  voice.playVoice([hit, phaseTwo]);
  await vi.advanceTimersByTimeAsync(300);
  expect(voice.speakPowerReady("thunderbolt")).toBe(false);
  expect(voice.voicePlaying()).toBe("phase_1");
  await vi.advanceTimersByTimeAsync(3000);
  expect(voice.speakPowerReady("thunderbolt")).toBe(true);
  expect(started).toEqual(["phase_1@0", "call_thunderbolt@3300"]);
  expect(ended).toEqual(["phase_1@1720"]);
  expect(cut).toEqual([]);
});

test("a phase line takes the voice from it, as it does from a call", async () => {
  const { voice, started, cut } = await startFight();
  expect(voice.speakPowerReady("sun_burst")).toBe(true);
  await vi.advanceTimersByTimeAsync(400);
  voice.playVoice([hit, phaseTwo]);
  expect(started).toEqual(["call_sun_burst@0", "phase_1@400"]);
  expect(cut).toEqual(["call_sun_burst@400"]);
});

test.each(["won", "lost"] as const)("the result of a fight that is %s takes the voice from it, and it never starts after the result", async (result) => {
  const { voice, started, ended, cut } = await startFight();
  const line = result === "won" ? "win" : "loss";
  expect(voice.speakPowerReady("moon_arrow")).toBe(true);
  await vi.advanceTimersByTimeAsync(500);
  voice.playVoice([{ type: result }]);
  expect(cut).toEqual(["call_moon_arrow@500"]);
  // While the result line plays, and long after it has ended: the fight is over.
  await vi.advanceTimersByTimeAsync(1000);
  expect(voice.speakPowerReady("moon_arrow")).toBe(false);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(voice.speakPowerReady("moon_arrow")).toBe(false);
  expect(started).toEqual(["call_moon_arrow@0", `${line}@500`]);
  expect(ended).toEqual([`${line}@${String(500 + (LENGTH[line] ?? 0))}`]);
  // The next fight's opening line lifts the gate.
  expect(voice.speakLine("fight_start")).toBe(true);
  await vi.advanceTimersByTimeAsync(2000);
  expect(voice.speakPowerReady("moon_arrow")).toBe(true);
});

test("a meter that fills on the strike that ends the fight is not announced over the result", async () => {
  const { voice, started } = await startFight();
  voice.playVoice([hit, { type: "won" }]);
  expect(voice.speakPowerReady("aegis_push")).toBe(false);
  await vi.advanceTimersByTimeAsync(6000);
  expect(started).toEqual(["win@0"]);
});

test("it is refused in the finishing move, where the meter cannot be spent, and the finisher's call is heard", async () => {
  const { voice, started, cut } = await startFight();
  const finisher = { kind: "finisher", move: "stake_thrust", msLeft: 6000, totalMs: 6000 } as const;
  voice.playVoice([hit], finisher);
  expect(voice.speakPowerReady("swift_dash")).toBe(false);
  await vi.advanceTimersByTimeAsync(3000);
  expect(started).toEqual(["call_stake_thrust@0"]);
  expect(cut).toEqual([]);
});

test("the finisher's call waits for a power line that is still playing, then is spoken", async () => {
  const { voice, started, cut } = await startFight();
  const finisher = { kind: "finisher", move: "stake_thrust", msLeft: 6000, totalMs: 6000 } as const;
  expect(voice.speakPowerReady("trident_sweep")).toBe(true);
  await vi.advanceTimersByTimeAsync(500);
  voice.playVoice([hit], finisher);
  for (let ms = 0; ms < 4000; ms += 100) {
    await vi.advanceTimersByTimeAsync(100);
    voice.playVoice([], finisher);
  }
  // The power line ran its whole 1.9 s; the finisher's call followed at the next frame, once.
  expect(started).toEqual(["call_trident_sweep@0", "call_stake_thrust@1900"]);
  expect(cut).toEqual([]);
});

test("a retry from the pause menu: the new fight's opening line is not kept out by a power line", async () => {
  const { voice, started, cut } = await startFight();
  expect(voice.speakPowerReady("thunderbolt")).toBe(true);
  await vi.advanceTimersByTimeAsync(300);
  expect(voice.speakLine("fight_start")).toBe(true);
  expect(started).toEqual(["call_thunderbolt@0", "fight_start@300"]);
  expect(cut).toEqual(["call_thunderbolt@300"]);
});

test("with no clip for the move it stays silent, reports that, and holds nothing", async () => {
  const { voice, started } = await startFight(["call_aegis_push"]);
  expect(voice.speakPowerReady("aegis_push")).toBe(false);
  expect(voice.speakPowerReady("no_such_move")).toBe(false);
  expect(voice.voicePlaying()).toBeNull();
  voice.playVoice([attack("block")]);
  expect(started).toEqual(["call_block@0"]);
});
