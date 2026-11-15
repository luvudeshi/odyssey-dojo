// scripts/tunnel.mjs run for real against a stand-in for cloudflared, which is not installed where these tests run.
// The stand-in is a small program named cloudflared, alone on PATH, that prints what the real one prints.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeEach, expect, test, vi } from "vitest";
import { CreateReplayResponseSchema } from "../../src/replay/contracts";
import { NO_AI } from "../ai/types";
import { createApp } from "../app";
import { loadConfig } from "../env";
import { TUNNEL_FILE, tunnelAddress } from "../lib/address";

const SCRIPT = fileURLToPath(new URL("../../scripts/tunnel.mjs", import.meta.url));
const ADDRESS = "https://kingston-inside-best-graphic.trycloudflare.com";
const INSTALL_PAGE = "https://developers.cloudflare.com/tunnel/downloads/";

// The first lines are what cloudflared logs on stderr for `cloudflared tunnel --url ...`: its notice, then the address in a box.
// The "offline" line is put together from the error text in cloudflared's quick_tunnel.go and Go's usual DNS failure; it was not captured from a run.
const STAND_IN = `
import { appendFileSync } from "node:fs";
appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args: process.argv.slice(2), pid: process.pid }) + "\\n");
const say = (text) => { process.stderr.write("2026-11-14T21:02:11Z " + text + "\\n"); };
const stay = () => { setInterval(() => undefined, 1000); };
say("INF Thank you for trying Cloudflare Tunnel. Doing so, without a Cloudflare account, is a quick way to experiment and try it out. However, be aware that these account-less Tunnels have no uptime guarantee, are subject to the Cloudflare Online Services Terms of Use (https://www.cloudflare.com/website-terms/), and Cloudflare reserves the right to investigate your use of Tunnels for violations of such terms. If you intend to use Tunnels in production you should use a pre-created named tunnel by following: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps");
say("INF Requesting new quick Tunnel on trycloudflare.com...");
const box = () => {
  say("INF +--------------------------------------------------------------------------------------------+");
  say("INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |");
  say("INF |  ${ADDRESS}                                    |");
  say("INF +--------------------------------------------------------------------------------------------+");
  say("INF Registered tunnel connection connIndex=0 connection=ae6d4352-0fe7-43c6-aa96-e997327bfb7a event=0 ip=198.41.192.7 location=dfw08 protocol=quic");
};
const mode = process.env.FAKE_MODE;
if (mode === "up") { box(); stay(); }
if (mode === "dies") { box(); setTimeout(() => process.exit(1), 400); }
if (mode === "silent") stay();
if (mode === "offline") {
  say('ERR failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": dial tcp: lookup api.trycloudflare.com: no such host');
  process.exitCode = 1;
}
if (mode === "garbage") {
  for (const line of [
    'ERR failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": context deadline exceeded',
    "INF |  http://kingston-inside-best-graphic.trycloudflare.com  |",
    "INF |  https://kingston-inside-best-graphic.trycloudflare.com.evil.example  |",
    "INF |  https://kingston-inside-best-graphic.trycloudflare.com/join  |",
    "INF |  https://kingston-inside-best-graphic.trycloudflare.com:8443  |",
    "INF |  https://kingston-inside-best-graphic.trycloudflare.community  |",
    "INF |  https://someone@kingston-inside-best-graphic.trycloudflare.com  |",
    "INF |  https://evil.example/https://kingston-inside-best-graphic.trycloudflare.com/  |",
    "INF |  https://www.trycloudflare.com  |",
    "INF |  https://trycloudflare.com  |",
    "INF |  https://KINGSTON.TRYCLOUDFLARE.COM  |",
    "\\u0000\\u001b[31m\\ufffd |  | https:// trycloudflare.com",
    "",
  ]) say(line);
  stay();
}
`;

const scratch = mkdtempSync(join(tmpdir(), "odyssey-tunnel-"));
const bin = join(scratch, "bin");
const empty = join(scratch, "empty");
mkdirSync(bin);
mkdirSync(empty);
writeFileSync(join(scratch, "stand-in.mjs"), STAND_IN);
// A shell wrapper rather than a "#!node" line, so a path with a space in it still runs.
writeFileSync(join(bin, "cloudflared"), `#!/bin/sh\nexec "${process.execPath}" "${join(scratch, "stand-in.mjs")}" "$@"\n`);
chmodSync(join(bin, "cloudflared"), 0o755);

let root = scratch;
let dataDir = scratch;
let fakeLog = scratch;
let run = 0;
const closers: (() => unknown)[] = [];
beforeEach(() => {
  run += 1;
  root = join(scratch, `run-${String(run)}`);
  dataDir = join(root, "server/data");
  fakeLog = join(root, "cloudflared.log");
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(join(root, "dist/index.html"), "<!doctype html><title>game</title>");
  vi.stubEnv("PUBLIC_BASE_URL", "");
  vi.stubEnv("PUBLIC_URL", "");
});
afterEach(async () => {
  for (const closer of closers.splice(0)) await closer();
  // No stand-in outlives its test, whatever the test did to the script.
  for (const { pid } of starts()) kill(pid);
  vi.unstubAllEnvs();
});
afterAll(() => { rmSync(scratch, { recursive: true, force: true }); });

function kill(pid: number): void {
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Already gone.
  }
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function until(what: string, check: () => boolean): Promise<void> {
  for (let tries = 0; tries < 400; tries += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`gave up waiting for ${what}`);
}

/** Each time the stand-in cloudflared was started: its arguments and its process id. */
function starts(): { args: string[]; pid: number }[] {
  if (!existsSync(fakeLog)) return [];
  return readFileSync(fakeLog, "utf8").trim().split("\n").map((line) => JSON.parse(line) as { args: string[]; pid: number });
}

interface Run {
  readonly pid: number;
  out(): string;
  err(): string;
  signal(name: NodeJS.Signals): void;
  /** The exit code, once the script has ended. */
  readonly done: Promise<number | null>;
}

/**
 * Runs the script with nothing on PATH but the stand-in, or with nothing at all when `mode` is null.
 * The stand-in's address leads nowhere, so the script's look at the guard from outside goes to TUNNEL_CHECK_ORIGIN:
 * by default a port nothing listens on, so no test reaches for the network.
 */
function tunnel(mode: string | null, args: readonly string[], env: Record<string, string> = {}): Run {
  const child = spawn(process.execPath, [SCRIPT, ...args], {
    env: {
      PATH: mode === null ? empty : bin, FAKE_MODE: mode ?? "", FAKE_LOG: fakeLog, TUNNEL_DATA_DIR: dataDir, TUNNEL_WAIT_MS: "20000",
      TUNNEL_CHECK_ORIGIN: "http://127.0.0.1:1", TUNNEL_CHECK_MS: "50", ...env,
    },
  });
  let out = "";
  let err = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { out += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { err += chunk; });
  const done = once(child, "close").then(([code]) => code as number | null);
  closers.push(() => {
    child.kill("SIGKILL");
    return done;
  });
  return { pid: child.pid ?? 0, out: () => out, err: () => err, signal: (name) => { child.kill(name); }, done };
}

/** The real server on a loopback port, serving a built game from this test's folder, with its settings loaded as main.ts loads them. */
async function game(built = true): Promise<{ port: number; pageUrl: () => Promise<string> }> {
  const config = loadConfig(root);
  const app = await createApp({ config: built ? config : { ...config, publicBaseUrl: null, distDir: join(root, "missing") }, ai: NO_AI });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  closers.push(() => { server.close(); });
  const { port } = server.address() as AddressInfo;
  const pageUrl = async (): Promise<string> => {
    const meta = { godName: "Athena", epithet: "Grey-eyed tactician", enemyName: "Polyphemus", fightTitle: "The Cave of the Cyclops", score: 1234, won: true };
    const response = await fetch(`http://127.0.0.1:${String(port)}/api/replays`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meta, card: null }),
    });
    return CreateReplayResponseSchema.parse(await response.json()).page_url;
  };
  return { port, pageUrl };
}

/**
 * A server that says which address it hands to phones, as the room screens' /api/rooms/address does.
 * With `guarded` false it stands for a server started before the tunnel guard: a marked GET /api/level gets that server's 404, not a 403.
 */
async function gameThatSays(base: string, guarded = true): Promise<number> {
  const server = createServer((request, response) => {
    const says = request.url === "/api/rooms/address";
    if (request.url === "/api/level") response.writeHead(guarded && "cf-ray" in request.headers ? 403 : 404).end();
    else response.writeHead(200, { "Content-Type": says ? "application/json" : "text/html" }).end(says ? JSON.stringify({ base }) : "<!doctype html>");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  closers.push(() => { server.close(); });
  return (server.address() as AddressInfo).port;
}

/** Stands where the tunnel's public end would be: passes a request on to the game, marked the way cloudflared marks it, or not marked at all. */
async function publicEnd(gamePort: number, marked: boolean): Promise<string> {
  const headers: Record<string, string> = marked ? { "Cf-Connecting-Ip": "203.0.113.7", "Cf-Ray": "8f1c2d3e4f5a6b7c-DFW", "X-Forwarded-For": "203.0.113.7" } : {};
  const server = createServer((request, response) => {
    fetch(`http://127.0.0.1:${String(gamePort)}${request.url ?? "/"}`, { headers })
      .then(async (answer) => { response.writeHead(answer.status, { "Content-Type": answer.headers.get("content-type") ?? "text/plain" }).end(await answer.text()); })
      .catch(() => { response.writeHead(502).end(); });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  closers.push(() => { server.close(); });
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

/** A port nothing listens on. */
async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  server.close();
  await once(server, "close");
  return port;
}

function oneLine(text: string): string {
  expect(text.endsWith("\n"), text).toBe(true);
  expect(text.trim().split("\n"), text).toHaveLength(1);
  return text.trim();
}

test("without cloudflared it says so in one line, with where to get it, and touches nothing", async () => {
  const { port, pageUrl } = await game();
  const before = await pageUrl();
  const script = tunnel(null, [String(port)]);
  expect(await script.done).toBe(1);
  const line = oneLine(script.err());
  expect(line).toContain("cloudflared is not installed");
  expect(line).toContain("The game keeps the LAN address and touch buttons.");
  expect(line).toContain(INSTALL_PAGE);
  expect(script.out()).toBe("");
  expect(existsSync(join(dataDir, TUNNEL_FILE))).toBe(false);
  expect(new URL(await pageUrl()).origin).toBe(new URL(before).origin);
});

test("it opens a tunnel to the running game, the server hands out the https address, and stopping takes it back", async () => {
  const { port, pageUrl } = await game();
  const lan = new URL(await pageUrl()).origin;
  expect(lan.startsWith("http://")).toBe(true);

  const script = tunnel("up", [String(port)], { TUNNEL_BEAT_MS: "100" });
  await until("the last line", () => script.out().includes("Press Ctrl+C"));
  expect(script.out()).toContain(`Tunnel is up: ${ADDRESS}\n`);
  // The room screens' /api/rooms/address is not on main yet, so the script cannot ask and says how the server learns it.
  expect(script.out()).toContain("The server reads this address on its next request.");
  expect(script.err()).toBe("");
  expect(starts().map((start) => start.args)).toEqual([["tunnel", "--url", `http://127.0.0.1:${String(port)}`]]);
  expect(JSON.parse(readFileSync(join(dataDir, TUNNEL_FILE), "utf8"))).toEqual({ url: ADDRESS, pid: script.pid });

  // The server was already running, and its next link is on the tunnel.
  expect(await pageUrl()).toMatch(new RegExp(`^${ADDRESS}/replays/[^/]+$`));

  // The script keeps the file fresh: made to look ten minutes old, it counts again within a beat or two.
  const old = new Date(Date.now() - 10 * 60_000);
  utimesSync(join(dataDir, TUNNEL_FILE), old, old);
  expect(tunnelAddress(dataDir)).toBeNull();
  await until("a beat", () => tunnelAddress(dataDir) === ADDRESS);

  // Nothing answers at the public end here, so the script says the guard was not checked from outside, and stays up.
  await until("the check to give up", () => script.out().includes("the guard was not checked there"));
  expect(script.out()).toContain(`Open ${ADDRESS}/api/level on a phone: it must show {"error":"local_only"}.`);
  expect(tunnelAddress(dataDir)).toBe(ADDRESS);

  script.signal("SIGINT");
  expect(await script.done).toBe(0);
  expect(script.out()).toContain("The tunnel is closed. The game is back on the LAN address and touch buttons.");
  expect(existsSync(join(dataDir, TUNNEL_FILE))).toBe(false);
  expect(isRunning(starts()[0]?.pid ?? 0)).toBe(false);
  expect(new URL(await pageUrl()).origin).toBe(lan);
});

test("SIGTERM and a closed terminal stop it the same way", async () => {
  const { port } = await game();
  for (const name of ["SIGTERM", "SIGHUP"] as const) {
    const script = tunnel("up", [String(port)]);
    await until("the address", () => existsSync(join(dataDir, TUNNEL_FILE)));
    script.signal(name);
    expect(await script.done, name).toBe(0);
    expect(existsSync(join(dataDir, TUNNEL_FILE)), name).toBe(false);
  }
  expect(starts().map((start) => isRunning(start.pid))).toEqual([false, false]);
});

test("a script killed outright leaves its file behind, and the server stops using it at once", async () => {
  const { port, pageUrl } = await game();
  const lan = new URL(await pageUrl()).origin;
  const script = tunnel("up", [String(port)]);
  await until("the address", () => existsSync(join(dataDir, TUNNEL_FILE)));
  expect(new URL(await pageUrl()).origin).toBe(ADDRESS);
  script.signal("SIGKILL");
  await script.done;
  expect(existsSync(join(dataDir, TUNNEL_FILE))).toBe(true);
  expect(tunnelAddress(dataDir)).toBeNull();
  expect(new URL(await pageUrl()).origin).toBe(lan);
});

test("when cloudflared never gives an address, or prints only things that are not one, it gives up in one line", async () => {
  const { port, pageUrl } = await game();
  const lan = new URL(await pageUrl()).origin;
  for (const mode of ["silent", "garbage"]) {
    const script = tunnel(mode, [String(port)], { TUNNEL_WAIT_MS: "1500" });
    expect(await script.done, mode).toBe(1);
    const line = oneLine(script.err());
    expect(line, mode).toContain("cloudflared gave no address in 2 seconds. Is there internet?");
    expect(line, mode).toContain("The game keeps the LAN address and touch buttons.");
    expect(script.out(), mode).toBe("");
    expect(existsSync(join(dataDir, TUNNEL_FILE)), mode).toBe(false);
    expect(new URL(await pageUrl()).origin, mode).toBe(lan);
  }
  expect(starts().map((start) => isRunning(start.pid))).toEqual([false, false]);
});

test("when cloudflared stops early, as with no internet, it says so in one line and the error's own address is not taken", async () => {
  const { port, pageUrl } = await game();
  const lan = new URL(await pageUrl()).origin;
  const script = tunnel("offline", [String(port)]);
  expect(await script.done).toBe(1);
  const line = oneLine(script.err());
  expect(line).toContain("cloudflared stopped before it gave an address (exit code 1). Is there internet?");
  expect(line).toContain("The game keeps the LAN address and touch buttons.");
  expect(line).toContain("no such host");
  expect(script.out()).toBe("");
  expect(existsSync(join(dataDir, TUNNEL_FILE))).toBe(false);
  expect(new URL(await pageUrl()).origin).toBe(lan);
});

test("when cloudflared dies after the tunnel was up, the address is taken back", async () => {
  const { port, pageUrl } = await game();
  const lan = new URL(await pageUrl()).origin;
  const script = tunnel("dies", [String(port)]);
  expect(await script.done).toBe(1);
  expect(script.out()).toContain(`Tunnel is up: ${ADDRESS}\n`);
  expect(oneLine(script.err())).toContain("cloudflared stopped (exit code 1), so the tunnel is closed.");
  expect(existsSync(join(dataDir, TUNNEL_FILE))).toBe(false);
  expect(new URL(await pageUrl()).origin).toBe(lan);
});

test("it will not open a tunnel to nothing or to an unguarded server: no server, no built game, old code, or a port that is not one", async () => {
  const nothing = tunnel("up", [String(await freePort())]);
  expect(await nothing.done).toBe(1);
  expect(oneLine(nothing.err())).toContain("Nothing answers on http://127.0.0.1:");

  const { port } = await game(false);
  const unbuilt = tunnel("up", [String(port)]);
  expect(await unbuilt.done).toBe(1);
  expect(oneLine(unbuilt.err())).toContain("does not serve the game. Run npm run build");

  // A server from before the guard would let the internet spend the keys, so it gets no tunnel either.
  const old = tunnel("up", [String(await gameThatSays(ADDRESS, false))]);
  expect(await old.done).toBe(1);
  expect(oneLine(old.err())).toContain("does not refuse the AI routes to a request from a tunnel, so no tunnel was opened.");

  for (const bad of ["abc", "0", "65536", "80 80", "-1"]) {
    const script = tunnel("up", [bad]);
    expect(await script.done, bad).toBe(1);
    expect(oneLine(script.err()), bad).toContain("is not a port");
  }
  expect(starts()).toEqual([]);
  expect(existsSync(dataDir)).toBe(false);
});

test("it looks at the guard from outside: a tunnel that marks its requests stays up, one that does not is closed", async () => {
  const { port, pageUrl } = await game();
  const lan = new URL(await pageUrl()).origin;
  const marked = tunnel("up", [String(port)], { TUNNEL_CHECK_ORIGIN: await publicEnd(port, true) });
  await until("the check", () => marked.out().includes("Checked through the tunnel: the routes that spend the API keys are refused there."));
  expect(marked.err()).toBe("");
  expect(tunnelAddress(dataDir)).toBe(ADDRESS);
  marked.signal("SIGINT");
  expect(await marked.done).toBe(0);

  // If cloudflared put no header on what it passes on, the guard could not tell a stranger from this machine.
  const bare = tunnel("up", [String(port)], { TUNNEL_CHECK_ORIGIN: await publicEnd(port, false) });
  expect(await bare.done).toBe(1);
  expect(bare.out()).toContain(`Tunnel is up: ${ADDRESS}\n`);
  expect(oneLine(bare.err())).toContain("The routes that spend the API keys are NOT refused through this tunnel, so it is being closed.");
  expect(existsSync(join(dataDir, TUNNEL_FILE))).toBe(false);
  expect(starts().map((start) => isRunning(start.pid))).toEqual([false, false]);
  expect(new URL(await pageUrl()).origin).toBe(lan);
});

test("a second copy refuses to start while a tunnel is up, and leaves the first one alone", async () => {
  const { port } = await game();
  const first = tunnel("up", [String(port)]);
  await until("the first tunnel", () => first.out().includes("Press Ctrl+C"));
  const second = tunnel("up", [String(port)]);
  expect(await second.done).toBe(1);
  expect(oneLine(second.err())).toContain(`A tunnel is already up at ${ADDRESS} (process ${String(first.pid)}).`);
  expect(starts()).toHaveLength(1);
  expect(tunnelAddress(dataDir)).toBe(ADDRESS);
});

test("it asks the server which address it hands out, and warns when that is not the tunnel", async () => {
  const follows = tunnel("up", [String(await gameThatSays(ADDRESS))]);
  await until("the last line", () => follows.out().includes("Press Ctrl+C"));
  expect(follows.out()).toContain("The server hands out this address: the room QR code uses it now.");
  follows.signal("SIGINT");
  expect(await follows.done).toBe(0);

  const fixed = tunnel("up", [String(await gameThatSays("http://192.168.1.20:8787"))]);
  await until("the last line", () => fixed.out().includes("Press Ctrl+C"));
  expect(fixed.out()).toContain("Warning: the server still hands out http://192.168.1.20:8787.");
});
