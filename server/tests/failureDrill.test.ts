// The failure drill (issue #198, docs/failure-drill.md): every route, with the key missing, with the upstream service
// stalled for 15 seconds, and with an upstream answer that is not what was asked for. Each test is one cell or one row
// of the table in that file. The stall test runs on the limits the real server uses, so it takes about five seconds.
// The page's side is tests/ai/failureDrill.test.ts, and the god scan's second attempt is server/tests/revealHedge.test.ts.
import { afterEach, expect, test, vi } from "vitest";
import { LevelResponseSchema, RevealResponseSchema } from "../../src/ai/contracts";
import { fallbackLevel } from "../../src/ai/fallbacks";
import { CreateReplayResponseSchema } from "../../src/replay/contracts";
import type { AiClients } from "../ai/types";
import { TIMEOUTS } from "../env";
import { isMp3 } from "../routes/speech";
import { captureLog, ELEVENLABS_KEY, GEMINI_KEY, serve, stalled, timed } from "./support/drill";
import type { Drill } from "./support/drill";

/** Room for a busy machine: an answer may arrive this long after the moment the route decided on it. */
const SLACK_MS = 700;
/** A route with nothing to wait for answers well inside this. */
const AT_ONCE_MS = 1000;
const QUICK = { levelMs: 300, revealMs: 300, revealHedgeMs: 100, portraitMs: 300, speechMs: 300 } as const;

const phrase = { phrase: "like a Texas thunderstorm", god: "athena", rival_god: "poseidon" } as const;
const bundled = fallbackLevel(phrase);
const snapshot = { image: `data:image/jpeg;base64,${Buffer.from("a made-up webcam snapshot").toString("base64")}` } as const;
const athena = { god: "athena", epithet: "storm-hearted, unyielding", reason: "You stand as calm as a held breath.", rival_god: "poseidon" } as const;
const line = { text: "Sing, Muse, of the man of many turns.", voice: "homer" } as const;
const voices = [{ id: "v1", name: "George - warm storyteller" }];
const MP3 = Buffer.concat([Buffer.from("ID3"), Buffer.from([4, 0, 0, 0, 0, 0, 0]), Buffer.from("made-up audio")]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const replay = { meta: { godName: "Athena", epithet: "storm-hearted", enemyName: "Polyphemus", fightTitle: "The Cave of the Cyclops", score: 1200, won: true }, card: null } as const;

let drill: Drill | null = null;
afterEach(() => { drill?.close(); drill = null; vi.restoreAllMocks(); });
/** The server the test is talking to. */
const up = (): Drill => {
  if (drill === null) throw new Error("no server is up");
  return drill;
};

/** The routes that need no AI service: each must answer, correctly, whatever state the AI routes are in. */
async function plainRoutesAnswer(server: Drill, health: Record<string, boolean>): Promise<void> {
  const up = await timed(() => server.call("/api/health"));
  expect(await up.result.json()).toEqual({ ok: true, ...health });
  expect(up.ms).toBeLessThan(AT_ONCE_MS);

  const made = await timed(() => server.call("/api/replays", replay));
  expect(made.result.status).toBe(200);
  const links = CreateReplayResponseSchema.parse(await made.result.json());
  expect(made.ms).toBeLessThan(AT_ONCE_MS);
  expect((await server.call(`/replays/${links.id}`)).status).toBe(200);
  expect((await server.call(links.qr_url)).status).toBe(200);

  const opened = await timed(() => server.call("/api/rooms", {}));
  expect(opened.result.status).toBe(200);
  const room = await opened.result.json() as { code: string; token: string };
  expect(room.code).toMatch(/^[A-Z]{4}$/);
  expect(opened.ms).toBeLessThan(AT_ONCE_MS);
  const joined = await timed(() => server.call(`/api/rooms/${room.code}/join`, {}));
  expect(joined.result.status).toBe(200);
  const guest = await joined.result.json() as { token: string };
  expect(joined.ms).toBeLessThan(AT_ONCE_MS);
  const sent = await timed(() => server.call(`/api/rooms/${room.code}/send`, { token: room.token, message: { type: "hello" } }));
  expect(sent.result.status).toBe(200);
  expect(sent.ms).toBeLessThan(AT_ONCE_MS);
  // The message is waiting for the guest, so the poll answers at once instead of holding on.
  const heard = await timed(() => server.call(`/api/rooms/${room.code}/poll?token=${guest.token}&after=0`));
  expect(heard.result.status).toBe(200);
  expect(JSON.stringify(await heard.result.json())).toContain("hello");
  expect(heard.ms).toBeLessThan(AT_ONCE_MS);

  const address = await timed(() => server.call("/api/rooms/address?port=5173"));
  expect(address.result.status).toBe(200);
  expect((await address.result.json() as { base: string }).base).toMatch(/^http/);
  expect(address.ms).toBeLessThan(AT_ONCE_MS);
}

test("key missing: every route answers at once, the AI routes with their fallback and the rest as if nothing were wrong", async () => {
  drill = await serve({}, { timeouts: TIMEOUTS });
  const level = await timed(() => up().call("/api/level", phrase));
  expect(await level.result.json()).toEqual({ level: bundled, source: "fallback" });
  expect(level.ms).toBeLessThan(AT_ONCE_MS);

  const reveal = await timed(() => up().call("/api/reveal", snapshot));
  expect(reveal.result.status).toBe(503);
  expect(await reveal.result.json()).toEqual({ error: "unavailable" });
  expect(reveal.ms).toBeLessThan(AT_ONCE_MS);

  const portrait = await timed(() => up().call("/api/portrait/never-painted"));
  expect(portrait.result.status).toBe(204);
  expect(portrait.ms).toBeLessThan(AT_ONCE_MS);

  const speech = await timed(() => up().call("/api/speech", line));
  expect(speech.result.status).toBe(503);
  expect(await speech.result.json()).toEqual({ error: "unavailable" });
  expect(speech.ms).toBeLessThan(AT_ONCE_MS);

  await plainRoutesAnswer(drill, { gemini: false, portraits: false, speech: false, sound: false });
});

test("key for the scan but not for speech, and the other way round: each service falls back by itself", async () => {
  drill = await serve({ json: () => Promise.resolve(athena) }, { timeouts: QUICK });
  // No portrait model either: the god still comes, with no portrait to wait for.
  expect(RevealResponseSchema.parse(await (await drill.call("/api/reveal", snapshot)).json())).toEqual({ ...athena, portrait_id: null });
  expect((await drill.call("/api/speech", line)).status).toBe(503);
  drill.close();

  drill = await serve({ voices: () => Promise.resolve(voices), speech: () => Promise.resolve(MP3) }, { timeouts: QUICK });
  expect((await drill.call("/api/speech", line)).status).toBe(200);
  expect((await drill.call("/api/reveal", snapshot)).status).toBe(503);
  expect(await (await drill.call("/api/level", phrase)).json()).toEqual({ level: bundled, source: "fallback" });
});

test("upstream stalled for 15 s, on the real limits: level, scan and speech each answer with their fallback in under five seconds, and the other routes answer meanwhile", async () => {
  // Every upstream call ignores its abort signal and answers correctly, but only after 15 s.
  let calls = 0;
  const ai: Partial<AiClients> = {
    json: (request) => { calls += 1; return stalled(request.image === undefined ? bundled : athena); },
    image: () => stalled(PNG),
    voices: () => stalled(voices),
    speech: () => stalled(MP3),
  };
  const server = await serve(ai, { timeouts: TIMEOUTS });
  drill = server;
  const waiting = Promise.all([
    timed(() => server.call("/api/level", phrase)),
    timed(() => server.call("/api/reveal", snapshot)),
    timed(() => server.call("/api/speech", line)),
  ]);
  // While all three are held up, the routes with no AI service in them carry on.
  await new Promise((resolve) => setTimeout(resolve, 300));
  await plainRoutesAnswer(server, { gemini: true, portraits: true, speech: true, sound: false });

  const [level, reveal, speech] = await waiting;
  expect(await level.result.json()).toEqual({ level: bundled, source: "fallback" });
  expect(level.ms).toBeGreaterThanOrEqual(TIMEOUTS.levelMs - 20);
  expect(level.ms).toBeLessThan(TIMEOUTS.levelMs + SLACK_MS);

  expect(reveal.result.status).toBe(503);
  expect(await reveal.result.json()).toEqual({ error: "unavailable" });
  expect(reveal.ms).toBeGreaterThanOrEqual(TIMEOUTS.revealMs - 20);
  expect(reveal.ms).toBeLessThan(TIMEOUTS.revealMs + SLACK_MS);

  expect(speech.result.status).toBe(503);
  expect(await speech.result.json()).toEqual({ error: "unavailable" });
  expect(speech.ms).toBeGreaterThanOrEqual(TIMEOUTS.speechMs - 20);
  expect(speech.ms).toBeLessThan(TIMEOUTS.speechMs + SLACK_MS);

  // One call for the level and two for the scan (the second attempt). Level generation is not tried twice.
  expect(calls).toBe(3);
  // Each limit leaves at least 200 ms for the answer to be written and to travel.
  for (const limit of [TIMEOUTS.levelMs, TIMEOUTS.revealMs, TIMEOUTS.speechMs]) expect(limit).toBeLessThanOrEqual(4800);
});

test("a stalled portrait: the god is answered at once, and the portrait request ends with no picture when the painting's time is up", async () => {
  drill = await serve({ json: () => Promise.resolve(athena), image: () => stalled(PNG) }, { timeouts: { ...QUICK, portraitMs: 500 } });
  const reveal = await timed(() => up().call("/api/reveal", snapshot));
  expect(reveal.ms).toBeLessThan(AT_ONCE_MS);
  const { portrait_id: id } = RevealResponseSchema.parse(await reveal.result.json());
  expect(id).not.toBeNull();
  const portrait = await timed(() => up().call(`/api/portrait/${String(id)}`));
  expect(portrait.result.status).toBe(204);
  expect(portrait.ms).toBeLessThan(500 + SLACK_MS);
});

test("a stalled voice service is not waited on again: once it answers, the next line is spoken", async () => {
  let stall = true;
  const ai: Partial<AiClients> = {
    voices: () => (stall ? stalled(voices) : Promise.resolve(voices)),
    speech: () => (stall ? stalled(MP3) : Promise.resolve(MP3)),
  };
  drill = await serve(ai, { timeouts: QUICK });
  const first = await timed(() => up().call("/api/speech", line));
  expect(first.result.status).toBe(503);
  expect(first.ms).toBeLessThan(QUICK.speechMs + SLACK_MS);
  stall = false;
  const second = await timed(() => up().call("/api/speech", line));
  expect(second.result.status).toBe(200);
  expect(second.ms).toBeLessThan(AT_ONCE_MS);
  // The voice list is kept from here on, and a speech call that stalls later does not throw it away.
  stall = true;
  expect((await drill.call("/api/speech", { ...line, text: "A second line." })).status).toBe(503);
  stall = false;
  expect((await drill.call("/api/speech", { ...line, text: "A second line." })).status).toBe(200);
});

test("upstream answers with the wrong thing: a level that is not a level gives the bundled fight, a god that is not a god gives unavailable", async () => {
  const wrong: unknown[] = [athena, "<html>502 Bad Gateway</html>", null, 42, [], { error: { code: 429, message: "quota" } }, { ...bundled, attack_pool: "many" }];
  for (const answer of wrong) {
    drill = await serve({ json: () => Promise.resolve(answer) }, { timeouts: QUICK });
    const level = await timed(() => up().call("/api/level", phrase));
    expect(await level.result.json(), JSON.stringify(answer)).toEqual({ level: bundled, source: "fallback" });
    expect(level.ms).toBeLessThan(AT_ONCE_MS);
    drill.close();
    drill = null;
  }
  for (const answer of [bundled, "<html>502 Bad Gateway</html>", null, 42, [], { error: { code: 429, message: "quota" } }, { ...athena, god: "odin" }]) {
    drill = await serve({ json: () => Promise.resolve(answer), image: () => Promise.resolve(PNG) }, { timeouts: QUICK });
    const reveal = await timed(() => up().call("/api/reveal", snapshot));
    expect(reveal.result.status, JSON.stringify(answer)).toBe(503);
    expect(await reveal.result.json()).toEqual({ error: "unavailable" });
    expect(reveal.ms).toBeLessThan(AT_ONCE_MS);
    drill.close();
    drill = null;
  }
});

test("a level the model got partly wrong is still an AI level, repaired into the safe ranges", async () => {
  drill = await serve({ json: () => Promise.resolve({ ...bundled, title: "From the model", tempo_bpm: 9999, taunts: [7, "", null] }) }, { timeouts: QUICK });
  const made = LevelResponseSchema.parse(await (await drill.call("/api/level", phrase)).json());
  expect(made.source).toBe("ai");
  expect(made.level.title).toBe("From the model");
  expect(made.level.tempo_bpm).toBeLessThanOrEqual(170);
  // The taunts that were not lines of text are replaced from the bundled fight.
  expect(made.level.taunts.length).toBeGreaterThanOrEqual(4);
  for (const taunt of made.level.taunts) expect(bundled.taunts).toContain(taunt);
});

test("speech that is not audio is refused and not kept: the same line is spoken once the service answers properly", async () => {
  expect(isMp3(MP3)).toBe(true);
  expect(isMp3(Buffer.from([0xff, 0xfb, 0x90, 0x64, 0]))).toBe(true);
  const wrong = [Buffer.from("<html>502 Bad Gateway</html>"), Buffer.from('{"detail":{"status":"quota_exceeded"}}'), Buffer.alloc(0), PNG];
  for (const bytes of wrong) expect(isMp3(bytes)).toBe(false);

  let answer: Buffer = MP3;
  let spoken = 0;
  drill = await serve({ voices: () => Promise.resolve(voices), speech: () => { spoken += 1; return Promise.resolve(answer); } }, { timeouts: QUICK });
  for (const [index, bytes] of wrong.entries()) {
    const text = `Wrong answer number ${String(index)}.`;
    answer = bytes;
    const refused = await timed(() => up().call("/api/speech", { ...line, text }));
    expect(refused.result.status).toBe(503);
    expect(refused.ms).toBeLessThan(AT_ONCE_MS);
    answer = MP3;
    const spokenNow = await drill.call("/api/speech", { ...line, text });
    expect(spokenNow.status).toBe(200);
    expect(spokenNow.headers.get("content-type")).toContain("audio/mpeg");
    expect(Buffer.from(await spokenNow.arrayBuffer()).equals(MP3)).toBe(true);
  }
  // Two calls a line: the wrong answer was not cached, and the right one was.
  expect(spoken).toBe(wrong.length * 2);
  expect((await drill.call("/api/speech", { ...line, text: "Wrong answer number 0." })).status).toBe(200);
  expect(spoken).toBe(wrong.length * 2);
});

test("a voice list that comes back empty or as something else is not kept: the next line asks again", async () => {
  let list: unknown = [];
  let listed = 0;
  const ai: Partial<AiClients> = {
    voices: () => { listed += 1; return Promise.resolve(list as { id: string; name: string }[]); },
    speech: () => Promise.resolve(MP3),
  };
  drill = await serve(ai, { timeouts: QUICK });
  expect((await drill.call("/api/speech", line)).status).toBe(503);
  list = { detail: "not a list" };
  expect((await drill.call("/api/speech", line)).status).toBe(503);
  list = voices;
  expect((await drill.call("/api/speech", line)).status).toBe(200);
  expect(listed).toBe(3);
  // A good list is kept.
  expect((await drill.call("/api/speech", { ...line, text: "Another line." })).status).toBe(200);
  expect(listed).toBe(3);
});

test("a portrait that is not a picture is no portrait, and the god is not held back for it", async () => {
  for (const bytes of [Buffer.from("<html>502 Bad Gateway</html>"), Buffer.from(JSON.stringify(athena)), Buffer.alloc(0), MP3]) {
    drill = await serve({ json: () => Promise.resolve(athena), image: () => Promise.resolve(bytes) }, { timeouts: QUICK });
    const { portrait_id: id } = RevealResponseSchema.parse(await (await drill.call("/api/reveal", snapshot)).json());
    const portrait = await timed(() => up().call(`/api/portrait/${String(id)}`));
    expect(portrait.result.status).toBe(204);
    expect(portrait.ms).toBeLessThan(AT_ONCE_MS);
    drill.close();
    drill = null;
  }
});

test("a request that is not what a route asks for is refused at once, never held and never a 500", async () => {
  drill = await serve({ json: () => stalled(athena), voices: () => stalled(voices), speech: () => stalled(MP3) }, { timeouts: TIMEOUTS });
  const cases: [string, unknown, number][] = [
    ["/api/level", { phrase: "", god: "athena", rival_god: "zeus" }, 400],
    ["/api/level", athena, 400],
    ["/api/reveal", { image: "data:image/png;base64,AAAA" }, 400],
    ["/api/reveal", phrase, 400],
    ["/api/speech", { text: "x", voice: "zeus" }, 400],
    ["/api/speech", snapshot, 400],
    ["/api/replays", { meta: { godName: "Athena" }, card: null }, 400],
    ["/api/replays", { ...replay, card: "data:image/png;base64,AAAA" }, 400],
    ["/api/rooms/ZZZZ/join", {}, 404],
    ["/api/rooms/ZZZZ/send", { token: "nope", message: { type: "hello" } }, 404],
    ["/api/rooms/ZZZZ/send", "not a message", 400],
  ];
  for (const [path, json, status] of cases) {
    const answer = await timed(() => up().call(path, json));
    expect(answer.result.status, `${path} ${JSON.stringify(json)}`).toBe(status);
    expect(answer.ms, path).toBeLessThan(AT_ONCE_MS);
  }
  for (const path of ["/api/rooms/ZZZZ/poll?token=nope", "/api/rooms/ZZZZ/events?token=nope", "/replays/nope", "/api/replays/nope/qr.svg", "/api/nope"]) {
    const answer = await timed(() => up().call(path));
    expect(answer.result.status, path).toBe(404);
    expect(answer.ms, path).toBeLessThan(AT_ONCE_MS);
  }
  // A port that is not a port is ignored, and the address still comes back.
  const address = await drill.call("/api/rooms/address?port=<script>");
  expect(address.status).toBe(200);
  expect((await address.json() as { base: string }).base).toMatch(/^http:\/\/[^<]+$/);
});

test("no answer and no log line carries a key, even when the upstream error spells both keys out", async () => {
  const log = captureLog();
  const said: string[] = [];
  const hear = async (response: Response | undefined): Promise<void> => {
    if (response === undefined) throw new Error("no answer");
    said.push(JSON.stringify([...response.headers]), await response.text());
  };
  const leak = (where: string): Error => new Error(
    `${where} 401: {"detail":"Invalid API key ${ELEVENLABS_KEY}"} for https://example.test/v1?key=${GEMINI_KEY}&again=${encodeURIComponent(GEMINI_KEY)} ${"x".repeat(400)} ${GEMINI_KEY}`,
  );
  const failing: Partial<AiClients> = {
    json: () => Promise.reject(leak("gemini")),
    image: () => Promise.reject(leak("gemini image")),
    voices: () => Promise.reject(leak("elevenlabs voices")),
    speech: () => Promise.reject(leak("elevenlabs speech")),
  };
  drill = await serve(failing, { timeouts: QUICK, keys: true });
  for (const [path, json] of [["/api/level", phrase], ["/api/reveal", snapshot], ["/api/speech", line], ["/api/replays", replay], ["/api/rooms", {}], ["/api/level", { key: GEMINI_KEY }]] as const) {
    await hear(await drill.call(path, json));
  }
  for (const path of ["/api/health", "/api/rooms/address", "/api/portrait/nope", "/api/nope"]) await hear(await drill.call(path));
  drill.close();

  // The scan works, so the portrait is started, and it is the portrait and the speech call that fail.
  drill = await serve({ ...failing, json: () => Promise.resolve(athena), voices: () => Promise.resolve(voices) }, { timeouts: QUICK, keys: true });
  const reveal = await drill.call("/api/reveal", snapshot);
  const text = await reveal.text();
  said.push(text);
  await hear(await drill.call(`/api/portrait/${String(RevealResponseSchema.parse(JSON.parse(text)).portrait_id)}`));
  await hear(await drill.call("/api/speech", line));

  const logged = log.lines.join("\n");
  // The failures were logged, with the rest of the error still readable.
  for (const event of ["level_failed", "reveal_attempt_failed", "reveal_failed", "portrait_failed", "speech_failed"]) expect(logged).toContain(event);
  expect(logged).toContain("Invalid API key [key]");
  expect(logged).toContain("?key=[key]");
  for (const secret of [GEMINI_KEY, ELEVENLABS_KEY, GEMINI_KEY.slice(0, 16), ELEVENLABS_KEY.slice(-16)]) {
    expect(logged).not.toContain(secret);
    for (const answer of said) expect(answer).not.toContain(secret);
  }
});
