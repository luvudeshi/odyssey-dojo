// The page's side of the failure drill (issue #198, docs/failure-drill.md): whatever the server does, the player gets
// a god, a fight and a card to read, and no screen waits longer than its own limit. The server's side is
// server/tests/failureDrill.test.ts.
import { afterEach, expect, test, vi } from "vitest";
import { TIMEOUTS } from "../../server/env";
import { generateLevel, LEVEL_TIMEOUT_MS } from "../../src/ai/client";
import { LevelSpecSchema } from "../../src/ai/contracts";
import type { RevealResponse } from "../../src/ai/contracts";
import { fallbackLevel } from "../../src/ai/fallbacks";
import { GOD_IDS } from "../../src/ai/gods/gods";
import { fetchPortrait, PORTRAIT_TIMEOUT_MS, requestReveal } from "../../src/ai/reveal";
import { REVEAL_BUDGET_MS, revealGod } from "../../src/ai/revealGod";
import type { GodReveal } from "../../src/ai/revealGod";
import { prepareLine, SPEECH_WAIT_MS } from "../../src/audio/narration";

/** The server's stall in every drill: it answers, correctly, but only after this long. */
const STALL_MS = 15_000;
const input = { snapshot: "data:image/jpeg;base64,AAAA", frame: null, tint: null, seed: 42 };
const athena: RevealResponse = { god: "athena", epithet: "storm-hearted", reason: "You stand as calm as a held breath.", rival_god: "poseidon", portrait_id: "p1" };
const phrase = { phrase: "like a Texas thunderstorm", god: "athena", rival_god: "poseidon" } as const;
const drawPortrait = (god: string): string => `marble:${god}`;
const toUrl = (): string => "blob:painted";
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const page = (status = 200): Response => new Response("<html><body>502 Bad Gateway</body></html>", { status, headers: { "Content-Type": "text/html" } });
const answers = (make: () => Response): typeof fetch => () => Promise.resolve(make());
/** A server that takes STALL_MS and ignores the abort signal, which is worse than the real fetch. */
const stalls = (make: () => Response): typeof fetch => () => new Promise((resolve) => { setTimeout(() => { resolve(make()); }, STALL_MS); });
/** A server that never answers but lets go when the request is aborted, like the real fetch. */
const hangs: typeof fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => { reject(new DOMException("timed out", "TimeoutError")); });
  });
const scan = (fetcher: typeof fetch): Promise<GodReveal> =>
  revealGod(input, { request: (snapshot, options) => requestReveal(snapshot, { ...options, fetcher }), portrait: (id) => fetchPortrait(id, { fetcher }), drawPortrait, toUrl });

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

test("every server limit ends at least a second before the page stops waiting, and all but the portrait and the generated fight end in under five seconds", () => {
  const pairs = [
    { route: "level", server: TIMEOUTS.levelMs, page: LEVEL_TIMEOUT_MS },
    { route: "reveal", server: TIMEOUTS.revealMs, page: REVEAL_BUDGET_MS },
    { route: "speech", server: TIMEOUTS.speechMs, page: SPEECH_WAIT_MS },
    { route: "portrait", server: TIMEOUTS.portraitMs, page: PORTRAIT_TIMEOUT_MS },
  ];
  for (const { route, server, page: wait } of pairs) {
    expect(wait - server, route).toBeGreaterThanOrEqual(1000);
    // 200 ms is left for the answer to be written and to travel.
    if (route !== "portrait" && route !== "level") expect(server, route).toBeLessThanOrEqual(4800);
  }
  // No screen the player must sit through waits on the server for longer than this.
  expect(REVEAL_BUDGET_MS).toBeLessThanOrEqual(6500);
  // A generated fight is one the player asked for, and real ones take 3.3 to 5.2 s: it gets longer, and no more than this.
  expect(TIMEOUTS.levelMs).toBeLessThanOrEqual(8500);
  expect(LEVEL_TIMEOUT_MS).toBeLessThanOrEqual(9500);
  // The second scan attempt starts with time left to answer, and no earlier than a real scan can take (0.85 to 2.3 s measured).
  expect(TIMEOUTS.revealHedgeMs).toBeGreaterThanOrEqual(2300);
  expect(TIMEOUTS.revealMs - TIMEOUTS.revealHedgeMs).toBeGreaterThanOrEqual(2300);
});

test("god scan, server stalled for 15 s: the lot is cast when the page's six seconds are up, not a moment later", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.useFakeTimers();
  let shown: GodReveal | null = null;
  void scan(stalls(() => json(athena))).then((reveal) => { shown = reveal; });
  await vi.advanceTimersByTimeAsync(REVEAL_BUDGET_MS - 1);
  expect(shown).toBeNull();
  await vi.advanceTimersByTimeAsync(1);
  const reveal = shown as GodReveal | null;
  expect(reveal?.source).toBe("offline");
  expect(GOD_IDS).toContain(reveal?.god);
  expect(await reveal?.portrait).toBe(`marble:${String(reveal?.god)}`);
  // The server's answer does arrive in the end. It changes nothing.
  await vi.advanceTimersByTimeAsync(STALL_MS);
  expect(shown).toBe(reveal);
});

test("god scan, no key or a wrong answer: the lot is cast at once, with the portrait drawn in the browser", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const cases: (typeof fetch)[] = [
    answers(() => json({ error: "unavailable" }, 503)),
    answers(() => json({ error: "local_only" }, 403)),
    answers(() => page(502)),
    answers(() => page()),
    answers(() => json({ level: fallbackLevel(phrase), source: "ai" })),
    answers(() => json({ ...athena, god: "odin" })),
    answers(() => json(null)),
    answers(() => new Response('{"god":"athena","epithet":"cut off in the mid')),
    () => Promise.reject(new TypeError("fetch failed")),
  ];
  for (const fetcher of cases) {
    const started = Date.now();
    const reveal = await scan(fetcher);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(reveal.source).toBe("offline");
    expect(GOD_IDS).toContain(reveal.god);
    expect(reveal.epithet).not.toBe("");
    expect(reveal.reason).not.toBe("");
    expect(await reveal.portrait).toBe(`marble:${reveal.god}`);
  }
});

test("the god is on screen before the portrait: a portrait that stalls, fails or is not a picture never delays it, and the marble one takes its place", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.useFakeTimers();
  const reveals: typeof fetch = (url, init) => (url === "/api/reveal" ? Promise.resolve(json(athena)) : stalls(() => new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/png" } }))(url, init));
  // No timer has run: the god came back while the portrait was still on its way.
  const reveal = await scan(reveals);
  expect(reveal).toMatchObject({ god: "athena", source: "ai" });
  let portrait: string | null | undefined;
  void reveal.portrait.then((url) => { portrait = url; });
  await vi.advanceTimersByTimeAsync(PORTRAIT_TIMEOUT_MS - 1);
  expect(portrait).toBeUndefined();
  await vi.advanceTimersByTimeAsync(1);
  expect(portrait).toBe("marble:athena");

  vi.useRealTimers();
  const wrong: Response[] = [new Response(null, { status: 204 }), page(), page(500), json({ error: "x" }), new Response(new Uint8Array(0), { headers: { "Content-Type": "image/png" } })];
  for (const answer of wrong) {
    const other = await scan((url) => Promise.resolve(url === "/api/reveal" ? json(athena) : answer));
    expect(other.source).toBe("ai");
    expect(await other.portrait).toBe("marble:athena");
  }
});

test("generated fight, no key: the server's own bundled fight is shown and marked as one", async () => {
  const bundled = fallbackLevel(phrase);
  const made = await generateLevel(phrase, { fetcher: answers(() => json({ level: bundled, source: "fallback" })) });
  expect(made).toEqual({ level: bundled, source: "fallback" });
});

test("generated fight, server stalled or answering wrongly: a bundled fight that fits the phrase, inside the wait", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const bundled = fallbackLevel(phrase);
  expect(LevelSpecSchema.safeParse(bundled).success).toBe(true);
  const cases: (typeof fetch)[] = [
    hangs,
    answers(() => page(502)),
    answers(() => page()),
    answers(() => json(athena)),
    answers(() => json({ level: { ...bundled, attack_pool: [] }, source: "ai" })),
    answers(() => json({ level: bundled, source: "the model" })),
    answers(() => new Response('{"level":{"title":"cut off in the mid')),
    answers(() => json({ error: "unavailable" }, 503)),
  ];
  for (const fetcher of cases) {
    const started = Date.now();
    expect(await generateLevel(phrase, { fetcher, timeoutMs: 150 })).toEqual({ level: bundled, source: "fallback" });
    expect(Date.now() - started).toBeLessThan(2000);
  }
});

test("spoken line, no key, a stalled server or a wrong answer: no voice, no error, and the line is asked for again next time", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const cases: (typeof fetch)[] = [
    answers(() => json({ error: "unavailable" }, 503)),
    answers(() => page(502)),
    hangs,
    () => Promise.reject(new TypeError("fetch failed")),
  ];
  let asked = 0;
  for (const [index, fetcher] of cases.entries()) {
    const line = `Drill line ${String(index)}.`;
    const counted: typeof fetch = (url, init) => { asked += 1; return fetcher(url, init); };
    const started = Date.now();
    expect(await prepareLine("homer", line, counted, 150)).toBeNull();
    expect(Date.now() - started).toBeLessThan(2000);
    // Not remembered as a failure: the next call goes to the server again, and a good answer is used.
    const good: typeof fetch = () => { asked += 1; return Promise.resolve(new Response(new Uint8Array([0x49, 0x44, 0x33, 4]), { headers: { "Content-Type": "audio/mpeg" } })); };
    expect(await prepareLine("homer", line, good, 150)).toMatch(/^blob:/);
  }
  expect(asked).toBe(cases.length * 2);
});
