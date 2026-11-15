// Who is heard when Athena, a phase line and a monster's taunt all want to speak, replayed from measured fights.
// In the first fight Athena called every 0.7 to 3 seconds, the phase lines never played and the one taunt was cut after 0.1 s.
// In the second the taunt and the phase line started together and were heard over each other for about two seconds.
// These tests drive the same functions the fight screen calls, with stand-in audio elements and a fake clock.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ClipAudio } from "../src/audio/voice";
import type { CombatEvent } from "../src/core/types";
import { enemy as polyphemus } from "../src/enemies/defs/polyphemus";

/** How long each clip runs, in ms, as measured from the files. */
const LENGTH: Readonly<Record<string, number>> = {
  call_cross: 2040, call_uppercut: 2190, call_block: 1880, call_dodge_right: 1490,
  phase_1: 1720, phase_2: 2430, phase_any: 2430, taunt_polyphemus_1: 3240, taunt_polyphemus_4: 2690,
  win: 3320, loss: 3790, praise_1: 1410, warn_1: 1150, fight_start: 1280, call_stake_thrust: 2770,
  call_dodge_left: 1440, warn_3: 1360,
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
/** The player is hit by the attack this move would have countered. */
function struck(counter: string): CombatEvent {
  const landed = attack(counter);
  if (landed.type !== "telegraph") throw new Error("not a telegraph");
  return { type: "playerHit", attack: landed.attack, damage: landed.attack.damage };
}
const phaseTwo: CombatEvent = { type: "phaseChanged", index: 1, name: "The Club" };
const phaseThree: CombatEvent = { type: "phaseChanged", index: 2, name: "Blinded" };
const isAthena = (clip: string): boolean => !clip.startsWith("taunt_");
const isTaunt = (clip: string): boolean => clip.startsWith("taunt_");

/** The ms in the first "id@ms" entry for this clip. */
function when(list: readonly string[], id: string): number {
  const entry = list.find((each) => each.startsWith(`${id}@`));
  if (entry === undefined) throw new Error(`${id} is not in ${list.join(", ")}`);
  return Number(entry.slice(id.length + 1));
}

/** Runs the fake clock up to this time on it. */
async function until(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms - Date.now());
}

/** Loads the audio modules afresh over stand-in audio elements that end on their own after the clip's real length. `missing` clips are not in the index. */
async function startFight(missing: readonly string[] = []) {
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
  const listed = Object.keys(LENGTH).filter((id) => !missing.includes(id));
  vi.stubGlobal("fetch", (url: string) => Promise.resolve({ ok: true, json: () => Promise.resolve(url.includes("athena") ? listed : []) }));
  const random = vi.spyOn(Math, "random").mockReturnValue(0);
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
  return { voice, story, frame, started, ended, cut, volume, dipFor, taunts, random };
}

/** The first measured stretch: a strike call, the hit that changes the phase, then calls 0.7 to 1.7 s apart. */
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
  expect(ended.filter(isAthena).at(-1)).toBe("call_block@5080");
});

test("a taunt waits for the phase line to end, then plays to its end over two of Athena's calls, a little under her volume", async () => {
  const { voice, started, ended, cut, volume, taunts } = await replay();
  // The phase line ran from 100 to 1820 ms. The taunt looks every 100 ms, so it started at 1900.
  expect(started.filter(isTaunt)).toEqual(["taunt_polyphemus_1@1900"]);
  expect(ended).toContain("taunt_polyphemus_1@5140");
  expect(cut.filter(isTaunt)).toEqual([]);
  // Both calls started while the taunt was playing, and neither waited for it.
  expect(started.slice(-2)).toEqual(["call_uppercut@2500", "call_block@3200"]);
  expect(voice.TAUNT_VOLUME).toBeGreaterThan(0.4);
  expect(voice.TAUNT_VOLUME).toBeLessThan(1);
  expect(volume.get("taunt_polyphemus_1")).toBeCloseTo(voice.TAUNT_VOLUME * (volume.get("call_block") ?? 0), 6);
  expect(taunts).toEqual([true]);
});

test("the second measured fight: the opening line ends before the first call, and each taunt starts after its phase line and plays whole", async () => {
  const { voice, frame, started, ended, cut, taunts, random } = await startFight();
  // The times the clips started in the fight that was recorded, in ms. The calls between 2.4 and 13.6 s are left out.
  await until(700);
  expect(voice.speakLine("fight_start")).toBe(true);
  await until(2400);
  frame([attack("block")]);
  await until(13600);
  // The dice gave Polyphemus his fourth taunt here and his first at the next phase.
  random.mockReturnValue(0.99);
  frame([hit, phaseTwo]);
  await until(16000);
  frame([opening("cross")]);
  await until(21100);
  random.mockReturnValue(0);
  frame([hit, phaseThree]);
  await until(23800);
  frame([attack("dodge_right")]);
  await until(30000);

  // The opening line used to be cut by the first call. Now it is over 420 ms before it.
  expect(ended).toContain("fight_start@1980");
  expect(cut).toEqual([]);
  for (const [taunt, phaseLine, nextCall] of [
    ["taunt_polyphemus_4", "phase_1", "call_cross"],
    ["taunt_polyphemus_1", "phase_2", "call_dodge_right"],
  ] as const) {
    // Not together with the phase line, as in the recording, and no more than one look (100 ms) after it.
    expect(when(started, taunt), taunt).toBeGreaterThanOrEqual(when(ended, phaseLine));
    expect(when(started, taunt) - when(ended, phaseLine), taunt).toBeLessThanOrEqual(100);
    // Athena's next call starts while the taunt is playing, and the taunt runs its whole length.
    expect(when(started, nextCall), taunt).toBeGreaterThan(when(started, taunt));
    expect(when(started, nextCall), taunt).toBeLessThan(when(ended, taunt));
    expect(when(ended, taunt) - when(started, taunt), taunt).toBe(LENGTH[taunt]);
  }
  expect(started).toEqual([
    "fight_start@700", "call_block@2400", "phase_1@13600", "taunt_polyphemus_4@15400", "call_cross@16000",
    "phase_2@21100", "taunt_polyphemus_1@23600", "call_dodge_right@23800",
  ]);
  expect(taunts).toEqual([true, true]);
  expect(vi.getTimerCount()).toBe(0);
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

test("a phase change whose line has no clip gets its taunt in the same frame", async () => {
  const { frame, started, taunts } = await startFight(["phase_1"]);
  frame([hit, phaseTwo]);
  expect(started).toEqual([]);
  // One tick later, with no time passed: nothing holds the voice, so the taunt does not wait.
  await vi.advanceTimersByTimeAsync(0);
  expect(started).toEqual(["taunt_polyphemus_1@0"]);
  // Its promise resolves at the first look after the clip ends.
  await vi.advanceTimersByTimeAsync((LENGTH.taunt_polyphemus_1 ?? 0) + 100);
  expect(taunts).toEqual([true]);
  expect(vi.getTimerCount()).toBe(0);
});

test("a phase with no line of its own gets the generic line, and the taunt follows that line too", async () => {
  const { frame, started, cut, taunts } = await startFight();
  frame([hit, { type: "phaseChanged", index: 1, name: "The Whirlwind" }]);
  await vi.advanceTimersByTimeAsync(6000);
  expect(started).toEqual(["phase_any@0", "taunt_polyphemus_1@2500"]);
  expect(cut).toEqual([]);
  expect(taunts).toEqual([true]);
});

test("stopStory drops a taunt that is waiting for the phase line, and leaves no timer of its own", async () => {
  const { story, voice, frame, started, cut, taunts } = await startFight();
  frame([hit, phaseTwo]);
  await vi.advanceTimersByTimeAsync(500);
  // The phase line's clip, the limit on how long it may run, and the taunt's next look.
  expect(vi.getTimerCount()).toBe(3);
  story.stopStory();
  expect(vi.getTimerCount()).toBe(2);
  expect(voice.voicePlaying()).toBe("phase_1");
  await vi.advanceTimersByTimeAsync(0);
  expect(taunts).toEqual([false]);
  await vi.advanceTimersByTimeAsync(6000);
  expect(started).toEqual(["phase_1@0"]);
  expect(cut).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
});

test("stopStory silences the taunt when the fight is left, and does not touch Athena's line", async () => {
  const { story, voice, frame, started, cut, dipFor, taunts } = await startFight();
  frame([hit, phaseTwo]);
  await vi.advanceTimersByTimeAsync(2400);
  frame([opening("uppercut")]);
  await vi.advanceTimersByTimeAsync(100);
  story.stopStory();
  expect(started).toEqual(["phase_1@0", "taunt_polyphemus_1@1800", "call_uppercut@2400"]);
  expect(cut).toEqual(["taunt_polyphemus_1@2500"]);
  expect(voice.voicePlaying()).toBe("call_uppercut");
  expect([...dipFor]).toEqual(["voice"]);
  // Only Athena's clip and the limit on how long it may run are left.
  expect(vi.getTimerCount()).toBe(2);
  await vi.advanceTimersByTimeAsync(0);
  expect(taunts).toEqual([true]);
});

test.each(["won", "lost"] as const)("a fight that is %s silences the taunt in that frame, so the result line is heard clean", async (result) => {
  const { frame, started, cut, ended, dipFor, taunts } = await startFight();
  const line = result === "won" ? "win" : "loss";
  frame([hit, phaseTwo]);
  await vi.advanceTimersByTimeAsync(2500);
  frame([{ type: result }]);
  expect(started).toEqual(["phase_1@0", "taunt_polyphemus_1@1800", `${line}@2500`]);
  expect(cut).toEqual(["taunt_polyphemus_1@2500"]);
  expect([...dipFor]).toEqual(["voice"]);
  await vi.advanceTimersByTimeAsync(5000);
  expect(ended).toEqual(["phase_1@1720", `${line}@${String(2500 + (LENGTH[line] ?? 0))}`]);
  expect([...dipFor]).toEqual([]);
  expect(taunts).toEqual([true]);
  expect(vi.getTimerCount()).toBe(0);
});

test.each(["won", "lost"] as const)("a taunt still waiting when the fight is %s never starts", async (result) => {
  const { frame, started, cut, taunts } = await startFight();
  const line = result === "won" ? "win" : "loss";
  frame([hit, phaseTwo]);
  await vi.advanceTimersByTimeAsync(500);
  frame([{ type: result }]);
  // The result took the voice from the phase line. The taunt sees the voice free of it at its next look and is refused.
  await vi.advanceTimersByTimeAsync(100);
  expect(taunts).toEqual([false]);
  await vi.advanceTimersByTimeAsync(8000);
  expect(started).toEqual(["phase_1@0", `${line}@500`]);
  expect(cut).toEqual(["phase_1@500"]);
  expect(vi.getTimerCount()).toBe(0);
});

test("a taunt still waiting when the fight ends never starts, even when the result line has no clip to take the voice", async () => {
  const { frame, started, cut, taunts } = await startFight(["win"]);
  frame([hit, phaseTwo]);
  await vi.advanceTimersByTimeAsync(500);
  frame([{ type: "won" }]);
  await vi.advanceTimersByTimeAsync(8000);
  // The phase line played on to its end, and the taunt that waited for it was refused: the fight was over.
  expect(started).toEqual(["phase_1@0"]);
  expect(cut).toEqual([]);
  expect(taunts).toEqual([false]);
  expect(vi.getTimerCount()).toBe(0);
});

test.each(["won", "lost"] as const)("a phase change in the frame the fight is %s gets no taunt, and the next fight's phase change does", async (result) => {
  const { voice, frame, started, taunts } = await startFight();
  const line = result === "won" ? "win" : "loss";
  frame([hit, phaseTwo, { type: result }]);
  await vi.advanceTimersByTimeAsync(0);
  expect(taunts).toEqual([false]);
  await vi.advanceTimersByTimeAsync(5000);
  expect(started).toEqual([`${line}@0`]);
  // The next fight: its opening line, then a phase change.
  expect(voice.speakLine("fight_start")).toBe(true);
  await vi.advanceTimersByTimeAsync(2000);
  frame([hit, phaseTwo]);
  await vi.advanceTimersByTimeAsync(2000);
  expect(started.slice(1)).toEqual(["fight_start@5000", "phase_1@7000", "taunt_polyphemus_1@8800"]);
});

test("a taunt asked for after playVoice in a frame is treated the same: it waits for the phase line, and is refused once the fight is over", async () => {
  const { voice, story, started, taunts } = await startFight();
  const ask = (): void => {
    void story.speakMonsterTaunt("polyphemus").then((heard) => taunts.push(heard));
  };
  voice.playVoice([hit, phaseTwo]);
  ask();
  await vi.advanceTimersByTimeAsync(6000);
  expect(started).toEqual(["phase_1@0", "taunt_polyphemus_1@1800"]);
  voice.playVoice([hit, phaseThree, { type: "won" }]);
  ask();
  await vi.advanceTimersByTimeAsync(6000);
  expect(started.slice(2)).toEqual(["win@6000"]);
  expect(taunts).toEqual([true, false]);
});

test("a second phase change replaces the first phase line, and a taunt asked for again joins the one waiting", async () => {
  const { frame, started, ended, cut, taunts } = await startFight();
  frame([hit, phaseTwo]);
  await vi.advanceTimersByTimeAsync(720);
  frame([hit, phaseThree]);
  await vi.advanceTimersByTimeAsync(6000);
  // Athena does not finish the stale line: the newer one cuts it and is heard to its end. The taunt waits for that one.
  expect(started).toEqual(["phase_1@0", "phase_2@720", "taunt_polyphemus_1@3200"]);
  expect(cut).toEqual(["phase_1@720"]);
  expect(ended).toEqual(["phase_2@3150", "taunt_polyphemus_1@6440"]);
  // The dice picked the taunt already waiting, so the second request joined it: heard once, and both resolve true.
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

test("a retry soon after a phase change opens with fight_start, which ends before the new fight's first call", async () => {
  const { voice, story, frame, started, ended, cut, taunts } = await startFight();
  frame([hit, phaseThree]);
  await vi.advanceTimersByTimeAsync(300);
  // Leaving the old fight, then the new fight screen's first line.
  story.stopStory();
  expect(voice.speakLine("fight_start")).toBe(true);
  // The first telegraph comes 1500 ms into a fight.
  await vi.advanceTimersByTimeAsync(1500);
  frame([attack("block")]);
  // The old fight's taunt was still waiting for the phase line, so it was dropped and never heard.
  expect(started).toEqual(["phase_2@0", "fight_start@300", "call_block@1800"]);
  expect(cut).toEqual(["phase_2@300"]);
  expect(ended).toEqual(["fight_start@1580"]);
  expect(taunts).toEqual([false]);
});

// Measured in a fight where the player took every hit: the next attack is shown 650 to 690 ms after a hit lands, and its
// call cut Athena's warning there 20 times out of 20 ("Stay sha-", "Too sl-"). Now the warning is heard out and the call follows it.
test("a call that arrives while a warning is spoken waits for it: the warning ends on its own and the call is spoken then", async () => {
  const { frame, started, ended, cut, dipFor } = await startFight();
  // Three hits taken in a row, at the measured times: a hit every 2.9 s, and the next attack shown 650 ms after each.
  for (const [at, counter] of [[0, "block"], [2900, "dodge_left"], [5800, "dodge_right"]] as const) {
    await until(at);
    frame([struck("block")]);
    await until(at + 650);
    frame([attack(counter)]);
  }
  await until(9000);
  // Each warning ran its 1150 ms, and the call behind it started in the moment it ended, 500 ms after it was asked for.
  // The second hit landed while the held call was still being spoken, so it got no warning, and the call after it was on time.
  expect(started).toEqual(["warn_1@0", "call_block@1150", "call_dodge_left@3550", "warn_1@5800", "call_dodge_right@6950"]);
  expect(cut).toEqual([]);
  expect(ended).toEqual(["warn_1@1150", "call_block@3030", "call_dodge_left@4990", "warn_1@6950", "call_dodge_right@8440"]);
  expect([...dipFor]).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
});

test("only the newest call waits behind a warning, and a call that waited too long is not spoken", async () => {
  const { voice, frame, started, cut } = await startFight();
  frame([struck("block")]);
  await until(300);
  frame([attack("block")]);
  await until(700);
  // A second call before the warning is over replaces the first: one call follows the warning, not two.
  frame([attack("dodge_right")]);
  await until(3000);
  expect(started).toEqual(["warn_1@0", "call_dodge_right@1150"]);

  // The longest warning, and a call asked for 100 ms into it: by the time it ends the call is 1260 ms old.
  vi.spyOn(Math, "random").mockReturnValue(0.99);
  frame([struck("block")]);
  await until(3100);
  frame([attack("block")]);
  await until(6000);
  expect(voice.HELD_CALL_MS).toBeLessThan(1260);
  expect(started.slice(2)).toEqual(["warn_3@3000"]);
  expect(cut).toEqual([]);
  expect(voice.voicePlaying()).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});

test("a waiting call is dropped when its beat is over before the warning ends", async () => {
  const { voice, frame, started, cut } = await startFight();
  const recover = { kind: "recover", msLeft: 400 } as const;
  const drops: readonly (() => void)[] = [
    // The attack it called was defended, the strike it called landed or missed, or the monster is recovering.
    () => { frame([{ type: "defended", attack: polyphemus.attacks[0] }]); },
    () => { frame([hit]); },
    () => { frame([{ type: "whiffed" }]); },
    () => { voice.playVoice([], recover); },
  ];
  for (const [index, drop] of drops.entries()) {
    const at = index * 3000;
    await until(at);
    frame([struck("block")]);
    await until(at + 650);
    frame([attack("block")]);
    await until(at + 800);
    drop();
    await until(at + 2900);
    expect(voice.voicePlaying(), String(index)).toBeNull();
  }
  // Four warnings heard whole and no call after any of them. Praise for the strike that landed was refused: she was speaking.
  expect(started).toEqual(["warn_1@0", "warn_1@3000", "warn_1@6000", "warn_1@9000"]);
  expect(cut).toEqual([]);
});

test.each(["won", "lost"] as const)("a call waiting behind a warning is never spoken once the fight is %s", async (result) => {
  const line = result === "won" ? "win" : "loss";
  for (const missing of [[], [line]]) {
    vi.setSystemTime(0);
    const { frame, started, cut } = await startFight(missing);
    frame([struck("block")]);
    await until(650);
    frame([attack("block")]);
    await until(900);
    frame([{ type: result }]);
    await until(9000);
    // The result line takes the voice from the warning at once. With no clip for it the warning plays out, and still no call.
    expect(started).toEqual(missing.length === 0 ? ["warn_1@0", `${line}@900`] : ["warn_1@0"]);
    expect(cut).toEqual(missing.length === 0 ? ["warn_1@900"] : []);
    expect(vi.getTimerCount()).toBe(0);
  }
});

test("a phase line and the fight's first line do not wait for a warning, and the waiting call does not follow them", async () => {
  const { voice, frame, started, cut } = await startFight();
  frame([struck("block")]);
  await until(650);
  frame([attack("block")]);
  await until(700);
  frame([hit, phaseTwo]);
  await until(5000);
  // The phase line cut the warning as before; the monster's taunt followed it, and the call asked for at 650 ms did not.
  expect(started).toEqual(["warn_1@0", "phase_1@700", "taunt_polyphemus_1@2500"]);
  expect(cut).toEqual(["warn_1@700"]);

  await until(6000);
  frame([struck("block")]);
  await until(6650);
  frame([attack("block")]);
  await until(6700);
  expect(voice.speakLine("fight_start")).toBe(true);
  await until(9000);
  expect(started.slice(3)).toEqual(["warn_1@6000", "fight_start@6700"]);
  expect(cut.slice(1)).toEqual(["warn_1@6700"]);
});

test("pausing or leaving the fight during a warning drops the call waiting behind it", async () => {
  const { voice, frame, started, cut } = await startFight();
  for (const [at, stop] of [[0, () => { voice.pauseFightVoice(true); }], [3000, () => { voice.stopFightVoice(); }]] as const) {
    await until(at);
    voice.pauseFightVoice(false);
    frame([struck("block")]);
    await until(at + 650);
    frame([attack("block")]);
    await until(at + 700);
    stop();
    await until(at + 2900);
  }
  expect(started).toEqual(["warn_1@0", "warn_1@3000"]);
  expect(cut).toEqual(["warn_1@700", "warn_1@3700"]);
  expect(vi.getTimerCount()).toBe(0);
});

test("the finisher's call waits out a warning however long that takes, and is spoken once", async () => {
  const { voice, started, cut } = await startFight();
  const finisher = { kind: "finisher", move: "stake_thrust", msLeft: 6000, totalMs: 6000 } as const;
  vi.spyOn(Math, "random").mockReturnValue(0.99);
  voice.playVoice([struck("block")]);
  await until(100);
  voice.playVoice([{ type: "powerUnleashed", damage: 40 }], finisher);
  for (let ms = 100; ms < 5000; ms += 100) {
    await vi.advanceTimersByTimeAsync(100);
    voice.playVoice([], finisher);
  }
  // It waited 1260 ms, longer than an ordinary call may, because the finisher's window is six seconds.
  expect(started).toEqual(["warn_3@0", "call_stake_thrust@1360"]);
  expect(cut).toEqual([]);
});
