// The share panel's logic: the words on the card, what the player is told before uploading, and the share state machine.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { GODS } from "../src/ai/gods/gods";
import { MAX_VIDEO_BYTES, ReplayMetaSchema } from "../src/replay/contracts";
import { IDLE, canShare, cardFileName, cardWords, replayMeta, runShare, shareStep, statusLine } from "../src/replay/ui/shareFlow";
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

afterEach(() => { vi.restoreAllMocks(); });

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
  expect(statusLine(IDLE, null)).toBe("Share uploads this card to this game's server. Anyone with the link can see it.");
  expect(statusLine(IDLE, video)).toContain("this card and the video of your fight (2.5 MB)");
  // A video the upload would skip is not promised.
  expect(statusLine(IDLE, new Blob([]))).toContain("uploads this card to");
  expect(statusLine(IDLE, { size: MAX_VIDEO_BYTES + 1 } as Blob)).toContain("uploads this card to");
  expect(statusLine(uploading, video)).toBe("Sending the card...");
  expect(statusLine({ kind: "uploading", stage: "video" }, video)).toBe("Sending the fight video...");
  expect(statusLine({ kind: "failed" }, video)).toContain("Sharing is unavailable");
  expect(statusLine({ kind: "shared", links }, video)).toContain("Scan the code");
});

test("a share cannot start twice, can be tried again after a failure, and ignores events it is not waiting for", () => {
  expect(shareStep(IDLE, { type: "start" })).toEqual(uploading);
  expect(shareStep(uploading, { type: "start" })).toBe(uploading);
  expect(shareStep({ kind: "failed" }, { type: "start" })).toEqual(uploading);
  const shared: ShareState = { kind: "shared", links };
  expect(shareStep(shared, { type: "start" })).toBe(shared);
  expect(shareStep(shared, { type: "done", links: null })).toBe(shared);
  expect(shareStep(IDLE, { type: "done", links })).toBe(IDLE);
  expect(shareStep(IDLE, { type: "video" })).toBe(IDLE);
  expect([IDLE, uploading, shared, { kind: "failed" } as const].map(canShare)).toEqual([true, false, false, true]);
  // A link that is not a web address is never put on the page.
  expect(shareStep(uploading, { type: "done", links: { ...links, pageUrl: "javascript:alert(1)" } })).toEqual({ kind: "failed" });
  expect(shareStep(uploading, { type: "done", links: { ...links, pageUrl: "/replays/x" } })).toEqual({ kind: "failed" });
});

test("a share that works goes from the card to the video to the links", async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = (input, init) => {
    calls.push(`${init?.method ?? "GET"} ${typeof input === "string" ? input : "not a path"}`);
    return Promise.resolve(Response.json(init?.method === "POST" ? created : { ok: true }));
  };
  const seen = await states((send) => runShare(job, send, { fetcher }));
  expect(seen).toEqual([uploading, { kind: "uploading", stage: "video" }, { kind: "shared", links }]);
  expect(calls).toEqual(["POST /api/replays", "PUT /api/replays/abcdefghjk/video"]);
});

test("with no video there is one request and no video stage", async () => {
  const upload = vi.fn<typeof uploadReplay>(() => Promise.resolve(links));
  const seen = await states((send) => runShare({ ...job, video: null }, send, { upload }));
  expect(seen).toEqual([uploading, { kind: "shared", links }]);
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

test("the panel's first render makes no request, and says what Share would upload", () => {
  const fetched = vi.spyOn(globalThis, "fetch");
  const props = { god: null, won: true, enemyName: "Polyphemus", fightTitle: "The Cyclops of the Cave", score: 10, style: "Boxer" };
  const withVideo = renderToStaticMarkup(createElement(SharePanel, { ...props, video, onClose: () => undefined }));
  expect(withVideo).toContain("Painting your card...");
  expect(withVideo).toContain(">Share</button>");
  expect(withVideo).toContain("this card and the video of your fight (2.5 MB)");
  expect(withVideo).toContain(">Close</button>");
  // Before the card is painted, and with no video, there is nothing to share and so no button.
  expect(renderToStaticMarkup(createElement(SharePanel, props))).not.toContain("<button");
  expect(fetched).not.toHaveBeenCalled();
});
