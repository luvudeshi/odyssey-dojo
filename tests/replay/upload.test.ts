// The browser side of replay sharing: what it sends, and that it never rejects or hangs whatever the server does.
import { expect, test } from "vitest";
import { CreateReplayRequestSchema, MAX_CARD_BYTES } from "../../src/replay/contracts";
import type { ReplayMeta } from "../../src/replay/contracts";
import { uploadReplay } from "../../src/replay/upload";

const meta: ReplayMeta = {
  godName: "Athena", epithet: "Grey-eyed tactician", enemyName: "Polyphemus", fightTitle: "The Cave of the Cyclops", score: 1234, won: true,
};
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const card = new Blob([PNG], { type: "image/png" });
const video = new Blob([new Uint8Array(64)], { type: "video/webm;codecs=vp9,opus" });
const created = { id: "abcdefghjk", page_url: "http://192.168.1.20:8787/replays/abcdefghjk", qr_url: "/api/replays/abcdefghjk/qr.svg" };
const links = { pageUrl: created.page_url, qrUrl: created.qr_url };

interface Seen {
  readonly url: string;
  readonly method: string;
  readonly type: string | null;
  readonly body: unknown;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** A fetcher that records each call and answers with whatever `answer` returns for it. */
function recorder(answer: (seen: Seen) => Response | Promise<Response>): { readonly calls: Seen[]; readonly fetcher: typeof fetch } {
  const calls: Seen[] = [];
  const fetcher: typeof fetch = (input, init) => {
    const seen: Seen = {
      url: typeof input === "string" ? input : "not a path",
      method: init?.method ?? "GET",
      type: new Headers(init?.headers).get("Content-Type"),
      body: init?.body,
    };
    calls.push(seen);
    return Promise.resolve(answer(seen));
  };
  return { calls, fetcher };
}

/** Never answers, and gives up only when the caller's timeout fires, like a real fetch to a dead server. */
function hung(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise((_, reject) => {
    signal?.addEventListener("abort", () => { reject(new Error("aborted")); });
  });
}

test("the meta and card are posted first, then the video, and the links come back", async () => {
  const { calls, fetcher } = recorder((seen) => (seen.method === "POST" ? json(created) : json({ ok: true })));
  expect(await uploadReplay({ meta, card, video }, { fetcher })).toEqual(links);
  expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual(["POST /api/replays", "PUT /api/replays/abcdefghjk/video"]);

  const [first, second] = calls;
  expect(first?.type).toBe("application/json");
  const sent = CreateReplayRequestSchema.parse(JSON.parse(String(first?.body)));
  expect(sent.meta).toEqual(meta);
  expect(sent.card).toBe(`data:image/png;base64,${btoa(String.fromCharCode(...PNG))}`);
  // The recorder's codec list is dropped: the server stores by container.
  expect(second?.type).toBe("video/webm");
  expect(second?.body).toBe(video);
});

test("with no card and no video there is one call, and an MP4 is sent as one", async () => {
  const none = recorder(() => json(created));
  expect(await uploadReplay({ meta, card: null, video: null }, { fetcher: none.fetcher })).toEqual(links);
  expect(none.calls).toHaveLength(1);
  expect(JSON.parse(String(none.calls[0]?.body))).toEqual({ meta, card: null });

  const mp4 = recorder(() => json(created));
  const clip = new Blob([new Uint8Array(8)], { type: "video/mp4;codecs=avc1" });
  expect(await uploadReplay({ meta, card: null, video: clip }, { fetcher: mp4.fetcher })).toEqual(links);
  expect(mp4.calls[1]?.type).toBe("video/mp4");
});

test("a card too big for the server and an empty video are left out rather than failing the share", async () => {
  const { calls, fetcher } = recorder(() => json(created));
  const huge = new Blob([new Uint8Array(MAX_CARD_BYTES + 1)], { type: "image/png" });
  expect(await uploadReplay({ meta, card: huge, video: new Blob([]) }, { fetcher })).toEqual(links);
  expect(calls).toHaveLength(1);
  expect(JSON.parse(String(calls[0]?.body))).toEqual({ meta, card: null });
});

test("a card that is not a PNG is left out, and the page and video still go up", async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0]);
  const cards = [
    new Blob([jpeg], { type: "image/jpeg" }),
    // What the blob says it is does not count, only its bytes.
    new Blob([jpeg], { type: "image/png" }),
    new Blob([PNG.subarray(0, 7)], { type: "image/png" }),
  ];
  for (const wrong of cards) {
    const { calls, fetcher } = recorder((seen) => (seen.method === "POST" ? json(created) : json({ ok: true })));
    expect(await uploadReplay({ meta, card: wrong, video }, { fetcher })).toEqual(links);
    expect(calls.map((call) => call.method)).toEqual(["POST", "PUT"]);
    expect(JSON.parse(String(calls[0]?.body))).toEqual({ meta, card: null });
  }
  // A PNG whose blob carries no type, or the wrong one, is still a PNG.
  for (const type of ["", "image/jpeg"]) {
    const { calls, fetcher } = recorder(() => json(created));
    expect(await uploadReplay({ meta, card: new Blob([PNG], { type }), video: null }, { fetcher })).toEqual(links);
    expect(CreateReplayRequestSchema.parse(JSON.parse(String(calls[0]?.body))).card).not.toBeNull();
  }
});

test("a large card survives the trip to base64", async () => {
  const bytes = Uint8Array.from({ length: 200_000 }, (_, index) => (index * 31) % 256);
  bytes.set(PNG.subarray(0, 8));
  const { calls, fetcher } = recorder(() => json(created));
  await uploadReplay({ meta, card: new Blob([bytes]), video: null }, { fetcher });
  const sent = CreateReplayRequestSchema.parse(JSON.parse(String(calls[0]?.body)));
  const decoded = Uint8Array.from(atob((sent.card ?? "").split(",")[1] ?? ""), (character) => character.charCodeAt(0));
  expect(decoded).toEqual(bytes);
});

test("a video that fails, is refused or hangs still returns the page", async () => {
  const answers: ((seen: Seen) => Response | Promise<Response>)[] = [
    () => Promise.reject(new TypeError("network down")),
    () => json({ error: "too_large" }, 413),
    () => { throw new Error("thrown, not rejected"); },
  ];
  for (const answer of answers) {
    const { calls, fetcher } = recorder((seen) => (seen.method === "POST" ? json(created) : answer(seen)));
    expect(await uploadReplay({ meta, card, video }, { fetcher })).toEqual(links);
    expect(calls).toHaveLength(2);
  }
  const slow: typeof fetch = (_input, init) => (init?.method === "POST" ? Promise.resolve(json(created)) : hung(init?.signal));
  const started = Date.now();
  expect(await uploadReplay({ meta, card, video }, { fetcher: slow, videoTimeoutMs: 30 })).toEqual(links);
  expect(Date.now() - started).toBeLessThan(2000);
});

test("null when the server is down, slow, refuses or answers with something else, and the video is not sent", async () => {
  const down: typeof fetch = () => Promise.reject(new TypeError("fetch failed"));
  const thrower: typeof fetch = () => { throw new Error("thrown, not rejected"); };
  const slow: typeof fetch = (_input, init) => hung(init?.signal);
  for (const fetcher of [down, thrower, slow]) {
    expect(await uploadReplay({ meta, card, video }, { fetcher, timeoutMs: 30 })).toBeNull();
  }
  const answers = [json({ error: "bad_request" }, 400), json({ error: "server_error" }, 500), json({ id: "abcdefghjk" }), json("nope"), new Response("<html>")];
  for (const answer of answers) {
    const { calls, fetcher } = recorder(() => answer);
    expect(await uploadReplay({ meta, card, video }, { fetcher })).toBeNull();
    expect(calls).toHaveLength(1);
  }
});
