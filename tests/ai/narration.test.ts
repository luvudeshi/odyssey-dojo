// Narration retries a line that failed to load, and tells a line that finished from one that was cut off.
import { afterEach, expect, test, vi } from "vitest";
import { prepareLine, speakLine, stopNarration } from "../../src/audio/narration";

class FakeAudio extends EventTarget {
  static last: FakeAudio | null = null;
  ended = false;
  constructor(readonly src: string) {
    super();
    FakeAudio.last = this;
  }
  play(): Promise<void> {
    return Promise.resolve();
  }
  pause(): void {
    this.dispatchEvent(new Event("pause"));
  }
  finish(): void {
    this.ended = true;
    this.dispatchEvent(new Event("pause"));
    this.dispatchEvent(new Event("ended"));
  }
}

const clip = (): Promise<Response> => Promise.resolve(new Response("mp3-bytes"));
const started = async (): Promise<FakeAudio> => {
  await vi.waitFor(() => { expect(FakeAudio.last).not.toBeNull(); });
  const audio = FakeAudio.last;
  if (audio === null) throw new Error("no clip started");
  FakeAudio.last = null;
  return audio;
};

afterEach(() => { vi.unstubAllGlobals(); FakeAudio.last = null; });

test("a line that failed to load is fetched again on the next call, and a loaded line is fetched once", async () => {
  let calls = 0;
  const down: typeof fetch = () => { calls += 1; return Promise.reject(new Error("server not up")); };
  const refused: typeof fetch = () => { calls += 1; return Promise.resolve(new Response("", { status: 503 })); };
  const up: typeof fetch = () => { calls += 1; return clip(); };
  expect(await prepareLine("homer", "Sing, Muse.", down)).toBeNull();
  expect(await prepareLine("homer", "Sing, Muse.", refused)).toBeNull();
  const url = await prepareLine("homer", "Sing, Muse.", up);
  expect(url).toMatch(/^blob:/);
  expect(await prepareLine("homer", "Sing, Muse.", up)).toBe(url);
  expect(calls).toBe(3);
});

test("speakLine resolves true when the line plays to its end and false when it is cut off", async () => {
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("fetch", clip);

  const whole = speakLine("homer", "Tell me of the man.");
  (await started()).finish();
  expect(await whole).toBe(true);

  const stopped = speakLine("monster", "Nobody leaves my cave.");
  await started();
  stopNarration();
  expect(await stopped).toBe(false);

  const replaced = speakLine("homer", "Dawn rose.");
  await started();
  const next = speakLine("monster", "I smell sheep.");
  expect(await replaced).toBe(false);
  (await started()).finish();
  expect(await next).toBe(true);
});
