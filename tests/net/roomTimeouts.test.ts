// Issue #226: a relay that takes a request and never answers must not leave the room screen waiting for ever.
// The fetch here is made up: it never answers, and gives up only when the signal it was handed says so, as the
// browser's does. The clock is fake, and AbortSignal.timeout is put on that clock so the test can run it forward.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { POST_TIMEOUT_MS, createRoom, joinRoom, openRoom } from "../../src/net/transport";
import type { NetDeps } from "../../src/net/transport";

/** The limits asked for through AbortSignal.timeout, in order. */
let limits: number[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  limits = [];
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
    limits.push(ms);
    const stop = new AbortController();
    setTimeout(() => {
      stop.abort(new DOMException("The operation timed out.", "TimeoutError"));
    }, ms);
    return stop.signal;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** A relay that accepts every request and never answers it. `asked` counts the requests. */
function silentRelay(): { deps: NetDeps; asked: () => number } {
  let asked = 0;
  const deps: NetDeps = {
    fetch: (_url, init) =>
      new Promise((_resolve, reject) => {
        asked += 1;
        init.signal?.addEventListener("abort", () => {
          reject(init.signal?.reason instanceof Error ? init.signal.reason : new Error("aborted"));
        });
      }),
    openStream: () => ({ onmessage: null, close: () => undefined }),
  };
  return { deps, asked: () => asked };
}

/** What the promise has settled to so far, or "waiting". */
function watch<T>(promise: Promise<T>): () => T | "waiting" {
  let settled: T | "waiting" = "waiting";
  void promise.then((value) => {
    settled = value;
  });
  return () => settled;
}

test("the limit is 8 seconds", () => {
  expect(POST_TIMEOUT_MS).toBe(8000);
});

test("createRoom answers unreachable within 8 seconds when the relay never answers", async () => {
  const relay = silentRelay();
  const answer = watch(createRoom(relay.deps));
  await vi.advanceTimersByTimeAsync(POST_TIMEOUT_MS - 1);
  expect(relay.asked()).toBe(1);
  expect(answer()).toBe("waiting");
  await vi.advanceTimersByTimeAsync(1);
  expect(answer()).toBe("unreachable");
  expect(limits).toEqual([8000]);
});

test("joinRoom answers unreachable within 8 seconds when the relay never answers", async () => {
  const relay = silentRelay();
  const answer = watch(joinRoom(relay.deps, "abcd"));
  await vi.advanceTimersByTimeAsync(POST_TIMEOUT_MS - 1);
  expect(relay.asked()).toBe(1);
  expect(answer()).toBe("waiting");
  await vi.advanceTimersByTimeAsync(1);
  expect(answer()).toBe("unreachable");
  expect(limits).toEqual([8000]);
});

test("a message sent into a silent relay resolves false after 8 seconds and does not reject", async () => {
  const relay = silentRelay();
  const room = openRoom(relay.deps, { code: "ABCD", token: "t" });
  const answer = watch(room.send({ type: "ask" }));
  await vi.advanceTimersByTimeAsync(POST_TIMEOUT_MS);
  expect(answer()).toBe(false);
  room.close();
});

test("a relay that answers in time is not cut off", async () => {
  const deps: NetDeps = {
    fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ code: "ABCD", token: "t" }) }),
    openStream: () => ({ onmessage: null, close: () => undefined }),
  };
  expect(await createRoom(deps)).toEqual({ code: "ABCD", token: "t" });
  expect(limits).toEqual([8000]);
});
