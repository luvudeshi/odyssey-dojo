// Who is heard when Athena, a phase line and a monster's taunt all want to speak, replayed from a measured fight.
// In that fight Athena called every 0.7 to 3 seconds, the phase lines never played and the one taunt was cut after 0.1 s.
// These tests drive the same functions the fight screen calls, with stand-in audio elements and a fake clock.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ClipAudio } from "../src/audio/voice";
import type { CombatEvent } from "../src/core/types";
import { enemy as polyphemus } from "../src/enemies/defs/polyphemus";

/** How long each clip runs, in ms, as measured from the files. */
const LENGTH: Readonly<Record<string, number>> = {
  call_cross: 2040, call_uppercut: 2190, call_block: 1880, call_dodge_right: 1490,
  phase_1: 1720, phase_2: 2430, taunt_polyphemus_1: 3240, win: 3320, loss: 3790, praise_1: 1410, warn_1: 1150,
  fight_start: 2350, call_stake_thrust: 2770,
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
const phaseThree: CombatEvent = { type: "phaseChanged", index: 2, name: "Blinded" };
const isAthena = (clip: string): boolean => !clip.startsWith("taunt_");

/** Loads the audio modules afresh over stand-in audio elements that end on their own after the clip's real length. */
async function startFight() {
  /** "id@ms" for every clip that started, ended on its own, or was cut off. */
  const started: string[] = [];
  const ended: string[] = [];
  const cut: string[] = [];
  const volume = new Map<string, number>();
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
      volume.set(this.id, this.volume);
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
  vi.stubGlobal("fetch", (url: string) => Promise.resolve({ ok: true, json: () => Promise.resolve(url.includes("athena") ? Object.keys(LENGTH) : []) }));
  vi.spyOn(Math, "random").mockReturnValue(0);
  const voice = await import("../src/audio/voice");
  const story = await import("../src/audio/storyVoice");
  // Stands in for duckMusic in music.ts, which keeps the same set of names and dips while it is not empty.
  const dipFor = new Set<string>();
  voice.watchVoice((speaking, who = "voice") => {
    if (speaking) dipFor.add(who);
    else dipFor.delete(who);
  });
  await vi.advanceTimersByTimeAsync(0);
  /** What each taunt's promise resolved to, once it has. */
  const taunts: boolean[] = [];
  /** One frame of the fight loop, as FightScreen runs it: the taunt is asked for first, then Athena hears the events. */
  const frame = (events: readonly CombatEvent[]): void => {
    if (events.some((event) => event.type === "phaseChanged" && event.index > 0)) {
      void story.speakMonsterTaunt("polyphemus").then((heard) => taunts.push(heard));
    }
    voice.playVoice(events);
  };
  return { voice, story, frame, started, ended, cut, volume, dipFor, taunts };
}

/** The measured stretch: a strike call, the hit that changes the phase, then calls 0.7 to 1.7 s apart. */
async function replay() {
  const fight = await startFight();
  const { frame } = fight;
  frame([opening("cross")]);
  await vi.advanceTimersByTimeAsync(100);
  frame([hit, phaseTwo]);
  await vi.advanceTimersByTimeAsync(700);
  frame([attack("dodge_right")]);
  await vi.advanceTimersByTimeAsync(1200);
  const duringTaunt = [...fight.dipFor];
  await vi.advanceTimersByTimeAsync(500);
  frame([{ type: "defended", attack: polyphemus.attacks[0] }, opening("uppercut")]);
  await vi.advanceTimersByTimeAsync(700);
  frame([hit]);
  frame([attack("block")]);
  await vi.advanceTimersByTimeAsync(3000);
  return { ...fight, duringTaunt };
}

beforeEach(() => {
  vi.useFakeTimers({ now: 0 });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("a phase line takes the voice from a call and is heard to its end, and Athena's calls resume after it", async () => {
  const { started, ended, cut } = await replay();
  const athena = started.filter(isAthena);
  // The dodge call at 800 ms arrived while the phase line was playing, so it was dropped, not queued.
  expect(athena).toEqual(["call_cross@0", "phase_1@100", "call_uppercut@2500", "call_block@3200"]);
  expect(cut).toEqual(["call_cross@100", "call_uppercut@3200"]);
  expect(ended).toContain("phase_1@1820");
  expect(ended.at(-1)).toBe("call_block@5080");
});

test("a taunt starts with the phase change and plays to its end over two of Athena's calls, a little under her volume", async () => {
  const { voice, started, ended, cut, volume, taunts } = await replay();
  expect(started).toContain("taunt_polyphemus_1@100");
  expect(ended).toContain("taunt_polyphemus_1@3340");
  expect(cut.filter((clip) => clip.startsWith("taunt_"))).toEqual([]);
  // Both calls started while the taunt was playing, and neither waited for it.
  expect(started.slice(-2)).toEqual(["call_uppercut@2500", "call_block@3200"]);
  expect(voice.TAUNT_VOLUME).toBeGreaterThan(0.4);
  expect(voice.TAUNT_VOLUME).toBeLessThan(1);
  expect(volume.get("taunt_polyphemus_1")).toBeCloseTo(voice.TAUNT_VOLUME * (volume.get("call_block") ?? 0), 6);
  expect(taunts).toEqual([true]);
});

test("the music stays dipped while only the taunt is heard, and the dip is released when everything ends", async () => {
  const { dipFor, duringTaunt, voice, started } = await replay();
  // At 2000 ms the phase line is over and no call is playing: only the monster holds the dip.
  expect(duringTaunt).toEqual(["taunt"]);
  expect(voice.voicePlaying()).toBeNull();
  expect(started).toHaveLength(5);
  expect([...dipFor]).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
});

test("stopStory silences the taunt when the fight is left, and does not touch Athena's line", async () => {
  const { story, voice, frame, started, cut, dipFor, taunts } = await startFight();
  frame([hit, phaseTwo]);
  await vi.advanceTimersByTimeAsync(500);
  story.stopStory();
  expect(started).toEqual(["taunt_polyphemus_1@0", "phase_1@0"]);
  expect(cut).toEqual(["taunt_polyphemus_1@500"]);
  expect(voice.voicePlaying()).toBe("phase_1");
  expect([...dipFor]).toEqual(["voice"]);
  await vi.advanceTimersByTimeAsync(100);
  expect(taunts).toEqual([true]);
});

test("a won or lost fight silences the taunt in that frame, so the result line is heard clean", async () => {
  for (const result of ["won", "lost"] as const) {
    const { frame, started, cut, ended, dipFor } = await startFight();
    frame([hit, phaseTwo]);
    await vi.advanceTimersByTimeAsync(500);
    frame([{ type: result }]);
    const line = result === "won" ? "win" : "loss";
    expect(started, result).toEqual(["taunt_polyphemus_1@0", "phase_1@0", `${line}@500`]);
    expect(cut, result).toEqual(["taunt_polyphemus_1@500", "phase_1@500"]);
    expect([...dipFor], result).toEqual(["voice"]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(ended, result).toEqual([`${line}@${String(500 + (LENGTH[line] ?? 0))}`]);
    expect([...dipFor], result).toEqual([]);
    // The same in one frame: the taunt is asked for before playVoice, as the fight screen does, and is cut at once.
    const last = await startFight();
    last.frame([hit, phaseTwo, { type: result }]);
    expect(last.started, result).toEqual([`taunt_polyphemus_1@${String(Date.now())}`, `${line}@${String(Date.now())}`]);
    expect(last.cut, result).toEqual([`taunt_polyphemus_1@${String(Date.now())}`]);
    await vi.advanceTimersByTimeAsync(5000);
    vi.setSystemTime(0);
  }
});

test("a second phase change replaces the first phase line, and a taunt asked for again joins the one playing", async () => {
  const { frame, started, ended, cut, taunts } = await startFight();
  frame([hit, phaseTwo]);
  await vi.advanceTimersByTimeAsync(720);
  frame([hit, phaseThree]);
  await vi.advanceTimersByTimeAsync(3000);
  // Athena does not finish the stale line: the newer one cuts it and is heard to its end.
  expect(started).toEqual(["taunt_polyphemus_1@0", "phase_1@0", "phase_2@720"]);
  expect(cut).toEqual(["phase_1@720"]);
  expect(ended).toEqual(["phase_2@3150", "taunt_polyphemus_1@3240"]);
  // The dice picked the taunt already playing, so the second request joined it: heard once, and both resolve true.
  expect(taunts).toEqual([true, true]);
});

test("the finisher's call is spoken once the phase line ends, when the finisher begins in the frame the phase changes", async () => {
  const { voice, started } = await startFight();
  const finisher = { kind: "finisher", move: "stake_thrust", msLeft: 6000, totalMs: 6000 } as const;
  voice.playVoice([hit, phaseThree], finisher);
  for (let ms = 0; ms < 5000; ms += 100) {
    await vi.advanceTimersByTimeAsync(100);
    voice.playVoice([], finisher);
  }
  // Not at 6000 ms, when the finisher's window runs out, and only once.
  expect(started).toEqual(["phase_2@0", "call_stake_thrust@2500"]);
});

test("a retry soon after a phase change opens with fight_start, and the new fight's first call is spoken", async () => {
  const { voice, story, frame, started, cut } = await startFight();
  frame([hit, phaseThree]);
  await vi.advanceTimersByTimeAsync(300);
  // Leaving the old fight, then the new fight screen's first line.
  story.stopStory();
  expect(voice.speakLine("fight_start")).toBe(true);
  await vi.advanceTimersByTimeAsync(1500);
  frame([attack("block")]);
  expect(started.filter(isAthena)).toEqual(["phase_2@0", "fight_start@300", "call_block@1800"]);
  expect(cut).toEqual(["taunt_polyphemus_1@300", "phase_2@300", "fight_start@1800"]);
});
