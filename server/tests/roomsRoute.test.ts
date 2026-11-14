// The room relay over real HTTP: a host and a guest exchange messages through event streams, and every refusal.
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test, vi } from "vitest";
import { NO_AI } from "../ai/types";
import { createApp } from "../app";
import type { Config } from "../env";
import { IDLE_MS, MAX_MESSAGE_BYTES, MAX_ROOMS } from "../lib/rooms";
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

async function serve(): Promise<Call> {
  const app = await createApp({ config, ai: NO_AI });
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
        return frame.startsWith("data: ") ? JSON.parse(frame.slice(6)) as unknown : frame;
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

test("an open stream gets a heartbeat, and an idle room expires: its streams end and its code stops working", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  const call = await serve();
  const { code, host, guest } = await open(call);
  const hostNext = await listen(call, code, host);
  const guestNext = await listen(call, code, guest);
  vi.advanceTimersByTime(HEARTBEAT_MS);
  expect([await hostNext(), await hostNext(), await hostNext()]).toEqual([{ type: "peer", joined: false }, { type: "peer", joined: true }, ": keep"]);
  expect([await guestNext(), await guestNext()]).toEqual([{ type: "peer", joined: true }, ": keep"]);

  vi.advanceTimersByTime(IDLE_MS);
  for (const next of [hostNext, guestNext]) {
    let frame = await next();
    while (frame === ": keep") frame = await next();
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
