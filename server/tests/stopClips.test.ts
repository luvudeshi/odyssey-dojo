// The list "genClips.ts stops" generates from must name exactly the clips the game's table plays.
import { expect, test } from "vitest";
import { STOP_SOUNDS, stopAmbience, stopClipKey, stopClips } from "../../src/audio/stopSounds";
import { STOP_AMBIENCE_FORMAT, STOP_CLIP_MAX_BYTES, STOP_CLIPS } from "../tools/stopClips";

/** Bytes a second for an MP3 format name like "mp3_44100_96". Clips without a format are made at 128 kbps. */
function bytesPerSecond(format: string): number {
  return (Number(format.split("_")[2]) * 1000) / 8;
}

test("there is one prompt for every clip in the table and none for anything else", () => {
  const played = Object.keys(STOP_SOUNDS).flatMap((enemyId) => stopClips(enemyId).map((clip) => stopClipKey(enemyId, clip)));
  expect(Object.keys(STOP_CLIPS).sort()).toEqual(played.sort());
});

test("only the ambience clips loop, and every clip is asked for at a length the API takes and a size under 400 KB", () => {
  for (const [key, { prompt, seconds, loop }] of Object.entries(STOP_CLIPS)) {
    const [enemyId = "", clip = ""] = key.split("/");
    expect(loop === true, key).toBe(clip === stopAmbience(enemyId));
    expect(prompt.length, key).toBeGreaterThan(20);
    // The sound effects endpoint takes 0.5 to 30 seconds.
    expect(seconds, key).toBeGreaterThanOrEqual(0.5);
    expect(seconds, key).toBeLessThanOrEqual(30);
    const rate = bytesPerSecond(loop ? STOP_AMBIENCE_FORMAT : "mp3_44100_128");
    expect(rate, key).toBeGreaterThan(0);
    expect(seconds * rate * 1.02, key).toBeLessThan(STOP_CLIP_MAX_BYTES);
  }
});

test("no two clips share a prompt", () => {
  const prompts = Object.values(STOP_CLIPS).map(({ prompt }) => prompt);
  expect(new Set(prompts).size).toBe(prompts.length);
});
