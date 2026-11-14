// Replay sharing end to end against a temporary data folder: create, page, card, QR, video, bad ids and the cap.
import { once } from "node:events";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, expect, test } from "vitest";
import { CreateReplayResponseSchema, MAX_VIDEO_BYTES } from "../../src/replay/contracts";
import type { CreateReplayResponse } from "../../src/replay/contracts";
import { NO_AI } from "../ai/types";
import { createApp } from "../app";
import type { Config } from "../env";
import { baseUrl, lanAddress } from "../lib/address";
import { escapeHtml } from "../lib/replayPage";
import { MAX_REPLAYS, createReplay, isReplayId } from "../lib/replayStore";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
const CARD = `data:image/png;base64,${PNG.toString("base64")}`;
const VIDEO = Buffer.from(Array.from({ length: 256 }, (_, index) => index));
const meta = {
  godName: "Athena", epithet: "Grey-eyed tactician", enemyName: "Polyphemus", fightTitle: "The Cave of the Cyclops", score: 1234, won: true,
} as const;

const scratch = mkdtempSync(join(tmpdir(), "odyssey-replays-"));
let dataDir = scratch;
let run = 0;
let close: (() => void) | null = null;
beforeEach(() => {
  run += 1;
  dataDir = join(scratch, `run-${String(run)}`);
  mkdirSync(dataDir);
});
afterEach(() => { close?.(); close = null; });
afterAll(() => { rmSync(scratch, { recursive: true, force: true }); });

type Call = (path: string, init?: RequestInit) => Promise<Response>;

async function serve(publicBaseUrl: string | null = null): Promise<Call> {
  const config: Config = {
    port: 0, geminiKey: null, elevenLabsKey: null, dataDir, publicBaseUrl, distDir: "/nonexistent",
    timeouts: { levelMs: 80, revealMs: 80, portraitMs: 80, speechMs: 80 },
  };
  const app = await createApp({ config, ai: NO_AI });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  close = () => { server.close(); };
  const { port } = server.address() as AddressInfo;
  return (path, init) => fetch(`http://127.0.0.1:${String(port)}${path}`, init);
}

function post(json: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json) };
}

function put(body: Uint8Array<ArrayBuffer>, type: string): RequestInit {
  return { method: "PUT", headers: { "Content-Type": type }, body };
}

async function create(call: Call, body: unknown = { meta, card: CARD }): Promise<CreateReplayResponse> {
  const response = await call("/api/replays", post(body));
  expect(response.status).toBe(200);
  return CreateReplayResponseSchema.parse(await response.json());
}

/** Every file under the data folder, so a test can prove a request changed nothing. */
function listing(): string[] {
  return readdirSync(dataDir, { recursive: true, encoding: "utf8" }).sort();
}

test("a replay is created with an unambiguous id, and its page, card and QR code are served", async () => {
  const call = await serve("https://odyssey.example/");
  const made = await create(call);
  expect(made.id).toMatch(/^[a-hjkmnp-z2-9]{10}$/);
  expect(made.page_url).toBe(`https://odyssey.example/replays/${made.id}`);
  expect(made.qr_url).toBe(`/api/replays/${made.id}/qr.svg`);
  expect(listing()).toEqual(["replays", `replays/${made.id}`, `replays/${made.id}/card.png`, `replays/${made.id}/meta.json`]);

  const page = await call(`/replays/${made.id}`);
  expect(page.status).toBe(200);
  expect(page.headers.get("content-type")).toContain("text/html");
  const html = await page.text();
  for (const text of ["Athena", "Grey-eyed tactician", "The Cave of the Cyclops", "Victory", "over Polyphemus", "Score 1,234"]) {
    expect(html).toContain(text);
  }
  expect(html).toContain(`<img src="/replays/${made.id}/card.png"`);
  expect(html).toContain(`href="/replays/${made.id}/card.png" download`);
  expect(html).toContain("#140c22");
  expect(html).toContain("#e8b84a");
  expect(html).not.toContain("<video");
  // Self-contained: no scripts and nothing loaded from another origin.
  expect(html).not.toMatch(/<script|<link|https?:\/\/|url\(/i);

  const card = await call(`/replays/${made.id}/card.png`);
  expect(card.status).toBe(200);
  expect(card.headers.get("content-type")).toBe("image/png");
  expect(Buffer.from(await card.arrayBuffer()).equals(PNG)).toBe(true);

  const qr = await call(made.qr_url);
  expect(qr.status).toBe(200);
  expect(qr.headers.get("content-type")).toContain("image/svg+xml");
  const svg = await qr.text();
  expect(svg).toContain("<svg");
  expect(svg).toContain("#140c22");
  expect(svg).toContain("#f1ead9");
  expect((await call(`/replays/${made.id}/video`)).status).toBe(404);
});

test("without a public address the page link points at this machine on the port the request used", async () => {
  const call = await serve();
  const made = await create(call, { meta: { ...meta, won: false }, card: null });
  expect(made.page_url).toMatch(new RegExp(`^http://[0-9a-z.]+:\\d+/replays/${made.id}$`));
  expect(existsSync(join(dataDir, "replays", made.id, "card.png"))).toBe(false);
  const html = await (await call(`/replays/${made.id}`)).text();
  expect(html).toContain("Fell");
  expect(html).toContain("to Polyphemus");
  expect(html).not.toContain("<img");
  expect((await call(`/replays/${made.id}/card.png`)).status).toBe(404);

  const arrival = { publicBaseUrl: null, lan: "192.168.1.20", port: 8787, protocol: "http", host: "localhost:5173" };
  expect(baseUrl(arrival)).toBe("http://192.168.1.20:8787");
  expect(baseUrl({ ...arrival, publicBaseUrl: "https://play.example//" })).toBe("https://play.example");
  expect(baseUrl({ ...arrival, lan: null })).toBe("http://localhost:5173");
  expect(baseUrl({ ...arrival, lan: null, host: "evil.example/<script>" })).toBe("http://localhost:8787");
  expect(baseUrl({ ...arrival, lan: null, host: undefined, port: undefined })).toBe("http://localhost:80");
  const wifi = { address: "10.0.0.7", netmask: "255.0.0.0", family: "IPv4", mac: "", internal: false, cidr: null } as const;
  expect(lanAddress({
    lo0: [{ ...wifi, address: "127.0.0.1", internal: true }],
    en5: [{ ...wifi, address: "169.254.10.2" }],
    en0: [{ ...wifi, address: "fe80::1", family: "IPv6", scopeid: 0 }, wifi],
  })).toBe("10.0.0.7");
  expect(lanAddress({ lo0: [{ ...wifi, address: "127.0.0.1", internal: true }] })).toBeNull();
});

test("a video is stored, shown on the page and served in ranges", async () => {
  const call = await serve();
  const made = await create(call);
  const path = `/api/replays/${made.id}/video`;
  expect((await call(path, put(VIDEO, "video/webm;codecs=vp9,opus"))).status).toBe(200);

  const html = await (await call(`/replays/${made.id}`)).text();
  expect(html).toContain(`<video controls playsinline preload="metadata" src="/replays/${made.id}/video"`);
  expect(html).toContain('download="odyssey-fighter-replay.webm"');

  const whole = await call(`/replays/${made.id}/video`);
  expect(whole.status).toBe(200);
  expect(whole.headers.get("content-type")).toBe("video/webm");
  expect(whole.headers.get("accept-ranges")).toBe("bytes");
  expect(Buffer.from(await whole.arrayBuffer()).equals(VIDEO)).toBe(true);

  const part = await call(`/replays/${made.id}/video`, { headers: { Range: "bytes=10-19" } });
  expect(part.status).toBe(206);
  expect(part.headers.get("content-range")).toBe(`bytes 10-19/${String(VIDEO.length)}`);
  expect(Buffer.from(await part.arrayBuffer()).equals(VIDEO.subarray(10, 20))).toBe(true);

  // A second upload in the other container replaces the first.
  expect((await call(path, put(VIDEO.subarray(0, 32), "video/mp4"))).status).toBe(200);
  const replaced = await call(`/replays/${made.id}/video`);
  expect(replaced.headers.get("content-type")).toBe("video/mp4");
  expect((await replaced.arrayBuffer()).byteLength).toBe(32);
  expect(readdirSync(join(dataDir, "replays", made.id)).sort()).toEqual(["card.png", "meta.json", "video.mp4"]);
});

test("a range past the end of the video is a 416 and a failed precondition is a 412", async () => {
  const call = await serve();
  const made = await create(call);
  expect((await call(`/api/replays/${made.id}/video`, put(VIDEO, "video/webm"))).status).toBe(200);

  const past = await call(`/replays/${made.id}/video`, { headers: { Range: "bytes=500-600" } });
  expect(past.status).toBe(416);
  expect(past.headers.get("content-range")).toBe(`bytes */${String(VIDEO.length)}`);
  expect(await past.text()).toBe("");
  const stale = await call(`/replays/${made.id}/video`, { headers: { "If-Match": '"another"' } });
  expect(stale.status).toBe(412);
  expect(await stale.text()).toBe("");
});

// Taking away read permission needs a POSIX filesystem and a user who is not root.
const canLock = process.platform !== "win32" && process.getuid?.() !== 0;

test.skipIf(!canLock)("a stored file that cannot be sent is a 404 labelled as JSON, not as the file", async () => {
  const call = await serve();
  const made = await create(call);
  expect((await call(`/api/replays/${made.id}/video`, put(VIDEO, "video/webm"))).status).toBe(200);
  // The lookup still finds both files, so the failure comes from sending them, as when a replay is pruned mid-request.
  for (const file of ["card.png", "video.webm"]) chmodSync(join(dataDir, "replays", made.id, file), 0o000);
  for (const path of [`/replays/${made.id}/card.png`, `/replays/${made.id}/video`]) {
    const gone = await call(path);
    expect(gone.status, path).toBe(404);
    expect(gone.headers.get("content-type"), path).toContain("application/json");
    expect(await gone.json(), path).toEqual({ error: "not_found" });
  }
});

test("a bad video body is refused and leaves the replay as it was", async () => {
  const call = await serve();
  const made = await create(call);
  const path = `/api/replays/${made.id}/video`;
  const before = listing();
  expect((await call(path, put(VIDEO, "text/plain"))).status).toBe(400);
  expect((await call(path, put(VIDEO, "application/octet-stream"))).status).toBe(400);
  expect((await call(path, put(new Uint8Array(0), "video/webm"))).status).toBe(400);
  expect((await call(path, post({ video: "nope" }))).status).toBe(404);
  expect((await call(path, put(new Uint8Array(MAX_VIDEO_BYTES + 1), "video/webm"))).status).toBe(413);
  expect(listing()).toEqual(before);
  expect((await call(`/replays/${made.id}/video`)).status).toBe(404);
});

test("a bad create request is a 400 and stores nothing", async () => {
  const call = await serve();
  const bad: unknown[] = [
    {},
    { meta, card: "data:image/jpeg;base64,AAAA" },
    { meta, card: `data:image/png;base64,${Buffer.from("not a png at all").toString("base64")}` },
    { meta: { ...meta, godName: "x".repeat(500) }, card: null },
    { meta: { ...meta, score: "high" }, card: null },
    { meta: { ...meta, won: "yes" }, card: null },
    { meta: { ...meta, epithet: undefined }, card: null },
    { meta },
  ];
  for (const body of bad) expect((await call("/api/replays", post(body))).status).toBe(400);
  // 1e999 is valid JSON that parses to Infinity.
  const infinite = JSON.stringify({ meta, card: null }).replace("1234", "1e999");
  expect((await call("/api/replays", { ...post(null), body: infinite })).status).toBe(400);
  expect(listing()).toEqual([]);
});

test("unknown and malicious ids are a 404 and touch nothing", async () => {
  const call = await serve();
  const made = await create(call);
  // What a path traversal would reach if "../x" were ever joined onto the replays folder.
  mkdirSync(join(dataDir, "x"));
  writeFileSync(join(dataDir, "x", "meta.json"), JSON.stringify({ meta, page_url: "http://leak.example", created_ms: 1 }));
  writeFileSync(join(dataDir, "x", "card.png"), PNG);
  writeFileSync(join(dataDir, "x", "video.webm"), VIDEO);
  const before = listing();

  const ids = [
    "abcdefghjk", "..%2Fx", "..%2F..%2Fx", "%2e%2e%2fx", "..", "x", made.id.toUpperCase(), `${made.id}x`, made.id.slice(1),
    `${made.id}%00`, `${made.id.slice(0, 9)}1`, "a".repeat(5000),
  ];
  for (const id of ids) {
    const page = await call(`/replays/${id}`);
    expect(page.status, id).toBe(404);
    expect(await page.text(), id).not.toContain("Athena");
    expect((await call(`/replays/${id}/card.png`)).status, id).toBe(404);
    expect((await call(`/replays/${id}/video`)).status, id).toBe(404);
    expect((await call(`/api/replays/${id}/qr.svg`)).status, id).toBe(404);
    expect((await call(`/api/replays/${id}/video`, put(VIDEO, "video/webm"))).status, id).toBe(404);
  }
  expect((await (await call("/replays/abcdefghjk")).text())).toContain("Lost at sea");
  expect(listing()).toEqual(before);

  for (const id of ["../x", "..", "", "ABCDEFGHJK", "abcdefghi1", "abcdefghjkm", "abcdefghj", "abcdefghj\n", 7, null, ["abcdefghjk"]]) {
    expect(isReplayId(id)).toBe(false);
  }
  expect(isReplayId("abcdefghjk")).toBe(true);
});

test("every piece of meta is escaped on the page", async () => {
  const call = await serve();
  const hostile = "<script>alert(1)</script>\"'&";
  const made = await create(call, {
    meta: { godName: hostile, epithet: hostile, enemyName: hostile, fightTitle: hostile, score: 5, won: true },
    card: CARD,
  });
  const html = await (await call(`/replays/${made.id}`)).text();
  expect(html).not.toContain("<script");
  expect(html).not.toContain("alert(1)</");
  const escaped = "&lt;script&gt;alert(1)&lt;/script&gt;&quot;&#39;&amp;";
  expect(escapeHtml(hostile)).toBe(escaped);
  // The title, the heading, the image's alt text, the epithet, the fight title and the result line.
  expect(html.split(escaped).length - 1).toBe(6);
});

test("only the newest 200 replays are kept", async () => {
  const call = await serve();
  const ids: string[] = [];
  for (let index = 0; index < MAX_REPLAYS + 2; index += 1) ids.push((await create(call, { meta, card: null })).id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(readdirSync(join(dataDir, "replays")).sort()).toEqual(ids.slice(2).sort());
  expect((await call(`/replays/${ids[0] ?? ""}`)).status).toBe(404);
  expect((await call(`/replays/${ids[1] ?? ""}`)).status).toBe(404);
  expect((await call(`/replays/${ids[2] ?? ""}`)).status).toBe(200);
  expect((await call(`/replays/${ids.at(-1) ?? ""}`)).status).toBe(200);
});

test("creates that overlap at the cap all keep their replay, and exactly 200 remain", async () => {
  const call = await serve();
  const old: string[] = [];
  for (let index = 0; index < MAX_REPLAYS; index += 1) old.push((await create(call, { meta, card: null })).id);
  // Big enough that a card is still being written while the next create starts.
  const big = Buffer.concat([PNG, Buffer.alloc(1_500_000, 7)]);
  const body = { meta, card: `data:image/png;base64,${big.toString("base64")}` };
  const overlap = 12;
  const made = await Promise.all(Array.from({ length: overlap }, () => create(call, body)));

  for (const { id } of made) {
    expect((await call(`/replays/${id}`)).status, id).toBe(200);
    const card = await call(`/replays/${id}/card.png`);
    expect(card.status, id).toBe(200);
    expect((await card.arrayBuffer()).byteLength, id).toBe(big.length);
  }
  const kept = [...old.slice(overlap), ...made.map(({ id }) => id)];
  expect(new Set(kept).size).toBe(MAX_REPLAYS);
  expect(readdirSync(join(dataDir, "replays")).sort()).toEqual(kept.sort());
});

test("a folder another create has only just claimed is not pruned, and an abandoned one goes first", async () => {
  const replays = join(dataDir, "replays");
  const abandoned = join(replays, "aaaaaaaaaa");
  const claimed = join(replays, "bbbbbbbbbb");
  mkdirSync(abandoned, { recursive: true });
  const hourAgo = new Date(Date.now() - 3_600_000);
  utimesSync(abandoned, hourAgo, hourAgo);
  const link = (id: string): string => `http://test.example/replays/${id}`;
  const ids: string[] = [];
  for (let index = 0; index < MAX_REPLAYS - 1; index += 1) ids.push((await createReplay(dataDir, meta, null, link)).id);
  expect(existsSync(abandoned)).toBe(true);

  mkdirSync(claimed);
  ids.push((await createReplay(dataDir, meta, null, link)).id);
  // Two over the cap: the abandoned folder and the oldest real replay go, the fresh claim stays.
  expect(readdirSync(replays).sort()).toEqual(["bbbbbbbbbb", ...ids.slice(1)].sort());
});
