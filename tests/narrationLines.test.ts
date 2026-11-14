// Guards Homer's narration and the monsters' taunts: the script, the clips on disk, the doc that mirrors them,
// and that speaking them never throws, never rejects and never overlaps another line.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import doc from "../docs/narration-lines.md?raw";
import { ATHENA_LINES } from "../src/audio/athenaLines";
import {
  ALL_STORY_LINES,
  isStoryLine,
  NARRATION_LINES,
  narrationId,
  pickTaunt,
  QUEST_ORDER,
  STORY_INDEX_URLS,
  storyClipUrl,
  TAUNT_LINES,
  tauntIds,
} from "../src/audio/narrationLines";
import { STORY_LINES } from "../src/audio/storyLines";
import { createStoryVoice, NARRATION_WAIT_MS, speakMonsterTaunt, speakNarration, speakResult, stopStory, TAUNT_WAIT_MS } from "../src/audio/storyVoice";
import type { StoryVoiceDeps } from "../src/audio/storyVoice";
import { audioPlayer, browserDeps, createVoice, speakTaunt, stopLine, voicePlaying } from "../src/audio/voice";
import type { ClipAudio } from "../src/audio/voice";
import { ENEMIES } from "../src/enemies/registry";

const NEW_LINES = [...NARRATION_LINES, ...TAUNT_LINES];
const FOLDERS = [
  { folder: "public/audio/narration", lines: NARRATION_LINES },
  { folder: "public/audio/taunts", lines: TAUNT_LINES },
] as const;
const MAX_BYTES = 4 * 1024 * 1024;
/** Longer than any wait or clip, so every promise has had time to settle. */
const MAX_WAIT_MS = 30_000;

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function readIndex(folder: string): unknown {
  return JSON.parse(readFileSync(`${folder}/index.json`, "utf8"));
}

/** An MP3 as ElevenLabs writes it starts with an ID3 tag; a bare one starts with a frame sync. */
function looksLikeMp3(path: string): boolean {
  const head = readFileSync(path).subarray(0, 3);
  return head.toString("latin1") === "ID3" || (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0);
}

// ---- the script ----

test("the stops are in the order the game plays them, Polyphemus first", () => {
  expect([...QUEST_ORDER]).toEqual(ENEMIES.map((enemy) => enemy.id));
  expect(QUEST_ORDER[0]).toBe("polyphemus");
});

test("ids are unique, never clash with Athena's, and say who speaks", () => {
  const ids = ALL_STORY_LINES.map((line) => line.id);
  expect(new Set(ids).size).toBe(ids.length);
  const athena = new Set(ATHENA_LINES.map((line) => line.id));
  for (const line of ALL_STORY_LINES) {
    expect(athena.has(line.id), line.id).toBe(false);
    expect(line.id.startsWith(line.speaker === "homer" ? "homer_" : "taunt_"), line.id).toBe(true);
    expect(line.text.trim(), line.id).toBe(line.text);
    expect(line.when, line.id).not.toBe("");
    expect(isStoryLine(line.id), line.id).toBe(true);
  }
  expect(isStoryLine("call_duck")).toBe(false);
  expect(isStoryLine("nobody")).toBe(false);
});

test("the lines recorded first keep their ids", () => {
  expect(STORY_LINES.map((line) => line.id)).toEqual([
    "homer_title", "homer_intro_polyphemus", "homer_win", "homer_loss",
    "taunt_polyphemus_1", "taunt_polyphemus_2", "taunt_polyphemus_3", "taunt_polyphemus_4",
  ]);
  for (const line of STORY_LINES) expect(storyClipUrl(line.id), line.id).toBe(`/audio/athena/${line.id}.mp3`);
});

test("every stop has one line before and one after, and Polyphemus's opening line is not recorded twice", () => {
  const reached = new Set<string>();
  for (const enemyId of QUEST_ORDER) {
    const before = narrationId(enemyId, "before");
    const after = narrationId(enemyId, "after");
    expect(before, enemyId).toBe(enemyId === "polyphemus" ? "homer_intro_polyphemus" : `homer_before_${enemyId}`);
    expect(after, enemyId).toBe(`homer_after_${enemyId}`);
    for (const id of [before, after]) {
      const line = ALL_STORY_LINES.find((each) => each.id === id);
      expect(line?.speaker, enemyId).toBe("homer");
      if (id !== null) reached.add(id);
    }
  }
  // No new line is left over: each one is some stop's before or after line.
  expect(NARRATION_LINES.map((line) => line.id).sort()).toEqual([...reached].filter((id) => id !== "homer_intro_polyphemus").sort());
  expect(NARRATION_LINES.some((line) => line.id === "homer_before_polyphemus")).toBe(false);
  for (const line of NARRATION_LINES) {
    expect(line.id, line.id).toMatch(new RegExp(`^homer_(before|after)_${line.enemyId}$`));
    expect(QUEST_ORDER as readonly string[], line.id).toContain(line.enemyId);
  }
});

test("a stop the quest does not have gets no narration", () => {
  expect(narrationId("nobody", "before")).toBeNull();
  expect(narrationId("nobody", "after")).toBeNull();
  expect(narrationId("", "before")).toBeNull();
  // "homer_win" is a line, but it is not any stop's after line.
  expect(narrationId("win", "after")).toBeNull();
});

test("Homer's new lines are short enough to hear out: 12 to 22 words", () => {
  for (const line of NARRATION_LINES) {
    expect(words(line.text), line.id).toBeGreaterThanOrEqual(12);
    expect(words(line.text), line.id).toBeLessThanOrEqual(22);
  }
});

test("every taunt is one of that monster's own taunts, word for word", () => {
  for (const line of ALL_STORY_LINES.filter((each) => each.speaker === "monster")) {
    const owner = ENEMIES.find((enemy) => tauntIds(enemy.id).includes(line.id));
    expect(owner, line.id).toBeDefined();
    expect(owner?.taunts, line.id).toContain(line.text);
  }
  for (const line of TAUNT_LINES) {
    expect(line.id, line.id).toMatch(new RegExp(`^taunt_${line.enemyId}_[1-9]$`));
    expect(tauntIds(line.enemyId), line.id).toContain(line.id);
  }
});

test("every monster has two or three spoken taunts, each different", () => {
  for (const enemy of ENEMIES) {
    const ids = tauntIds(enemy.id);
    // Polyphemus's four were recorded first. Scylla's file has one taunt, so she has one clip until it has more.
    const [least, most] = enemy.id === "polyphemus" ? [4, 4] : enemy.id === "scylla" ? [1, 3] : [2, 3];
    expect(ids.length, enemy.id).toBeGreaterThanOrEqual(least);
    expect(ids.length, enemy.id).toBeLessThanOrEqual(most);
    // Numbered from 1 with no gaps, so a picked id always has a line.
    expect(ids, enemy.id).toEqual(ids.map((_, index) => `taunt_${enemy.id}_${String(index + 1)}`));
    const texts = ids.map((id) => ALL_STORY_LINES.find((line) => line.id === id)?.text);
    expect(new Set(texts).size, enemy.id).toBe(ids.length);
  }
});

test("a taunt is picked for every monster, and none for a stranger or with a broken dice roll", () => {
  for (const enemy of ENEMIES) {
    const ids = tauntIds(enemy.id);
    expect(pickTaunt(enemy.id, () => 0), enemy.id).toBe(ids[0]);
    expect(pickTaunt(enemy.id, () => 0.999), enemy.id).toBe(ids.at(-1));
    // Out-of-range rolls still land on a real taunt.
    expect(ids, enemy.id).toContain(pickTaunt(enemy.id, () => 1));
    expect(ids, enemy.id).toContain(pickTaunt(enemy.id, () => -0.5));
  }
  expect(pickTaunt("nobody", () => 0.5)).toBeNull();
  expect(pickTaunt("circe", () => Number.NaN)).toBeNull();
});

// ---- the clips ----

test("every new line has a clip its folder's index lists, and every listed clip has a line", () => {
  for (const { folder, lines } of FOLDERS) {
    const ids = lines.map((line) => line.id).sort();
    expect(readIndex(folder), folder).toEqual(ids);
    const files = readdirSync(folder).filter((file) => file.endsWith(".mp3")).map((file) => file.slice(0, -4)).sort();
    expect(files, folder).toEqual(ids);
    for (const id of ids) {
      expect(storyClipUrl(id), id).toBe(`/${folder.replace("public/", "")}/${id}.mp3`);
      expect(looksLikeMp3(`${folder}/${id}.mp3`), id).toBe(true);
      // Even the shortest taunt is tens of kilobytes; a few bytes would be an error page saved as a clip.
      expect(statSync(`${folder}/${id}.mp3`).size, id).toBeGreaterThan(10_000);
    }
  }
  expect(STORY_INDEX_URLS).toEqual(["/audio/narration/index.json", "/audio/taunts/index.json"]);
});

test("the lines recorded first are still listed in Athena's index, with their clips", () => {
  const listed = readIndex("public/audio/athena");
  for (const line of STORY_LINES) {
    expect(listed, line.id).toContain(line.id);
    expect(existsSync(`public${storyClipUrl(line.id)}`), line.id).toBe(true);
  }
});

test("every line's clip is where the game will ask for it, and the new folders stay under 4 MB together", () => {
  for (const line of ALL_STORY_LINES) expect(existsSync(`public${storyClipUrl(line.id)}`), line.id).toBe(true);
  const bytes = NEW_LINES.reduce((sum, line) => sum + statSync(`public${storyClipUrl(line.id)}`).size, 0);
  expect(bytes).toBeLessThan(MAX_BYTES);
});

// ---- the doc ----

test("docs/narration-lines.md lists the same ids, speakers, moments and texts as the script", () => {
  const rows = doc
    .split("\n")
    .filter((line) => /^\| `(homer|taunt)_/.test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim().replaceAll("`", "")));
  const speaker = (id: string, who: string): string =>
    who === "homer" ? "Homer" : (ENEMIES.find((enemy) => tauntIds(enemy.id).includes(id))?.name ?? "?");
  const expected = [...NEW_LINES, ...STORY_LINES].map((line) => [line.id, speaker(line.id, line.speaker), line.when, line.text]);
  expect(rows).toEqual(expected);
});

// ---- speaking ----

/** A voice whose clips are recorded instead of played, with the story functions on top. `end` finishes the newest clip. */
function fakeStory(options: { available?: (id: string) => boolean; random?: () => number } = {}) {
  const started: string[] = [];
  const stopped: string[] = [];
  const ends: (() => void)[] = [];
  const voice = createVoice({
    available: options.available ?? (() => true),
    play: (id, done) => {
      started.push(id);
      ends.push(done);
      return () => {
        stopped.push(id);
      };
    },
    random: () => 0,
  });
  const story = createStoryVoice({
    speak: (id) => voice.speak(id),
    playing: () => voice.playing(),
    stop: (id) => {
      voice.stop(id);
    },
    random: options.random ?? (() => 0),
    sleep: (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
  });
  return { voice, story, started, stopped, end: () => ends.at(-1)?.() };
}

/** Records what a promise settles to without waiting for it. */
function watch(promise: Promise<boolean>): { settled: boolean | "pending" | "rejected" } {
  const seen: { settled: boolean | "pending" | "rejected" } = { settled: "pending" };
  promise.then(
    (value) => {
      seen.settled = value;
    },
    () => {
      seen.settled = "rejected";
    },
  );
  return seen;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("Homer's line starts at once when the voice is free, and its promise resolves when the clip ends", async () => {
  const { story, started, end } = fakeStory();
  const spoken = watch(story.speakNarration("circe", "before"));
  await vi.advanceTimersByTimeAsync(0);
  expect(started).toEqual(["homer_before_circe"]);
  await vi.advanceTimersByTimeAsync(5000);
  expect(spoken.settled).toBe("pending");
  end();
  await vi.advanceTimersByTimeAsync(100);
  expect(spoken.settled).toBe(true);
});

test("every stop's before and after line can be spoken", async () => {
  for (const enemyId of QUEST_ORDER) {
    for (const moment of ["before", "after"] as const) {
      const { story, started, end } = fakeStory();
      const spoken = watch(story.speakNarration(enemyId, moment));
      await vi.advanceTimersByTimeAsync(0);
      expect(started, `${enemyId} ${moment}`).toEqual([narrationId(enemyId, moment)]);
      end();
      await vi.advanceTimersByTimeAsync(100);
      expect(spoken.settled, `${enemyId} ${moment}`).toBe(true);
    }
  }
});

test("the result line waits for Athena's own result line, so the two are never heard together", async () => {
  const { voice, story, started, stopped, end } = fakeStory();
  expect(voice.speak("win")).toBe(true);
  const spoken = watch(story.speakResult("circe", true));
  await vi.advanceTimersByTimeAsync(2000);
  expect(started).toEqual(["win"]);
  end();
  await vi.advanceTimersByTimeAsync(100);
  expect(started).toEqual(["win", "homer_after_circe"]);
  // Athena's line ended by itself: Homer did not cut it off.
  expect(stopped).toEqual([]);
  end();
  await vi.advanceTimersByTimeAsync(100);
  expect(spoken.settled).toBe(true);
});

test("the result line is the stop's after line on a win, Homer's general one for a fight with none, and his loss line on a loss", async () => {
  const cases = [
    { enemyId: "scylla", won: true, id: "homer_after_scylla" },
    { enemyId: "a generated fight", won: true, id: "homer_win" },
    { enemyId: "scylla", won: false, id: "homer_loss" },
    { enemyId: "a generated fight", won: false, id: "homer_loss" },
  ];
  for (const { enemyId, won, id } of cases) {
    const { story, started } = fakeStory();
    void story.speakResult(enemyId, won);
    await vi.advanceTimersByTimeAsync(0);
    expect(started, `${enemyId} ${String(won)}`).toEqual([id]);
  }
});

test("a line that waits too long gives up and resolves false without ever starting", async () => {
  const { voice, story, started } = fakeStory();
  voice.speak("win");
  const spoken = watch(story.speakNarration("sirens", "after"));
  await vi.advanceTimersByTimeAsync(NARRATION_WAIT_MS - 100);
  expect(spoken.settled).toBe("pending");
  await vi.advanceTimersByTimeAsync(200);
  expect(spoken.settled).toBe(false);
  expect(started).toEqual(["win"]);
  expect(vi.getTimerCount()).toBe(0);
});

test("asking for the same line again while it waits or plays joins it, so it is heard once", async () => {
  const { voice, story, started, end } = fakeStory();
  voice.speak("win");
  const first = watch(story.speakResult("circe", true));
  await vi.advanceTimersByTimeAsync(300);
  const second = watch(story.speakResult("circe", true));
  end();
  await vi.advanceTimersByTimeAsync(100);
  const third = watch(story.speakResult("circe", true));
  await vi.advanceTimersByTimeAsync(3000);
  expect(started).toEqual(["win", "homer_after_circe"]);
  expect([first.settled, second.settled, third.settled]).toEqual(["pending", "pending", "pending"]);
  end();
  await vi.advanceTimersByTimeAsync(100);
  expect([first.settled, second.settled, third.settled]).toEqual([true, true, true]);
  // Once it is over, asking again speaks it again.
  void story.speakResult("circe", true);
  await vi.advanceTimersByTimeAsync(0);
  expect(started).toEqual(["win", "homer_after_circe", "homer_after_circe"]);
});

test("a line stopped and asked for again at once starts afresh, as when a screen mounts twice", async () => {
  const { voice, story, started, stopped } = fakeStory();
  const first = watch(story.speakNarration("circe", "before"));
  story.stopStory();
  const second = watch(story.speakNarration("circe", "before"));
  await vi.advanceTimersByTimeAsync(100);
  expect(started).toEqual(["homer_before_circe", "homer_before_circe"]);
  expect(stopped).toEqual(["homer_before_circe"]);
  expect(voice.playing()).toBe("homer_before_circe");
  expect(first.settled).not.toBe("rejected");
  expect(second.settled).toBe("pending");
});

test("a missing clip, an unknown stop and a monster with no taunts all resolve false quietly", async () => {
  const missing = fakeStory({ available: () => false });
  const noClip = watch(missing.story.speakNarration("circe", "before", 0));
  const { story, started } = fakeStory();
  const noStop = watch(story.speakNarration("nobody", "before"));
  const noTaunts = watch(story.speakMonsterTaunt("nobody"));
  await vi.advanceTimersByTimeAsync(0);
  expect([noClip.settled, noStop.settled, noTaunts.settled]).toEqual([false, false, false]);
  expect(missing.started).toEqual([]);
  expect(started).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
});

test("a wait that is not a number means do not wait", async () => {
  const { voice, story } = fakeStory();
  voice.speak("win");
  const spoken = watch(story.speakNarration("circe", "before", Number.NaN));
  const endless = watch(story.speakMonsterTaunt("circe", Number.POSITIVE_INFINITY));
  await vi.advanceTimersByTimeAsync(0);
  expect([spoken.settled, endless.settled]).toEqual([false, false]);
  expect(vi.getTimerCount()).toBe(0);
});

test("only the newest waiting line waits: an older one gives up", async () => {
  const { voice, story, started, end } = fakeStory();
  voice.speak("win");
  const older = watch(story.speakNarration("circe", "before"));
  const newer = watch(story.speakNarration("sirens", "before"));
  await vi.advanceTimersByTimeAsync(100);
  expect(older.settled).toBe(false);
  expect(newer.settled).toBe("pending");
  end();
  await vi.advanceTimersByTimeAsync(100);
  expect(started).toEqual(["win", "homer_before_sirens"]);
});

test("stopStory drops a waiting line, cuts off a story line, and leaves Athena's lines alone", async () => {
  const { voice, story, started, stopped, end } = fakeStory();
  voice.speak("call_duck");
  const waiting = watch(story.speakNarration("circe", "before"));
  story.stopStory();
  expect(stopped).toEqual([]);
  expect(voice.playing()).toBe("call_duck");
  await vi.advanceTimersByTimeAsync(100);
  expect(waiting.settled).toBe(false);
  end();

  const playing = watch(story.speakNarration("circe", "after"));
  await vi.advanceTimersByTimeAsync(0);
  expect(voice.playing()).toBe("homer_after_circe");
  story.stopStory();
  expect(stopped).toEqual(["homer_after_circe"]);
  expect(voice.playing()).toBeNull();
  await vi.advanceTimersByTimeAsync(100);
  expect(playing.settled).toBe(true);
  expect(started).toEqual(["call_duck", "homer_after_circe"]);
  // Stopping with nothing playing is harmless.
  expect(() => {
    story.stopStory();
  }).not.toThrow();
});

test("every monster can taunt, and the dice pick which taunt", async () => {
  for (const enemy of ENEMIES) {
    const ids = tauntIds(enemy.id);
    const first = fakeStory({ random: () => 0 });
    const last = fakeStory({ random: () => 0.999 });
    void first.story.speakMonsterTaunt(enemy.id);
    void last.story.speakMonsterTaunt(enemy.id);
    await vi.advanceTimersByTimeAsync(0);
    expect(first.started, enemy.id).toEqual([ids[0]]);
    expect(last.started, enemy.id).toEqual([ids.at(-1)]);
  }
});

test("a taunt follows Athena's phase line, and her next call cuts it short", async () => {
  const { voice, story, started, stopped, end } = fakeStory();
  voice.speak("phase_1");
  const taunt = watch(story.speakMonsterTaunt("sirens"));
  await vi.advanceTimersByTimeAsync(1000);
  expect(started).toEqual(["phase_1"]);
  end();
  await vi.advanceTimersByTimeAsync(100);
  expect(started).toEqual(["phase_1", "taunt_sirens_1"]);
  expect(voice.speak("call_duck")).toBe(true);
  expect(stopped).toEqual(["taunt_sirens_1"]);
  await vi.advanceTimersByTimeAsync(100);
  expect(taunt.settled).toBe(true);
});

test("a taunt does not wait long: after its wait it is dropped", async () => {
  const { voice, story, started } = fakeStory();
  voice.speak("call_duck");
  const taunt = watch(story.speakMonsterTaunt("circe"));
  await vi.advanceTimersByTimeAsync(TAUNT_WAIT_MS + 100);
  expect(taunt.settled).toBe(false);
  expect(started).toEqual(["call_duck"]);
});

test("a taunt never talks over Homer or Athena", async () => {
  for (const busyWith of ["homer_before_circe", "win", "call_block", "fight_start"]) {
    const { voice, story, started } = fakeStory();
    voice.speak(busyWith);
    const taunt = watch(story.speakMonsterTaunt("circe", 0));
    await vi.advanceTimersByTimeAsync(0);
    expect(taunt.settled, busyWith).toBe(false);
    expect(started, busyWith).toEqual([busyWith]);
  }
});

test("nothing a broken voice does can make a story function reject or throw", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const boom = (): never => {
    throw new Error("broken");
  };
  const fine: StoryVoiceDeps = { speak: () => true, playing: () => null, stop: () => undefined, random: () => 0, sleep: () => Promise.resolve() };
  const broken: StoryVoiceDeps[] = [
    { ...fine, speak: boom },
    { ...fine, playing: boom },
    { ...fine, random: boom },
    { ...fine, stop: boom, playing: () => "homer_win" },
    { ...fine, speak: () => false, sleep: () => Promise.reject(new Error("no timers")) },
  ];
  for (const deps of broken) {
    const story = createStoryVoice(deps);
    const results = [
      watch(story.speakNarration("circe", "before")),
      watch(story.speakResult("circe", true)),
      watch(story.speakResult("circe", false)),
      watch(story.speakMonsterTaunt("circe")),
    ];
    expect(() => {
      story.stopStory();
    }).not.toThrow();
    await vi.advanceTimersByTimeAsync(MAX_WAIT_MS);
    for (const result of results) expect(typeof result.settled).toBe("boolean");
  }
  expect(warn).toHaveBeenCalled();
});

test("a clip that never ends does not leave the promise pending for ever", async () => {
  const { story } = fakeStory();
  const spoken = watch(story.speakNarration("suitors", "after"));
  await vi.advanceTimersByTimeAsync(MAX_WAIT_MS);
  expect(spoken.settled).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

/** A stand-in audio element that records the urls opened and lets the test end or fail the clip. */
function fakeAudio(play: () => Promise<void>) {
  const listeners = new Map<string, () => void>();
  const urls: string[] = [];
  let pauses = 0;
  const open = (url: string): ClipAudio => {
    urls.push(url);
    return {
      play,
      pause: () => {
        pauses += 1;
      },
      addEventListener: (type, listener) => {
        listeners.set(type, listener);
      },
    };
  };
  return { open, urls, pauses: () => pauses, fire: (type: "ended" | "error") => listeners.get(type)?.() };
}

function audioStory(play: () => Promise<void>) {
  const audio = fakeAudio(play);
  const voice = createVoice({ available: () => true, play: audioPlayer(audio.open), random: () => 0 });
  const story = createStoryVoice({
    speak: (id) => voice.speak(id),
    playing: () => voice.playing(),
    stop: (id) => {
      voice.stop(id);
    },
    random: () => 0,
    sleep: (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
  });
  return { audio, voice, story };
}

test("clips are asked for in their own folders: narration, taunts, and Athena's for the lines recorded first", async () => {
  const { audio, story } = audioStory(() => Promise.resolve());
  const lines = [
    { speak: () => story.speakNarration("circe", "before"), url: "/audio/narration/homer_before_circe.mp3" },
    { speak: () => story.speakNarration("polyphemus", "before"), url: "/audio/athena/homer_intro_polyphemus.mp3" },
    { speak: () => story.speakNarration("polyphemus", "after"), url: "/audio/narration/homer_after_polyphemus.mp3" },
    { speak: () => story.speakMonsterTaunt("suitors"), url: "/audio/taunts/taunt_suitors_1.mp3" },
    { speak: () => story.speakMonsterTaunt("polyphemus"), url: "/audio/athena/taunt_polyphemus_1.mp3" },
    { speak: () => story.speakResult("nobody", false), url: "/audio/athena/homer_loss.mp3" },
  ];
  for (const { speak, url } of lines) {
    const spoken = watch(speak());
    await vi.advanceTimersByTimeAsync(0);
    expect(audio.urls.at(-1)).toBe(url);
    audio.fire("ended");
    await vi.advanceTimersByTimeAsync(100);
    expect(spoken.settled, url).toBe(true);
  }
  expect(audio.urls.length).toBe(lines.length);
});

test("blocked audio and a clip that fails to load both resolve quietly and free the voice", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const blocked = audioStory(() => Promise.reject(new Error("NotAllowedError")));
  const first = watch(blocked.story.speakNarration("circe", "before"));
  await vi.advanceTimersByTimeAsync(100);
  expect(typeof first.settled).toBe("boolean");
  expect(blocked.voice.playing()).toBeNull();
  expect(warn).toHaveBeenCalledOnce();

  const failing = audioStory(() => Promise.resolve());
  const second = watch(failing.story.speakMonsterTaunt("charybdis"));
  await vi.advanceTimersByTimeAsync(0);
  failing.audio.fire("error");
  await vi.advanceTimersByTimeAsync(100);
  expect(typeof second.settled).toBe("boolean");
  expect(failing.voice.playing()).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});

// ---- the shared voice ----

test("a voice says what it is playing, and stop cuts off only the line named", () => {
  const { voice, stopped, end } = fakeStory();
  expect(voice.playing()).toBeNull();
  voice.speak("homer_title");
  expect(voice.playing()).toBe("homer_title");
  voice.stop("homer_win");
  expect(voice.playing()).toBe("homer_title");
  expect(stopped).toEqual([]);
  voice.stop("homer_title");
  expect(voice.playing()).toBeNull();
  expect(stopped).toEqual(["homer_title"]);
  // The stopped clip reporting done later does not free a line that started after it.
  voice.speak("homer_win");
  expect(voice.playing()).toBe("homer_win");
  end();
  expect(voice.playing()).toBeNull();
});

test("the browser voice reads the story indexes too, plays their clips from their folders, and only warms Athena's", async () => {
  vi.useRealTimers();
  const urls: string[] = [];
  class FakeAudio implements ClipAudio {
    constructor(url: string) {
      urls.push(url);
    }
    play(): Promise<void> {
      return Promise.resolve();
    }
    pause(): undefined {
      return undefined;
    }
    addEventListener(): undefined {
      return undefined;
    }
  }
  const indexes: Record<string, unknown> = {
    "/audio/athena/index.json": ["call_duck"],
    "/audio/narration/index.json": ["homer_before_circe"],
    "/audio/taunts/index.json": ["taunt_circe_1"],
  };
  const fetched = vi.fn((url: string) => Promise.resolve({ ok: true, json: () => Promise.resolve(indexes[url] ?? []) }));
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("fetch", fetched);

  const voice = createVoice(browserDeps(STORY_INDEX_URLS));
  expect(voice.speak("homer_before_circe")).toBe(false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fetched.mock.calls.map(([url]) => url)).toEqual(["/audio/athena/index.json", ...STORY_INDEX_URLS]);
  expect(urls).toEqual(["/audio/athena/call_duck.mp3"]);
  expect(voice.speak("homer_before_circe")).toBe(true);
  voice.stop("homer_before_circe");
  expect(voice.speak("taunt_circe_1")).toBe(true);
  expect(voice.speak("taunt_circe_2")).toBe(false);
  expect(urls).toEqual(["/audio/athena/call_duck.mp3", "/audio/narration/homer_before_circe.mp3", "/audio/taunts/taunt_circe_1.mp3"]);
  voice.dispose();
});

test("a story index that cannot be loaded leaves Athena's clips working", async () => {
  vi.useRealTimers();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  class FakeAudio implements ClipAudio {
    play(): Promise<void> {
      return Promise.resolve();
    }
    pause(): undefined {
      return undefined;
    }
    addEventListener(): undefined {
      return undefined;
    }
  }
  const fetched = (url: string): Promise<unknown> =>
    url === "/audio/athena/index.json"
      ? Promise.resolve({ ok: true, json: () => Promise.resolve(["call_duck"]) })
      : Promise.reject(new Error("offline"));
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("fetch", fetched);

  const voice = createVoice(browserDeps(STORY_INDEX_URLS));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(voice.speak("homer_before_circe")).toBe(false);
  expect(voice.speak("call_duck")).toBe(true);
  expect(warn).toHaveBeenCalledTimes(STORY_INDEX_URLS.length);
  voice.dispose();
});

test("where there is no audio at all, the shared functions are silent, not broken", async () => {
  vi.useRealTimers();
  expect(await speakNarration("circe", "before", 0)).toBe(false);
  expect(await speakNarration("nobody", "after", 0)).toBe(false);
  expect(await speakResult("circe", true, 0)).toBe(false);
  expect(await speakResult("circe", false, 0)).toBe(false);
  expect(await speakMonsterTaunt("sirens", 0)).toBe(false);
  for (const enemy of ENEMIES) expect(speakTaunt(enemy.id), enemy.id).toBe(false);
  expect(speakTaunt("nobody")).toBe(false);
  expect(voicePlaying()).toBeNull();
  expect(() => {
    stopStory();
    stopLine("homer_title");
  }).not.toThrow();
});
