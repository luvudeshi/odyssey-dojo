#!/usr/bin/env node
// Opens a Cloudflare quick tunnel to the running game, so a guest's phone gets an https address and may use its camera.
// Run it next to the server:  node scripts/tunnel.mjs [port]   (the port the server serves the built game on, 8787 unless given)
// While the tunnel is up the address sits in server/data/tunnel.json, which the server reads on each request (server/lib/address.ts).
// The file goes away when this stops. What the tunnel lets the internet reach is in docs/rooms-tunnel.md.
// The routes that spend API keys must not answer through the tunnel. That is checked before the tunnel opens and again through it;
// a tunnel that lets them answer is closed.
// Needs cloudflared on PATH. Nothing is installed or downloaded from here.

import { spawn } from "node:child_process";
import { accessSync, constants, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const INSTALL_PAGE = "https://developers.cloudflare.com/tunnel/downloads/";
const FALLBACK = "The game keeps the LAN address and touch buttons.";
// Keep in step with TUNNEL_FILE and TUNNEL_STALE_MS in server/lib/address.ts.
const FILE_NAME = "tunnel.json";
const STALE_MS = 20_000;

// The settings below exist for the tests in server/tests/tunnel.test.ts.
const dataDir = process.env.TUNNEL_DATA_DIR ?? fileURLToPath(new URL("../server/data", import.meta.url));
const waitMs = Number(process.env.TUNNEL_WAIT_MS ?? 30_000);
const beatMs = Number(process.env.TUNNEL_BEAT_MS ?? 5_000);
const checkMs = Number(process.env.TUNNEL_CHECK_MS ?? 3_000);
/** How long cloudflared gets to stop when asked, before it is killed. */
const killMs = Number(process.env.TUNNEL_KILL_MS ?? 5_000);
/** Where the guard is checked from outside. The tunnel's own address, except in tests, which have no tunnel. */
const checkOrigin = process.env.TUNNEL_CHECK_ORIGIN ?? null;
const CHECK_TRIES = 10;
const file = join(dataDir, FILE_NAME);

// cloudflared logs the address on a line of its own inside a box, on stderr:
//   2026-11-14T21:02:11Z INF |  https://kingston-inside-best-graphic.trycloudflare.com                                    |
// (cmd/cloudflared/tunnel/quick_tunnel.go builds "https://" + hostname and logs it with cliutil.LogTable.)
// When it cannot reach Cloudflare its error names https://api.trycloudflare.com/tunnel, which must not be taken for the address,
// so a match may not be the api or www host and may not run on into a path, a port or a longer host name.
const ADDRESS = /https:\/\/(?!(?:api|www)\.)[a-z0-9-]+\.trycloudflare\.com(?![a-z0-9.:/@-])/;

/** @param {string} line */
function addressIn(line) {
  return ADDRESS.exec(line)?.[0] ?? null;
}

/** @param {string} name @returns {string | null} the first file of that name on PATH that may be run */
function onPath(name) {
  const names = process.platform === "win32" ? [`${name}.exe`, name] : [name];
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    for (const each of dir === "" ? [] : names) {
      const candidate = join(dir, each);
      try {
        accessSync(candidate, constants.X_OK);
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        // Not in this folder.
      }
    }
  }
  return null;
}

/** @param {number} pid */
function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

/** @returns {{ url: string, pid: number } | null} what another copy of this script has saved, if that copy is still running */
function otherTunnel() {
  try {
    if (Math.abs(Date.now() - statSync(file).mtimeMs) > STALE_MS) return null;
    const saved = JSON.parse(readFileSync(file, "utf8"));
    const live = typeof saved.url === "string" && Number.isSafeInteger(saved.pid) && saved.pid > 1 && saved.pid !== process.pid && isRunning(saved.pid);
    return live ? saved : null;
  } catch {
    return null;
  }
}

/** @param {string} url */
function save(url) {
  mkdirSync(dataDir, { recursive: true });
  // Written beside the file and renamed over it, so the server never reads half of it.
  const draft = `${file}.${String(process.pid)}`;
  writeFileSync(draft, `${JSON.stringify({ url, pid: process.pid })}\n`);
  renameSync(draft, file);
}

/** Removes the file, but only the one this process wrote. */
function forget() {
  try {
    if (JSON.parse(readFileSync(file, "utf8")).pid === process.pid) rmSync(file, { force: true });
  } catch {
    // Already gone.
  }
}

/** @param {number} port @returns {Promise<"game" | "no_game" | "vite" | "unguarded" | "down">} */
async function probe(port) {
  const base = `http://127.0.0.1:${String(port)}`;
  try {
    const page = await fetch(`${base}/`, { signal: AbortSignal.timeout(3000) });
    if (!page.ok || !(page.headers.get("content-type") ?? "").includes("text/html")) return "no_game";
    // Only a Vite dev server has this file. Vite answers a tunnel's host name with "Blocked request", so a guest would get an error page.
    const devClient = await fetch(`${base}/@vite/client`, { signal: AbortSignal.timeout(3000) });
    if (devClient.ok) return "vite";
    // A request marked the way cloudflared marks one must be refused on a route that spends a key (server/lib/localOnly.ts).
    // A server started before that guard existed lets it in. A GET spends nothing even there: the route only takes POST.
    const marked = await fetch(`${base}/api/level`, { headers: { "Cf-Ray": "tunnel-check" }, signal: AbortSignal.timeout(3000) });
    return marked.status === 403 ? "game" : "unguarded";
  } catch {
    return "down";
  }
}

/** @param {number} port @returns {Promise<string | null>} the address the server hands to phones, when it has the route that says */
async function serverBase(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${String(port)}/api/rooms/address`, { signal: AbortSignal.timeout(3000) });
    const body = /** @type {{ base?: unknown } | null} */ (response.ok ? await response.json() : null);
    return typeof body?.base === "string" ? body.base : null;
  } catch {
    return null;
  }
}

/**
 * Asks for a route that spends a key through the tunnel itself, as a stranger would.
 * "refused" is the guard's own 403. "answered" is the server's "no such route" for this GET: the request got past the guard.
 * Anything else (the tunnel is not reachable yet, a Cloudflare error page) says nothing either way.
 * @param {string} origin @param {AbortSignal} quit @returns {Promise<"refused" | "answered" | "unknown">}
 */
async function guardThrough(origin, quit) {
  try {
    const response = await fetch(`${origin}/api/level`, { signal: AbortSignal.any([quit, AbortSignal.timeout(5000)]) });
    const body = /** @type {{ error?: unknown } | null} */ (await response.json());
    if (response.status === 403 && body?.error === "local_only") return "refused";
    return response.status === 404 && body?.error === "not_found" ? "answered" : "unknown";
  } catch {
    return "unknown";
  }
}

/** @param {string} line one line for the person at the laptop; the tunnel did not start */
function giveUp(line) {
  console.error(line);
  process.exitCode = 1;
}

async function main() {
  const asked = process.argv[2] ?? process.env.AI_SERVER_PORT ?? "8787";
  const port = /^\d{1,5}$/.test(asked) ? Number(asked) : 0;
  if (port < 1 || port > 65535) return giveUp(`"${asked}" is not a port. Usage: node scripts/tunnel.mjs [port]`);

  const cloudflared = onPath("cloudflared");
  if (cloudflared === null) return giveUp(`cloudflared is not installed, so there is no tunnel. ${FALLBACK} To get it: ${INSTALL_PAGE}`);

  const other = otherTunnel();
  if (other !== null) return giveUp(`A tunnel is already up at ${other.url} (process ${String(other.pid)}). Stop that one first.`);

  const game = await probe(port);
  if (game === "down") return giveUp(`Nothing answers on http://127.0.0.1:${String(port)}. Start the game first (npm start), then run this again.`);
  if (game === "no_game") return giveUp(`The server on port ${String(port)} is up but does not serve the game. Run npm run build, restart the server, then run this again.`);
  if (game === "vite") return giveUp(`Port ${String(port)} is the Vite dev server. Point the tunnel at the game server (port 8787 unless you changed it).`);
  if (game === "unguarded") return giveUp(`The server on port ${String(port)} does not refuse the AI routes to a request from a tunnel, so no tunnel was opened. It runs old code: restart it, then run this again.`);

  // Exactly the command on Cloudflare's quick tunnel page. 127.0.0.1 rather than localhost: that is the address just probed.
  const child = spawn(cloudflared, ["tunnel", "--url", `http://127.0.0.1:${String(port)}`], { stdio: ["ignore", "pipe", "pipe"] });
  let url = /** @type {string | null} */ (null);
  let lastLine = "";
  let stopping = false;
  let closed = false;
  const quit = new AbortController();
  /** @type {NodeJS.Timeout | undefined} */
  let beat;

  /** @param {NodeJS.Signals} signal */
  const stop = (signal) => {
    stopping = true;
    // The address is taken back first: the server must not hand it out while cloudflared takes its time to stop.
    clearInterval(beat);
    forget();
    child.kill(signal);
    // A cloudflared that does not stop when asked is killed.
    setTimeout(() => child.kill("SIGKILL"), killMs).unref();
  };
  const waiting = setTimeout(() => {
    giveUp(`cloudflared gave no address in ${String(Math.round(waitMs / 1000))} seconds. Is there internet? ${FALLBACK}`);
    stop("SIGTERM");
  }, waitMs);

  const up = async (/** @type {string} */ found) => {
    url = found;
    clearTimeout(waiting);
    save(found);
    beat = setInterval(() => {
      try {
        save(found);
      } catch {
        // The next beat tries again. If it never works the file goes stale and the server falls back to the LAN address.
      }
    }, beatMs);
    console.log(`Tunnel is up: ${found}`);
    const base = await serverBase(port);
    if (closed) return;
    if (base === found) console.log("The server hands out this address: the room QR code uses it now. It can take a few seconds before it answers.");
    else if (base === null) console.log("The server reads this address on its next request. It can take a few seconds before it answers.");
    else console.log(`Warning: the server still hands out ${base}. Start it from this folder, without PUBLIC_BASE_URL or PUBLIC_URL, to use the tunnel.`);
    console.log("Anyone who has the address can join a room and open the replay pages. Press Ctrl+C here when the demo is over.");

    // The guard relies on cloudflared marking what it passes on. This looks from outside whether it does.
    for (let tries = 0; tries < CHECK_TRIES; tries += 1) {
      // Not kept alive by this timer: when cloudflared has gone the process ends.
      await new Promise((resolve) => setTimeout(resolve, checkMs).unref());
      if (closed || stopping) return;
      const guard = await guardThrough(checkOrigin ?? found, quit.signal);
      if (closed || stopping) return;
      if (guard === "refused") {
        console.log("Checked through the tunnel: the routes that spend the API keys are refused there.");
        return;
      }
      if (guard === "answered") {
        giveUp("The routes that spend the API keys are NOT refused through this tunnel, so it is being closed. See docs/rooms-tunnel.md.");
        stop("SIGTERM");
        return;
      }
    }
    console.log(`The game did not answer through the tunnel yet, so the guard was not checked there. Open ${found}/api/level on a phone: it must show {"error":"local_only"}.`);
  };

  for (const stream of [child.stdout, child.stderr]) {
    // Every line is read for as long as cloudflared runs, so its pipes never fill up.
    createInterface({ input: stream }).on("line", (line) => {
      if (line.trim() !== "") lastLine = line.trim().slice(0, 200);
      const found = url === null && !stopping ? addressIn(line) : null;
      if (found === null) return;
      up(found).catch((/** @type {unknown} */ error) => {
        giveUp(`The tunnel is up but ${file} could not be written (${error instanceof Error ? error.message : String(error)}). Closing it. ${FALLBACK}`);
        stop("SIGTERM");
      });
    });
  }

  for (const signal of /** @type {const} */ (["SIGINT", "SIGTERM", "SIGHUP"])) {
    process.on(signal, () => {
      if (stopping) return;
      console.log("Stopping the tunnel.");
      stop("SIGTERM");
    });
  }
  // Whatever ends this process, the file and cloudflared go with it.
  process.on("exit", () => {
    forget();
    child.kill();
  });

  child.on("error", (error) => {
    clearTimeout(waiting);
    // Said here, so "close" stays quiet.
    stopping = true;
    giveUp(`cloudflared could not be started (${error.message}). ${FALLBACK}`);
  });
  // "close" comes after the last line of output has been read. Nothing is left running after it, so the process ends by itself.
  child.on("close", (code, signal) => {
    closed = true;
    quit.abort();
    clearTimeout(waiting);
    clearInterval(beat);
    forget();
    const how = code === null ? `signal ${String(signal)}` : `exit code ${String(code)}`;
    if (stopping && url !== null) console.log("The tunnel is closed. The game is back on the LAN address and touch buttons.");
    else if (!stopping && url !== null) giveUp(`cloudflared stopped (${how}), so the tunnel is closed. The game is back on the LAN address and touch buttons.`);
    else if (!stopping) giveUp(`cloudflared stopped before it gave an address (${how}). Is there internet? ${FALLBACK} Its last line: ${lastLine}`);
  });
}

await main();
