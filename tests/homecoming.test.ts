// Guards Homer's closing line: it is in the script and on disk, it is not any stop's line, and it is spoken the way
// the result line is: after Athena, once, and cut off when the screen is left.
import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { HOMECOMING_ID, isStoryLine, NARRATION_LINES, narrationId, QUEST_ORDER, storyClipUrl } from "../src/audio/narrationLines";
import { createStoryVoice, NARRATION_WAIT_MS } from "../src/audio/storyVoice";
import { createVoice } from "../src/audio/voice";

/** The story functions over a voice whose clips are recorded instead of played. `end` finishes the newest clip. */
function fakeStory() {
  const started: string[] = [];
  const stopped: string[] = [];
  const ends: (() => void)[] = [];
  const fake = (): ReturnType<typeof createVoice> =>
    createVoice({
      available: () => true,
      play: (id, done) => {
        started.push(id);
        ends.push(done);
        return () => {
          stopped.push(id);
        };
      },
      random: () => 0,
    });
  const voice = fake();
  const story = createStoryVoice({
    speak: (id) => voice.speak(id),
    playing: () => voice.playing(),
    stop: (id) => {
      voice.stop(id);
    },
    taunts: fake(),
    random: () => 0,
    sleep: (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
  });
  return { voice, story, started, stopped, end: () => ends.at(-1)?.() };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

test("the homecoming is one of Homer's lines, belongs to the last stop and names the way home", () => {
  const line = NARRATION_LINES.find((each) => each.id === HOMECOMING_ID);
  expect(line?.speaker).toBe("homer");
  expect(line?.enemyId).toBe(QUEST_ORDER.at(-1));
  expect(isStoryLine(HOMECOMING_ID)).toBe(true);
  // The fight ends on the spear (the suitors' finisher), so the line must not leave the last blow to the bow.
  for (const word of ["bow", "spear", "suitors", "twenty years", "Ithaca", "Penelope"]) expect(line?.text, word).toContain(word);
  // Two sentences, like the brief asked for.
  expect(line?.text.split(". ").length).toBe(2);
});

test("it takes no stop's place: the suitors keep their own before and after lines", () => {
  expect(narrationId("suitors", "before")).toBe("homer_before_suitors");
  expect(narrationId("suitors", "after")).toBe("homer_after_suitors");
  for (const enemyId of QUEST_ORDER) {
    expect(narrationId(enemyId, "before"), enemyId).not.toBe(HOMECOMING_ID);
    expect(narrationId(enemyId, "after"), enemyId).not.toBe(HOMECOMING_ID);
  }
});

test("its clip is in the narration folder and that folder's index lists it", () => {
  expect(storyClipUrl(HOMECOMING_ID)).toBe("/audio/narration/homer_homecoming.mp3");
  expect(existsSync("public/audio/narration/homer_homecoming.mp3")).toBe(true);
  expect(JSON.parse(readFileSync("public/audio/narration/index.json", "utf8"))).toContain(HOMECOMING_ID);
});

test("speakHomecoming waits for Athena's result line, then speaks the closing line and nothing else", async () => {
  const { voice, story, started, stopped, end } = fakeStory();
  expect(voice.speak("win")).toBe(true);
  let settled: boolean | "pending" = "pending";
  void story.speakHomecoming().then((value) => {
    settled = value;
  });
  await vi.advanceTimersByTimeAsync(2000);
  expect(started).toEqual(["win"]);
  end();
  await vi.advanceTimersByTimeAsync(100);
  expect(started).toEqual(["win", HOMECOMING_ID]);
  // Athena's line ended by itself: Homer did not cut it off.
  expect(stopped).toEqual([]);
  expect(settled).toBe("pending");
  end();
  await vi.advanceTimersByTimeAsync(100);
  expect(settled).toBe(true);
  expect(started).toEqual(["win", HOMECOMING_ID]);
  expect(vi.getTimerCount()).toBe(0);
});

test("asked for twice by one screen it is heard once, and leaving the screen cuts it off", async () => {
  const { voice, story, started, stopped } = fakeStory();
  const first = story.speakHomecoming();
  const second = story.speakHomecoming();
  expect(second).toBe(first);
  await vi.advanceTimersByTimeAsync(1000);
  expect(started).toEqual([HOMECOMING_ID]);
  expect(voice.playing()).toBe(HOMECOMING_ID);
  story.stopStory();
  expect(stopped).toEqual([HOMECOMING_ID]);
  expect(voice.playing()).toBeNull();
  await vi.advanceTimersByTimeAsync(100);
  expect(await first).toBe(true);
  // It is not spoken again by itself once it was cut off.
  await vi.advanceTimersByTimeAsync(10_000);
  expect(started).toEqual([HOMECOMING_ID]);
});

test("it gives up without a sound when the voice stays busy, and never rejects", async () => {
  const { voice, story, started } = fakeStory();
  voice.speak("win");
  let settled: boolean | "pending" = "pending";
  void story.speakHomecoming().then((value) => {
    settled = value;
  });
  await vi.advanceTimersByTimeAsync(NARRATION_WAIT_MS + 200);
  expect(settled).toBe(false);
  expect(started).toEqual(["win"]);
});

test("the next screen's line cuts the homecoming off, so a new quest does not start under it", async () => {
  const { voice, story, started, stopped } = fakeStory();
  void story.speakHomecoming();
  await vi.advanceTimersByTimeAsync(500);
  void story.speakNarration("polyphemus", "before");
  expect(started).toEqual([HOMECOMING_ID, "homer_intro_polyphemus"]);
  expect(stopped).toEqual([HOMECOMING_ID]);
  expect(voice.playing()).toBe("homer_intro_polyphemus");
});
