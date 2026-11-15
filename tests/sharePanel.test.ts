// The share panel's logic: the words on the card, what the player is told before uploading, and the share state machine.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { GODS } from "../src/ai/gods/gods";
import { MAX_CARD_BYTES, MAX_VIDEO_BYTES, ReplayMetaSchema } from "../src/replay/contracts";
import { IDLE, PORTRAIT_WAIT_MS, PREPARING, canShare, cardFileName, cardFinished, cardWords, heldUntilReady, oneShareAtATime, portraitWithin, replayMeta, runShare, shareStep, statusLine } from "../src/replay/ui/shareFlow";
import type { ShareEvent, ShareFight, ShareState } from "../src/replay/ui/shareFlow";
import { SharePanel } from "../src/replay/ui/SharePanel";
import type { ReplayLinks, uploadReplay } from "../src/replay/upload";

const fight: ShareFight = {
  god: { god: "athena", epithet: "grey-eyed" },
  won: true,
  enemyName: "Polyphemus",
  fightTitle: "The Cyclops of the Cave",
  score: 1234,
  style: "Boxer",
};
const links: ReplayLinks = { pageUrl: "http://192.168.1.20:8787/replays/abcdefghjk", qrUrl: "/api/replays/abcdefghjk/qr.svg" };
const created = { id: "abcdefghjk", page_url: links.pageUrl, qr_url: links.qrUrl };
const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])], { type: "image/png" });
const video = new Blob([new Uint8Array(2_500_000)], { type: "video/webm" });
const job = { meta: replayMeta(cardWords(fight)), card: png, video };
const uploading: ShareState = { kind: "uploading", stage: "card" };
const sendingVideo: ShareState = { kind: "uploading", stage: "video" };
const shared: ShareState = { kind: "shared", links, videoFailed: false };

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Runs a share and returns every state the panel would have shown, in order. */
async function states(run: (send: (event: ShareEvent) => void) => Promise<void>): Promise<ShareState[]> {
  let state = IDLE;
  const seen: ShareState[] = [];
  await run((event) => {
    state = shareStep(state, event);
    seen.push(state);
  });
  return seen;
}

test("the card carries the god from the scan, the fight and the style", () => {
  const words = cardWords(fight);
  expect(words).toMatchObject({ godName: "Athena", epithet: "grey-eyed", domain: GODS.athena.domain, accent: GODS.athena.accent });
  expect(words).toMatchObject({ enemyName: "Polyphemus", fightTitle: "The Cyclops of the Cave", score: 1234, won: true });
  expect(words.footer).toBe("Fighting style: Boxer · Odyssey Fighter, HackUTA 2026");
  expect(cardWords(fight, true).footer).toBe("Fighting style: Boxer · Scan to watch the fight");
  expect(cardFileName(words.godName)).toBe("odyssey-fighter-athena.png");
});

test("with no god the card is of Odysseus, and a broken score or name still makes a card the server accepts", () => {
  const words = cardWords({ ...fight, god: null, won: false, score: Number.NaN, style: " ", enemyName: "x".repeat(200) });
  expect(words).toMatchObject({ godName: "Odysseus", epithet: "sacker of cities", domain: "King of Ithaca", score: 0, won: false });
  expect(words.footer).toBe("Odyssey Fighter, HackUTA 2026");
  const meta = replayMeta({ ...words, score: 5e12 });
  expect(ReplayMetaSchema.safeParse(meta).success).toBe(true);
  expect(meta).toMatchObject({ enemyName: "x".repeat(60), score: 1e9 });
  expect(cardFileName("  ")).toBe("odyssey-fighter-card.png");
});

test("before the press the line says what will be uploaded, and afterwards how it went", () => {
  expect(statusLine(IDLE, png, null)).toBe("Share uploads this card to this game's server. Anyone with the link can see it.");
  expect(statusLine(IDLE, png, video)).toContain("uploads this card and the video of your fight (2.5 MB) to");
  // A video or a card the upload would skip is not promised.
  expect(statusLine(IDLE, png, new Blob([]))).toContain("uploads this card to");
  expect(statusLine(IDLE, png, { size: MAX_VIDEO_BYTES + 1 } as Blob)).toContain("uploads this card to");
  expect(statusLine(IDLE, null, video)).toContain("uploads the video of your fight (2.5 MB) to");
  expect(statusLine(IDLE, { size: MAX_CARD_BYTES + 1 } as Blob, video)).toContain("uploads the video of your fight (2.5 MB) to");
  expect(statusLine(IDLE, null, null)).toBe("There is nothing to share yet.");
  expect(statusLine(uploading, png, video)).toBe("Sending the card...");
  expect(statusLine(uploading, null, video)).toBe("Making the replay page...");
  expect(statusLine(sendingVideo, png, video)).toBe("Sending the fight video...");
  expect(statusLine({ kind: "failed" }, png, video)).toContain("Sharing is unavailable");
  expect(statusLine(shared, png, video, { qr: true })).toBe("Scan the code, or open the link, to see it on a phone.");
  expect(statusLine({ ...shared, videoFailed: true }, png, video)).toBe("The fight video did not upload. The link opens the page without it.");
});

test("when the QR code did not load, the line offers the link and no code to scan", () => {
  expect(statusLine(shared, png, video, { qr: false })).toBe("Open the link to see it on a phone.");
  // Unless it is told the code is on the page, the line never promises one.
  expect(statusLine(shared, png, video)).not.toContain("Scan");
  expect(statusLine({ ...shared, videoFailed: true }, png, video, { qr: false })).not.toContain("Scan");
});

test("when the player's portrait is on the card, the line says it is uploaded with the card", () => {
  expect(statusLine(IDLE, png, null, { portrait: true })).toBe("Share uploads this card, with your portrait on it, to this game's server. Anyone with the link can see it.");
  expect(statusLine(IDLE, png, video, { portrait: true })).toContain("uploads this card, with your portrait on it, and the video of your fight (2.5 MB) to");
  // A card with no portrait, and a card that would not be sent, do not mention one.
  expect(statusLine(IDLE, png, null, { portrait: false })).not.toContain("portrait");
  expect(statusLine(IDLE, null, video, { portrait: true })).not.toContain("portrait");
});

test("Share is held until the card on screen is the finished one, so the placeholder card is never uploaded", () => {
  const words = cardWords(fight);
  const portrait = { picture: "of Athena" };
  // The card painted on mount, before the portrait came, carries the placeholder emblem.
  const placeholder = { words, portrait: null, settled: false };
  const now = { words, portrait, settled: true };
  expect(cardFinished(null, placeholder)).toBe(false);
  expect(cardFinished(placeholder, placeholder)).toBe(false);
  // The portrait has arrived but the card on screen is still the one painted without it.
  expect(cardFinished(placeholder, now)).toBe(false);
  expect(cardFinished({ words, portrait: null, settled: true }, now)).toBe(false);
  expect(cardFinished(now, now)).toBe(true);
  // A god with no portrait at all: the card is finished once that is known.
  expect(cardFinished({ words, portrait: null, settled: true }, { words, portrait: null, settled: true })).toBe(true);
  // New words (another result) need a new paint first.
  expect(cardFinished(now, { ...now, words: cardWords({ ...fight, won: false }) })).toBe(false);

  expect(heldUntilReady(IDLE, false)).toEqual(PREPARING);
  expect(heldUntilReady({ kind: "failed" }, false)).toEqual(PREPARING);
  expect(heldUntilReady(IDLE, true)).toBe(IDLE);
  // A share that is running or done is shown as it is.
  expect(heldUntilReady(uploading, false)).toBe(uploading);
  expect(heldUntilReady(shared, false)).toBe(shared);
  expect(canShare(PREPARING)).toBe(false);
  expect(shareStep(PREPARING, { type: "start" })).toBe(PREPARING);
  expect(statusLine(PREPARING, png, video)).toBe("Painting your card. You can share it once it is finished.");
});

test("Share waits for the god's portrait, but not for ever", async () => {
  vi.useFakeTimers();
  const load = (url: string | null): Promise<string | null> => Promise.resolve(url === null ? null : `loaded ${url}`);
  const outcome = (waited: Promise<string | null>): { value: string | null | undefined } => {
    const box: { value: string | null | undefined } = { value: undefined };
    void waited.then((value) => { box.value = value; });
    return box;
  };
  let arrive: (url: string) => void = () => undefined;
  const late = outcome(portraitWithin(new Promise<string | null>((resolve) => { arrive = resolve; }), load));
  const never = outcome(portraitWithin(new Promise<string | null>(() => undefined), load));
  await vi.advanceTimersByTimeAsync(PORTRAIT_WAIT_MS - 1);
  expect(late.value).toBeUndefined();
  expect(never.value).toBeUndefined();
  arrive("blob:portrait");
  await vi.advanceTimersByTimeAsync(0);
  expect(late.value).toBe("loaded blob:portrait");
  // A portrait that never comes stops holding Share when the limit is up.
  await vi.advanceTimersByTimeAsync(1);
  expect(never.value).toBeNull();
  // No god, a portrait that fails and a picture that cannot be loaded all settle at once, with no portrait.
  expect(await portraitWithin(undefined, load)).toBeNull();
  expect(await portraitWithin(Promise.reject(new Error("no portrait")), load)).toBeNull();
  expect(await portraitWithin(Promise.resolve("blob:broken"), () => Promise.reject(new Error("broken")))).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});

test("a share cannot start twice, can be tried again after a failure, and ignores events it is not waiting for", () => {
  expect(shareStep(IDLE, { type: "start" })).toEqual(uploading);
  expect(shareStep(uploading, { type: "start" })).toBe(uploading);
  expect(shareStep({ kind: "failed" }, { type: "start" })).toEqual(uploading);
  expect(shareStep(shared, { type: "start" })).toBe(shared);
  expect(shareStep(shared, { type: "done", links: null, videoFailed: false })).toBe(shared);
  expect(shareStep(IDLE, { type: "done", links, videoFailed: false })).toBe(IDLE);
  expect(shareStep(IDLE, { type: "video" })).toBe(IDLE);
  expect([IDLE, uploading, shared, { kind: "failed" } as const].map(canShare)).toEqual([true, false, false, true]);
  // A link that is not a web address is never put on the page.
  expect(shareStep(uploading, { type: "done", videoFailed: false, links: { ...links, pageUrl: "javascript:alert(1)" } })).toEqual({ kind: "failed" });
  expect(shareStep(uploading, { type: "done", videoFailed: false, links: { ...links, pageUrl: "/replays/x" } })).toEqual({ kind: "failed" });
});

test("a share that works goes from the card to the video to the links", async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = (input, init) => {
    calls.push(`${init?.method ?? "GET"} ${typeof input === "string" ? input : "not a path"}`);
    return Promise.resolve(Response.json(init?.method === "POST" ? created : { ok: true }));
  };
  const seen = await states((send) => runShare(job, send, { fetcher }));
  expect(seen).toEqual([uploading, sendingVideo, shared]);
  expect(calls).toEqual(["POST /api/replays", "PUT /api/replays/abcdefghjk/video"]);
});

test("a video the server refuses, or that never arrives, still shares the page and says the video is missing", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const lost = [uploading, sendingVideo, { ...shared, videoFailed: true }];
  const refused: typeof fetch = (_input, init) =>
    Promise.resolve(init?.method === "PUT" ? new Response("no", { status: 500 }) : Response.json(created));
  expect(await states((send) => runShare(job, send, { fetcher: refused }))).toEqual(lost);
  const dropped: typeof fetch = (_input, init) =>
    init?.method === "PUT" ? Promise.reject(new TypeError("Failed to fetch")) : Promise.resolve(Response.json(created));
  expect(await states((send) => runShare(job, send, { fetcher: dropped }))).toEqual(lost);
});

test("with no video there is one request and no video stage", async () => {
  const upload = vi.fn<typeof uploadReplay>(() => Promise.resolve(links));
  const seen = await states((send) => runShare({ ...job, video: null }, send, { upload }));
  expect(seen).toEqual([uploading, shared]);
  expect(upload).toHaveBeenCalledTimes(1);
  expect(upload.mock.calls[0]?.[0]).toEqual({ meta: job.meta, card: png, video: null });
});

test("a server that is off, an upload that throws and a listener that throws all end quietly as failed", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const off: typeof fetch = () => Promise.reject(new TypeError("Failed to fetch"));
  expect(await states((send) => runShare(job, send, { fetcher: off }))).toEqual([uploading, { kind: "failed" }]);
  const refused: typeof fetch = () => Promise.resolve(new Response("no", { status: 500 }));
  expect(await states((send) => runShare(job, send, { fetcher: refused }))).toEqual([uploading, { kind: "failed" }]);
  const broken = (): Promise<ReplayLinks | null> => Promise.reject(new Error("boom"));
  expect(await states((send) => runShare(job, send, { upload: broken }))).toEqual([uploading, { kind: "failed" }]);
  const thrower = (): void => { throw new Error("listener"); };
  await expect(runShare(job, thrower, { upload: () => Promise.resolve(links) })).resolves.toBeUndefined();
});

/** A request that never answers: it ends only when its signal is aborted (or already was), as fetch does. */
function hangs(init: RequestInit | undefined): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const signal = init?.signal;
    const end = (): void => { reject(signal?.reason instanceof Error ? signal.reason : new Error("aborted")); };
    if (signal?.aborted === true) end();
    else signal?.addEventListener("abort", end);
  });
}

test("closing the panel while the page is being made cancels that request, and no video is sent", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const stop = new AbortController();
  const sent: { method: string; signal: AbortSignal | null }[] = [];
  const fetcher: typeof fetch = (_input, init) => {
    sent.push({ method: init?.method ?? "GET", signal: init?.signal ?? null });
    return hangs(init);
  };
  const run = states((send) => runShare(job, send, { fetcher, signal: stop.signal }));
  await vi.waitFor(() => { expect(sent).toHaveLength(1); });
  expect(sent[0]?.signal?.aborted).toBe(false);
  stop.abort();
  expect(sent[0]?.signal?.aborted).toBe(true);
  expect(await run).toEqual([uploading, { kind: "failed" }]);
  expect(sent.map((request) => request.method)).toEqual(["POST"]);
});

test("closing the panel while the video is going up cancels the video", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const stop = new AbortController();
  let videoSignal: AbortSignal | null = null;
  const fetcher: typeof fetch = (_input, init) => {
    if (init?.method !== "PUT") return Promise.resolve(Response.json(created));
    videoSignal = init.signal ?? null;
    return hangs(init);
  };
  const run = states((send) => runShare(job, send, { fetcher, signal: stop.signal }));
  await vi.waitFor(() => { expect(videoSignal).not.toBeNull(); });
  stop.abort();
  expect((videoSignal as AbortSignal | null)?.aborted).toBe(true);
  expect(await run).toEqual([uploading, sendingVideo, { ...shared, videoFailed: true }]);
});

test("a share stopped just as the page is made does not go on to send the video", async () => {
  const stop = new AbortController();
  const calls: string[] = [];
  const fetcher: typeof fetch = (_input, init) => {
    calls.push(init?.method ?? "GET");
    stop.abort();
    return Promise.resolve(Response.json(created));
  };
  await runShare(job, () => undefined, { fetcher, signal: stop.signal });
  expect(calls).toEqual(["POST"]);
});

test("presses that land together make one upload, and Share works again once that one has ended", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  let answer: (response: Response) => void = () => undefined;
  const posts: string[] = [];
  const fetcher: typeof fetch = (_input, init) => {
    posts.push(init?.method ?? "GET");
    return new Promise((resolve) => { answer = resolve; });
  };
  const share = oneShareAtATime();
  const events: ShareEvent[] = [];
  const send = (event: ShareEvent): void => { events.push(event); };
  const cardOnly = { ...job, video: null };
  const presses = [share(cardOnly, send, { fetcher }), share(cardOnly, send, { fetcher }), share(cardOnly, send, { fetcher })];
  await vi.waitFor(() => { expect(posts).toHaveLength(1); });
  answer(new Response("no", { status: 500 }));
  await Promise.all(presses);
  expect(posts).toEqual(["POST"]);
  expect(events.map((event) => event.type)).toEqual(["start", "done"]);
  // The first share failed and is over, so a new press is a new try.
  const again = share(cardOnly, send, { fetcher });
  await vi.waitFor(() => { expect(posts).toHaveLength(2); });
  answer(Response.json(created));
  await again;
  expect(events.at(-1)).toEqual({ type: "done", links, videoFailed: false });
});

test("in a browser with no AbortSignal.any a share still uploads, and closing the panel still cancels it", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const any = Object.getOwnPropertyDescriptor(AbortSignal, "any");
  Object.defineProperty(AbortSignal, "any", { value: undefined, configurable: true, writable: true });
  try {
    const calls: string[] = [];
    const works: typeof fetch = (_input, init) => {
      calls.push(init?.method ?? "GET");
      return Promise.resolve(Response.json(init?.method === "POST" ? created : { ok: true }));
    };
    expect(await states((send) => runShare(job, send, { fetcher: works, signal: new AbortController().signal }))).toEqual([uploading, sendingVideo, shared]);
    expect(calls).toEqual(["POST", "PUT"]);

    const stop = new AbortController();
    const signals: AbortSignal[] = [];
    const stuck: typeof fetch = (_input, init) => {
      if (init?.signal) signals.push(init.signal);
      return hangs(init);
    };
    const run = states((send) => runShare(job, send, { fetcher: stuck, signal: stop.signal }));
    await vi.waitFor(() => { expect(signals).toHaveLength(1); });
    expect(signals[0]?.aborted).toBe(false);
    stop.abort();
    expect(signals[0]?.aborted).toBe(true);
    expect(await run).toEqual([uploading, { kind: "failed" }]);
    // A share that was already stopped when it began is cancelled at once.
    expect(await states((send) => runShare(job, send, { fetcher: stuck, signal: stop.signal }))).toEqual([uploading, { kind: "failed" }]);
  } finally {
    if (any) Object.defineProperty(AbortSignal, "any", any);
  }
});

// A server render runs no effects, so these cover the first markup only: no portrait has settled and no card is painted.
// That the button opens once the finished card is painted, and that nothing is fetched on mount, was checked in a browser, not here.
test("on its first markup Share is there but held, and nothing is promised until the card is finished", () => {
  const props = { god: null, won: true, enemyName: "Polyphemus", fightTitle: "The Cyclops of the Cave", score: 10, style: "Boxer" };
  for (const markup of [
    renderToStaticMarkup(createElement(SharePanel, { ...props, video, onClose: () => undefined })),
    renderToStaticMarkup(createElement(SharePanel, props)),
  ]) {
    expect(markup).toContain("Painting your card...");
    expect(markup).toMatch(/<button class="share-action" disabled="">Share<\/button>/);
    expect(markup).toContain("Painting your card. You can share it once it is finished.");
    expect(markup).not.toContain("Share uploads");
    // There is no card to save yet.
    expect(markup).not.toContain("Save card");
  }
  expect(renderToStaticMarkup(createElement(SharePanel, { ...props, onClose: () => undefined }))).toContain(">Close</button>");
});

test("once the card is finished the line names only what would be sent", () => {
  expect(statusLine(heldUntilReady(IDLE, true), null, video)).toContain("uploads the video of your fight (2.5 MB) to");
  expect(statusLine(heldUntilReady(IDLE, true), null, null)).toBe("There is nothing to share yet.");
});
