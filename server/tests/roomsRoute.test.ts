// The room relay over real HTTP: a host and a guest exchange messages through event streams, and every refusal.
import { once } from "node:events";
import { request } from "node:http";
import type { IncomingMessage, Server } from "node:http";
import { connect } from "node:net";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test, vi } from "vitest";
import { NO_AI } from "../ai/types";
import { createApp } from "../app";
import type { Config } from "../env";
import {
  MAX_ROOMS_PER_CLIENT, MAX_STREAMS_PER_CLIENT, MAX_STREAM_BACKLOG_BYTES, MINUTE_MS, ROOMS_KEPT_FOR_THIS_MACHINE, SMALL_BODY_BYTES, STREAMS_RETRY_S,
  WRONG_CODES_PER_MINUTE,
} from "../lib/roomLimits";
import { IDLE_MS, MAX_MESSAGE_BYTES, MAX_ROOMS, SENDS_PER_SECOND } from "../lib/rooms";
import { HEARTBEAT_MS } from "../routes/rooms";

const config: Config = {
  port: 0, geminiKey: null, elevenLabsKey: null, dataDir: "/nonexistent", publicBaseUrl: null, distDir: "/nonexistent",
  timeouts: { levelMs: 80, revealMs: 80, portraitMs: 80, speechMs: 80 },
};
type Call = (path: string, json?: unknown, signal?: AbortSignal) => Promise<Response>;
/** The next frame of an event stream: a parsed message, a comment line as text, or null once the stream is over. */
type Next = () => Promise<unknown>;

let server: Server | null = null;
let hangUp = new AbortController();
afterEach(() => {
  vi.useRealTimers();
  hangUp.abort();
  hangUp = new AbortController();
  // A stream a test left open would keep close() waiting, so every connection is cut as well.
  server?.close();
  server?.closeAllConnections();
  server = null;
});

/**
 * `unguarded` leaves out the tunnel guard, which refuses a proxied caller's create (localOnly.test.ts covers that), so a
 * test of the per-caller budgets can use the proxy header as the caller's address, as a device on the Wi-Fi would have its own.
 */
async function serve(unguarded = false): Promise<Call> {
  const app = await createApp({ config, ai: NO_AI, ...(unguarded ? { guard: (_request, _response, next) => { next(); } } : {}) });
  const listening = app.listen(0, "127.0.0.1");
  await once(listening, "listening");
  server = listening;
  const { port } = listening.address() as AddressInfo;
  return (path, json, signal = hangUp.signal) => fetch(`http://127.0.0.1:${String(port)}${path}`, json === undefined ? { signal } : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json), signal,
  });
}

async function listen(call: Call, code: string, token: string, signal?: AbortSignal): Promise<Next> {
  const response = await call(`/api/rooms/${code}/events?token=${token}`, undefined, signal);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  const body: ReadableStream<Uint8Array> | null = response.body;
  if (body === null) throw new Error("no stream");
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  return async () => {
    for (;;) {
      const cut = buffer.indexOf("\n\n");
      if (cut >= 0) {
        const frame = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        // A numbered message has an "id: N" line before its data line.
        const data = frame.split("\n").find((line) => line.startsWith("data: "));
        return data === undefined ? frame : JSON.parse(data.slice(6)) as unknown;
      }
      // A connection that is cut rejects the read; one the server ends cleanly reports done. Both mean the stream is over.
      const chunk = await reader.read().catch(() => null);
      if (chunk === null || chunk.done) return null;
      buffer += decoder.decode(chunk.value, { stream: true });
    }
  };
}

async function open(call: Call): Promise<{ code: string; host: string; guest: string }> {
  const made = await (await call("/api/rooms", {})).json() as { code: string; token: string };
  const joined = await (await call(`/api/rooms/${made.code.toLowerCase()}/join`, {})).json() as { token: string };
  return { code: made.code, host: made.token, guest: joined.token };
}

test("a host and a guest trade a strike and a state, and each learns when the other comes and goes", async () => {
  const call = await serve();
  const { code, host, guest } = await open(call);
  expect(code).toMatch(/^[A-HJKMNP-Z]{4}$/);
  const hostNext = await listen(call, code, host);
  expect(await hostNext()).toEqual({ type: "peer", joined: false });
  const guestLine = new AbortController();
  const guestNext = await listen(call, code.toLowerCase(), guest, guestLine.signal);
  expect(await guestNext()).toEqual({ type: "peer", joined: true });
  expect(await hostNext()).toEqual({ type: "peer", joined: true });

  const strike = { type: "strike", move: "jab", quality: 0.9 };
  const state = { type: "state", seq: 1, state: { hp: [90, 100], text: "line one\n\nline two" }, events: [] };
  const sent = await call(`/api/rooms/${code}/send`, { token: guest, message: strike });
  expect([sent.status, await sent.json()]).toEqual([200, { delivered: true }]);
  expect(await hostNext()).toEqual(strike);
  expect((await call(`/api/rooms/${code.toLowerCase()}/send`, { token: host, message: state })).status).toBe(200);
  expect(await guestNext()).toEqual(state);

  guestLine.abort();
  expect(await hostNext()).toEqual({ type: "peer", joined: false });
  // Nothing is queued for a member who is away.
  expect(await (await call(`/api/rooms/${code}/send`, { token: host, message: state })).json()).toEqual({ delivered: false });
});

test("unknown rooms, full rooms, wrong tokens, oversize and non-object messages are refused and reach nobody", async () => {
  const call = await serve();
  const { code, host, guest } = await open(call);
  const hostNext = await listen(call, code, host);
  const status = async (path: string, json?: unknown): Promise<number> => (await call(path, json)).status;
  const send = `/api/rooms/${code}/send`;

  expect(await status("/api/rooms/QQQQ/join", {})).toBe(404);
  expect(await status("/api/rooms/QQQQ/send", { token: guest, message: {} })).toBe(404);
  expect(await status(`/api/rooms/QQQQ/events?token=${guest}`)).toBe(404);
  expect(await status(`/api/rooms/${code}/join`, {})).toBe(409);
  expect(await status(send, { token: "wrong", message: { type: "strike" } })).toBe(401);
  for (const query of ["", "?token=wrong", `?token=${guest}&token=${guest}`]) expect(await status(`/api/rooms/${code}/events${query}`), query).toBe(401);
  for (const body of [{ message: {} }, { token: guest }, { token: guest, message: [1] }, { token: guest, message: "hi" }, { token: guest, message: null }, { token: 7, message: {} }, []]) {
    expect(await status(send, body), JSON.stringify(body)).toBe(400);
  }
  // {"pad":""} is ten bytes, so this message is exactly at the limit and one more byte is over it.
  const fits = { pad: "x".repeat(MAX_MESSAGE_BYTES - 10) };
  expect(await status(send, { token: guest, message: { pad: `${fits.pad}x` } })).toBe(413);
  expect(await status(send, { token: guest, message: fits })).toBe(200);
  // The one message that was allowed is the only thing the host hears after the opening line.
  expect(await hostNext()).toEqual({ type: "peer", joined: false });
  expect(await hostNext()).toEqual(fits);

  for (let index = 1; index < MAX_ROOMS; index += 1) expect(await status("/api/rooms", {})).toBe(200);
  expect(await status("/api/rooms", {})).toBe(503);
});

/** The heartbeat as a page reads it: a data line, so the page can tell its stream is alive. */
const BEAT = { type: "beat" };

test("an open stream gets a heartbeat, and an idle room expires: its streams end and its code stops working", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  const call = await serve();
  const { code, host, guest } = await open(call);
  const hostNext = await listen(call, code, host);
  const guestNext = await listen(call, code, guest);
  vi.advanceTimersByTime(HEARTBEAT_MS);
  expect([await hostNext(), await hostNext(), await hostNext()]).toEqual([{ type: "peer", joined: false }, { type: "peer", joined: true }, BEAT]);
  expect([await guestNext(), await guestNext()]).toEqual([{ type: "peer", joined: true }, BEAT]);

  vi.advanceTimersByTime(IDLE_MS);
  for (const next of [hostNext, guestNext]) {
    let frame = await next();
    while (JSON.stringify(frame) === JSON.stringify(BEAT)) frame = await next();
    expect(frame).toBeNull();
  }
  expect((await call(`/api/rooms/${code}/send`, { token: host, message: {} })).status).toBe(404);
});

test("closing the server ends an open event stream, so nothing is left hanging", async () => {
  const call = await serve();
  const { code, host } = await open(call);
  const next = await listen(call, code, host, new AbortController().signal);
  expect(await next()).toEqual({ type: "peer", joined: false });
  const closing = server;
  if (closing === null) throw new Error("no server");
  const closed = once(closing, "close");
  closing.close();
  closing.closeAllConnections();
  expect(await next()).toBeNull();
  await closed;
  expect(closing.listening).toBe(false);
});

function port(): number {
  return (server?.address() as AddressInfo).port;
}

/** A POST as the tunnel passes it on: from this machine, with the real caller in a header. */
function via(address: string, header = "Cf-Connecting-Ip"): (path: string, json?: unknown) => Promise<Response> {
  return (path, json = {}) => fetch(`http://127.0.0.1:${String(port())}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", [header]: address }, body: JSON.stringify(json), signal: hangUp.signal,
  });
}

/**
 * Creates a room as `ask` does, a minute later on the test's clock after each 429. The server sees a stream that
 * hung up a moment after the hang-up, and a minute gives the caller its six creates back.
 */
async function createSoon(ask: (path: string) => Promise<Response>): Promise<Response> {
  for (let tries = 0; ; tries += 1) {
    const answer = await ask("/api/rooms");
    if (answer.status !== 429 || tries === 20) return answer;
    await new Promise((resolve) => { setTimeout(resolve, 10); });
    vi.setSystemTime(Date.now() + MINUTE_MS);
  }
}

/** A POST written by hand, in pieces or with no body at all: the status, as soon as the server gives one. */
async function raw(path: string, headers: Record<string, number>, ...pieces: string[]): Promise<number> {
  const asked = request({ host: "127.0.0.1", port: port(), method: "POST", path, headers: { "Content-Type": "application/json", ...headers } });
  if (pieces.length === 0) asked.flushHeaders();
  for (const piece of pieces) asked.write(piece);
  if (pieces.length > 0) asked.end();
  const [answer] = (await once(asked, "response")) as [IncomingMessage];
  asked.destroy();
  return answer.statusCode ?? 0;
}

test("a body over the relay's own limit gets 413, the app's 6 MB parser never reads it, and broken JSON gets 400", async () => {
  const call = await serve();
  const { code, host } = await open(call);
  const pad = "x".repeat(SMALL_BODY_BYTES);
  // 7 MB is past the app's parser too, which would answer 500: 413 shows the relay's limit came first, in any case of the path.
  expect((await call(`/API/Rooms/${code}/SEND`, { token: host, message: { big: "x".repeat(7 * 1024 * 1024) } })).status).toBe(413);
  expect((await call("/api/rooms", { pad })).status).toBe(413);
  expect((await call(`/api/rooms/${code}/join`, { pad })).status).toBe(413);
  // Only the length is sent and not one byte of the body: the refusal does not wait for it.
  expect(await raw(`/api/rooms/${code}/send`, { "Content-Length": 5_000_000 })).toBe(413);
  // No length at all (chunked): cut off at the limit.
  expect(await raw(`/api/rooms/${code}/send`, {}, `{"token":"${host}","message":{"pad":"`, "x".repeat(40_000), '"}}')).toBe(413);
  expect(await raw(`/api/rooms/${code}/send`, {}, "{not ", "json")).toBe(400);
  expect((await call(`/api/rooms/${code}/send`, { token: host, message: {} })).status).toBe(200);

  // No other path that another device or a tunnel can reach has its body parsed: 7 MB or broken JSON is passed over
  // and the answer is the plain 404. A local-only path still parses, so the same broken JSON there is the parser's error.
  for (const path of ["/", "/nope", "/api/health", "/API/Health/", "/api/replays/x", "/api/rooms/address", "/replays/x"]) {
    expect((await call(path, { big: "x".repeat(7 * 1024 * 1024) })).status, path).toBe(404);
    expect(await raw(path, {}, "{not ", "json"), path).toBe(404);
  }
  expect(await raw("/api/level", {}, "{not ", "json")).toBe(500);
});

test("the tunnel's header is the rate key: each caller gets three rooms, twenty wrong codes and 120 sends a second, then 429 with Retry-After", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const call = await serve(true);
  const [one, two] = [via("203.0.113.9"), via("203.0.113.10")];
  const room = await (await one("/api/rooms")).json() as { code: string; token: string };
  const lines = [new AbortController(), new AbortController(), new AbortController()];
  await listen(call, room.code, room.token, lines[0]?.signal);
  for (let index = 1; index < MAX_ROOMS_PER_CLIENT; index += 1) {
    const more = await (await one("/api/rooms")).json() as { code: string; token: string };
    await listen(call, more.code, more.token, lines[index]?.signal);
  }
  // Somebody is connected to all three, so none is given up: the wait is until the first would expire.
  const refused = await one("/api/rooms");
  expect([refused.status, refused.headers.get("retry-after"), await refused.json()]).toEqual([429, String(IDLE_MS / 1000), { error: "too_many_requests" }]);
  // Another caller behind the same tunnel has its own budget, and so has this machine.
  expect([(await two("/api/rooms")).status, (await call("/api/rooms", {})).status]).toEqual([200, 200]);
  // One of the three hangs up: its room is the one that makes way.
  lines[1]?.abort();
  expect((await createSoon(one)).status).toBe(200);
  vi.setSystemTime(Date.now() + MINUTE_MS);

  const send = `/api/rooms/${room.code}/send`;
  for (let index = 0; index < WRONG_CODES_PER_MINUTE; index += 1) {
    expect((await one("/api/rooms/QQQQ/join")).status).toBe(404);
    expect((await one(send, { token: "wrong", message: {} })).status).toBe(401);
  }
  // Past the limit a right code is refused like a wrong one, so the answers no longer say which codes exist.
  const guess = await one(`/api/rooms/${room.code}/join`);
  expect([guess.status, guess.headers.get("retry-after")]).toEqual([429, "60"]);
  expect([(await one(send, { token: "wrong", message: {} })).status, (await one("/api/rooms/QQQQ/send", { token: "wrong", message: {} })).status]).toEqual([429, 429]);
  expect((await two(`/api/rooms/${room.code}/join`)).status).toBe(200);

  // A member with its token is not held up by any of that, until it sends too fast.
  for (let index = 0; index < SENDS_PER_SECOND; index += 1) expect((await one(send, { token: room.token, message: {} })).status).toBe(200);
  const fast = await one(send, { token: room.token, message: {} });
  expect([fast.status, fast.headers.get("retry-after")]).toEqual([429, "1"]);
  vi.advanceTimersByTime(1_000);
  expect((await one(send, { token: room.token, message: {} })).status).toBe(200);
});

test("a caller cannot pick its own key: one IPv6 /64 is one caller, and headers other than Cloudflare's share one budget", async () => {
  await serve();
  // Twenty wrong codes for the whole /64, whichever of its addresses asks.
  for (let index = 0; index < WRONG_CODES_PER_MINUTE; index += 1) expect((await via(`2001:db8:1:2::${String(index + 1)}`)("/api/rooms/QQQQ/join")).status).toBe(404);
  expect((await via("2001:db8:1:2:9999::1")("/api/rooms/QQQQ/join")).status).toBe(429);
  expect((await via("2001:db8:1:3::1")("/api/rooms/QQQQ/join")).status).toBe(404);
  // A header the caller can write is not believed, so a new value each time buys nothing.
  for (let index = 0; index < WRONG_CODES_PER_MINUTE; index += 1) {
    const header = index % 2 === 0 ? "X-Real-Ip" : "X-Forwarded-For";
    expect((await via(`198.51.100.${String(index)}`, header)("/api/rooms/QQQQ/join")).status).toBe(404);
  }
  expect([(await via("198.51.100.77", "X-Real-Ip")("/api/rooms/QQQQ/join")).status, (await via("198.51.100.78", "X-Forwarded-For")("/api/rooms/QQQQ/join")).status]).toEqual([429, 429]);
});

test("a host who opens a room and goes back, three times, can still host a fourth, and a refused create writes no log line", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const call = await serve(true);
  const lan = via("203.0.113.20");
  const warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const codes: string[] = [];
  for (let index = 0; index < MAX_ROOMS_PER_CLIENT; index += 1) {
    const made = await (await lan("/api/rooms")).json() as { code: string; token: string };
    const line = new AbortController();
    const next = await listen(call, made.code, made.token, line.signal);
    expect(await next()).toEqual({ type: "peer", joined: false });
    line.abort();
    codes.push(made.code);
  }
  const fourth = await createSoon(lan);
  expect(fourth.status).toBe(200);
  codes.push(((await fourth.json()) as { code: string }).code);
  // The room left longest ago made way, and the two after it are still there.
  expect(await Promise.all(codes.map(async (code) => (await call(`/api/rooms/${code}/join`, {})).status))).toEqual([404, 200, 200, 200]);
  // Past six creates a minute the caller is refused, and the laptop's terminal stays quiet.
  vi.setSystemTime(Date.now() + MINUTE_MS);
  const answers: number[] = [];
  for (let index = 0; index < 12; index += 1) answers.push((await lan("/api/rooms")).status);
  expect(answers).toEqual([200, 200, 200, 200, 200, 200, 429, 429, 429, 429, 429, 429]);
  expect(warned).not.toHaveBeenCalled();
});

test("callers from outside stop ten short of the 50 rooms, so the laptop that runs the server can always open its own", async () => {
  const call = await serve(true);
  let made = 0;
  for (let address = 1; made < MAX_ROOMS - ROOMS_KEPT_FOR_THIS_MACHINE; address += 1) {
    for (let index = 0; index < MAX_ROOMS_PER_CLIENT && made < MAX_ROOMS - ROOMS_KEPT_FOR_THIS_MACHINE; index += 1, made += 1) {
      expect((await via(`203.0.113.${String(address)}`)("/api/rooms")).status).toBe(200);
    }
  }
  const outside = await via("203.0.113.200")("/api/rooms");
  expect([outside.status, await outside.json()]).toEqual([503, { error: "too_many_rooms" }]);
  for (let index = 0; index < ROOMS_KEPT_FOR_THIS_MACHINE; index += 1) expect((await call("/api/rooms", {})).status).toBe(200);
  expect((await call("/api/rooms", {})).status).toBe(503);
});

test("a stream that is open but never read is cut off once a megabyte is waiting for it", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const call = await serve();
  const { code, host, guest } = await open(call);
  const hostNext = await listen(call, code, host);
  expect(await hostNext()).toEqual({ type: "peer", joined: false });
  // A socket nobody reads from: what the server writes fills the two socket buffers and then waits in the server.
  const deaf = connect(port(), "127.0.0.1");
  deaf.pause();
  deaf.write(`GET /api/rooms/${code}/events?token=${guest} HTTP/1.1\r\nHost: localhost\r\n\r\n`);
  expect(await hostNext()).toEqual({ type: "peer", joined: true });

  const message = { pad: "x".repeat(MAX_MESSAGE_BYTES - 10) };
  let sent = 0;
  for (let delivered = true; delivered && sent < 4_000; sent += 1) {
    // The clock moves so the host stays inside its 120 sends a second.
    if (sent % 100 === 0) vi.advanceTimersByTime(1_000);
    delivered = (await (await call(`/api/rooms/${code}/send`, { token: host, message })).json() as { delivered: boolean }).delivered;
  }
  // The guest's stream was closed by the server: the host is told, and far less was held than was sent after the buffers filled.
  expect(await hostNext()).toEqual({ type: "peer", joined: false });
  expect(sent * MAX_MESSAGE_BYTES).toBeGreaterThan(MAX_STREAM_BACKLOG_BYTES);
  expect(sent).toBeLessThan(4_000);
  deaf.destroy();
  // The place is free again: the guest opens a stream it does read.
  const again = await listen(call, code, guest);
  expect(await again()).toEqual({ type: "peer", joined: true });
});

test("a member's newer stream replaces the older, which is closed, and one client holds at most eight streams", async () => {
  const call = await serve();
  const { code, host, guest } = await open(call);
  const hostNext = await listen(call, code, host);
  const older = await listen(call, code, guest);
  const newer = await listen(call, code, guest);
  expect([await older(), await older()]).toEqual([{ type: "peer", joined: true }, null]);
  expect(await newer()).toEqual({ type: "peer", joined: true });
  await call(`/api/rooms/${code}/send`, { token: host, message: { type: "start" } });
  await call(`/api/rooms/${code}/send`, { token: guest, message: { type: "strike" } });
  expect(await newer()).toEqual({ type: "start" });
  // The host heard the guest arrive once and never leave.
  expect([await hostNext(), await hostNext(), await hostNext()]).toEqual([{ type: "peer", joined: false }, { type: "peer", joined: true }, { type: "strike" }]);

  for (let held = 2; held < MAX_STREAMS_PER_CLIENT; held += 2) {
    const more = await open(call);
    for (const token of [more.host, more.guest]) await listen(call, more.code, token);
  }
  const extra = await open(call);
  const ninth = await call(`/api/rooms/${extra.code}/events?token=${extra.host}`);
  expect([ninth.status, ninth.headers.get("retry-after")]).toEqual([429, String(STREAMS_RETRY_S)]);
  // At the cap a member can still reopen its own stream, as a browser does after a dropped connection: it replaces, it does not add.
  const reopened = await listen(call, code, guest);
  expect([await newer(), await reopened()]).toEqual([null, { type: "peer", joined: true }]);
  expect((await call(`/api/rooms/${extra.code}/events?token=${extra.host}`)).status).toBe(429);
});
