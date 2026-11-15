// Smoke run: builds the game, serves it with `vite preview`, and plays every stop from start to end by keyboard
// in headless Chrome. Prints one line per stop (result, seconds, console errors) and writes docs/smoke.md.
//
//   node scripts/smoke.mjs [--no-build] [--stops=polyphemus,scylla] [--cap=240] [--no-write]
//
// Exits non-zero when any stop has a page error, a console error, a request that failed or answered 4xx/5xx
// (a 404 fails the run), a page that stopped answering, or a fight that did not end inside the cap.
// A lost fight does not fail the run, and neither does a stop the map keeps locked ("not playable").
//
// Finding Playwright, the build, the preview server on a free port and the way into a stop are the same as in
// scripts/fps.mjs. That file exports nothing and runs on import, so those small parts are copied here.
//
// Environment (the same names as scripts/fps.mjs):
//   FPS_CHANNEL     browser channel for Playwright (default "chrome"; "msedge" also works, "" uses Playwright's own Chromium)
//   FPS_GL          ANGLE backend (default d3d11 on Windows, metal on macOS; "swiftshader" forces software GL)
//   FPS_PLAYWRIGHT  folder of a playwright or playwright-core install, used when the repo has neither
//   FPS_MACHINE     a name for the machine, printed in docs/smoke.md
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VITE = join(ROOT, "node_modules", "vite", "bin", "vite.js");
const OUT = join(ROOT, "docs", "smoke.md");
const VIEWPORT = { width: 1280, height: 720 };
const POLL_MS = 50;
/** A strike key is pressed again this often while its prompt is still up. */
const STRIKE_EVERY_MS = 150;
/** The page must answer one poll within this, or it counts as hung. */
const POLL_TIMEOUT_MS = 10_000;
/** Time after the result overlay for late errors to show up. */
const AFTER_MS = 1000;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const say = (line) => process.stdout.write(`${line}\n`);

/** The moves' keys by prompt word, read from the move definitions: the fallback when the prompt shows no key. */
function readMoveKeys() {
  const dir = join(ROOT, "src", "moves", "defs");
  const keys = {};
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".ts"))) {
    const source = readFileSync(join(dir, file), "utf8");
    const prompt = /^ {2}prompt: "([^"]+)"/m.exec(source)?.[1];
    const key = /^ {2}key: "([^"]+)"/m.exec(source)?.[1];
    if (prompt && key) keys[prompt] = key;
  }
  return keys;
}

/** The stops in ladder order, read from the enemy definitions (the same files the game's registry globs). */
function readStops() {
  const dir = join(ROOT, "src", "enemies", "defs");
  return readdirSync(dir)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => {
      const source = readFileSync(join(dir, file), "utf8");
      const field = (pattern) => pattern.exec(source)?.[1];
      return { id: field(/^ {2}id: "([^"]+)"/m), name: field(/^ {2}name: "([^"]+)"/m), order: Number(field(/^ {2}order: ([\d.]+)/m)) };
    })
    .filter((stop) => stop.id && stop.name)
    .sort((a, b) => a.order - b.order)
    .map((stop, index) => ({ ...stop, index }));
}

function loadChromium() {
  const require = createRequire(join(ROOT, "package.json"));
  const places = ["playwright", "playwright-core", process.env.FPS_PLAYWRIGHT && resolve(process.env.FPS_PLAYWRIGHT)].filter(Boolean);
  for (const place of places) {
    try {
      return require(place).chromium;
    } catch {
      // try the next place
    }
  }
  throw new Error("Playwright not found. Install it outside the repo and point FPS_PLAYWRIGHT at its folder (…/node_modules/playwright-core).");
}

function freePort() {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.on("error", fail);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => { done(port); });
    });
  });
}

/** Runs vite with node directly (no shell), so killing the child leaves nothing behind. */
function vite(viteArgs, stdio) {
  return spawn(process.execPath, [VITE, ...viteArgs], { cwd: ROOT, stdio });
}

function build() {
  return new Promise((done, fail) => {
    const child = vite(["build"], ["ignore", "ignore", "inherit"]);
    child.on("error", fail);
    child.on("exit", (code) => { if (code === 0) done(); else fail(new Error(`vite build failed with code ${String(code)}`)); });
  });
}

async function waitForServer(url, server) {
  for (let i = 0; i < 100; i += 1) {
    if (server.exitCode !== null) throw new Error("vite preview stopped before it answered");
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((next) => setTimeout(next, 200));
  }
  throw new Error(`vite preview did not answer at ${url}`);
}

function glArgs() {
  const backend = process.env.FPS_GL ?? { win32: "d3d11", darwin: "metal" }[process.platform] ?? "";
  const list = ["--use-gl=angle", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"];
  if (backend) list.push(`--use-angle=${backend}`);
  return list;
}

/** Runs in the page: the WebGL renderer string, which names the GPU or the software rasteriser. */
function readRenderer() {
  const gl = document.createElement("canvas").getContext("webgl2");
  const info = gl?.getExtension("WEBGL_debug_renderer_info");
  return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "unknown";
}

/**
 * Title -> Keyboard only -> first style -> this stop on the map -> intro button -> fight. Returns the style picked,
 * or null when the map keeps this stop locked (a stop with no 3D model stays locked, see `playable` in flow.ts).
 */
async function enterFight(page, base, stop) {
  await page.goto(`${base}/?stop=${stop.id}`);
  await page.getByRole("button", { name: "Keyboard only" }).click();
  await page.getByRole("heading", { name: "Choose your fighting style" }).waitFor();
  const styleButton = page.locator("main.menu button").first();
  const style = await styleButton.evaluate((element) => element.firstChild?.textContent?.trim() ?? "");
  await styleButton.click();
  await page.getByRole("heading", { name: "The Road Home" }).waitFor();
  // The map draws one button per enemy in ladder order; only the one for this stop will do.
  const button = page.locator("button.stop").nth(stop.index);
  if (!(await button.evaluate((element) => element.classList.contains("open")))) return null;
  await button.click();
  // textContent, not innerText: the menu's CSS shows headings in upper case.
  const heading = ((await page.locator("main.menu h1").textContent()) ?? "").trim();
  if (heading !== stop.name) throw new Error(`the map opened "${heading}" instead of "${stop.name}"`);
  await page.getByRole("button", { name: `Face ${stop.name}` }).click();
  await page.locator(".fight canvas").waitFor();
  return style;
}

/**
 * Runs in the page: what the HUD shows right now. `over` is the result overlay (the only overlay with buttons that
 * is not the pause menu); the prompt card gives the kind of move, its word and, with key hints on, its key.
 */
function readHud() {
  const overlay = document.querySelector(".fight .overlay");
  if (overlay?.querySelector("button")) {
    const buttons = [...overlay.querySelectorAll("button")].map((button) => button.textContent?.trim() ?? "");
    return { over: true, won: !buttons.includes("Fight again"), title: overlay.querySelector("h1")?.textContent?.trim() ?? "", canvas: Boolean(document.querySelector(".fight canvas")) };
  }
  const prompt = document.querySelector(".fight .prompt");
  if (!prompt) return { over: false, kind: null };
  return {
    over: false,
    kind: prompt.classList.contains("defend") ? "defend" : "strike",
    word: prompt.querySelector(".prompt-word")?.textContent?.trim() ?? "",
    label: prompt.querySelector("kbd")?.textContent?.trim() ?? "",
  };
}

/** The reverse of `keyLabel` in src/hud/Hud.tsx: "Space" is the space bar, a letter is shown in upper case. */
function keyFor(hud, moveKeys) {
  if (hud.label === "Space") return " ";
  if (hud.label.length === 1) return hud.label.toLowerCase();
  return hud.label || moveKeys[hud.word] || null;
}

function withTimeout(promise, ms, what) {
  let timer;
  const late = new Promise((_, fail) => { timer = setTimeout(() => { fail(new Error(what)); }, ms); });
  return Promise.race([promise, late]).finally(() => { clearTimeout(timer); });
}

/**
 * Plays the fight on screen: every POLL_MS it reads the prompt card, holds the defend key it asks for (a defense
 * counts only if it is still held when the attack lands) or presses the strike key. Ends on the result overlay,
 * on the cap, or when the page stops answering.
 */
async function play(page, moveKeys, capMs) {
  const started = Date.now();
  let held = null;
  let lastStrike = 0;
  const unknown = new Set();
  const release = async () => {
    if (held !== null) await page.keyboard.up(held);
    held = null;
  };
  try {
    for (;;) {
      const elapsed = Date.now() - started;
      if (elapsed >= capMs) return { result: "never ended", ms: elapsed, unknown };
      let hud;
      try {
        hud = await withTimeout(page.evaluate(readHud), POLL_TIMEOUT_MS, "poll timed out");
      } catch (error) {
        return { result: "hung", ms: Date.now() - started, unknown, detail: error instanceof Error ? error.message.split("\n")[0] : String(error) };
      }
      if (hud.over) return { result: hud.won ? "won" : "lost", ms: Date.now() - started, unknown, title: hud.title, canvas: hud.canvas };
      const key = hud.kind ? keyFor(hud, moveKeys) : null;
      if (hud.kind && !key) unknown.add(hud.word);
      if (hud.kind === "defend" && key) {
        if (held !== key) {
          await release();
          await page.keyboard.down(key);
          held = key;
        }
      } else {
        await release();
        if (key && Date.now() - lastStrike >= STRIKE_EVERY_MS) {
          await page.keyboard.press(key);
          lastStrike = Date.now();
        }
      }
      await new Promise((next) => setTimeout(next, POLL_MS));
    }
  } finally {
    await withTimeout(release(), POLL_TIMEOUT_MS, "key release timed out").catch(() => undefined);
  }
}

/** Collects everything that should not happen on a page: thrown errors, console errors, failed and 4xx/5xx requests. */
function watch(page, base) {
  const seen = { pageErrors: [], consoleErrors: [], badRequests: [] };
  const short = (url) => (url.startsWith(base) ? url.slice(base.length) : url);
  page.on("pageerror", (error) => { seen.pageErrors.push(error instanceof Error ? error.message : String(error)); });
  page.on("console", (message) => { if (message.type() === "error") seen.consoleErrors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) seen.badRequests.push(`${String(response.status())} ${short(response.url())}`); });
  page.on("requestfailed", (request) => {
    const why = request.failure()?.errorText ?? "failed";
    // The browser cancelling its own request (a media preload, a page being left) is not a fault of the game.
    if (why !== "net::ERR_ABORTED") seen.badRequests.push(`${why} ${short(request.url())}`);
  });
  return seen;
}

/** One stop in its own browser context, so saved settings and errors never leak from one stop into the next. */
async function runStop(browser, base, stop, moveKeys, capMs) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    const seen = watch(page, base);
    const row = { stop: stop.id, result: "", seconds: null, style: "", note: "", ...seen };
    try {
      const style = await enterFight(page, base, stop);
      if (style === null) {
        row.result = "not playable";
        row.note = "the map keeps this stop locked on this build (no 3D model yet)";
        return row;
      }
      row.style = style;
      const played = await play(page, moveKeys, capMs);
      row.result = played.result;
      row.seconds = played.ms / 1000;
      const notes = [];
      if (played.title) notes.push(`"${played.title}"`);
      if (played.detail) notes.push(played.detail);
      if (played.canvas === false) notes.push("the 3D canvas was gone at the end");
      if (played.unknown.size > 0) notes.push(`no key known for: ${[...played.unknown].join(", ")}`);
      row.note = notes.join("; ");
      if (played.result === "won" || played.result === "lost") await page.waitForTimeout(AFTER_MS);
    } catch (error) {
      row.result = "crashed";
      row.note = (error instanceof Error ? error.message : String(error)).split("\n")[0];
    }
    return row;
  } finally {
    await context.close().catch(() => undefined);
  }
}

const failed = (row) =>
  row.result === "never ended" || row.result === "hung" || row.result === "crashed" ||
  row.pageErrors.length > 0 || row.consoleErrors.length > 0 || row.badRequests.length > 0;

const seconds = (row) => (row.seconds === null ? "-" : row.seconds.toFixed(1));

function line(row) {
  const counts = `console errors ${String(row.consoleErrors.length)}, page errors ${String(row.pageErrors.length)}, failed requests ${String(row.badRequests.length)}`;
  const time = row.seconds === null ? "" : ` in ${seconds(row)} s`;
  return `${row.stop}: ${row.result}${time}, ${counts}${row.note ? ` (${row.note})` : ""}${failed(row) ? "  FAIL" : ""}`;
}

const cell = (text) => text.replaceAll("|", "\\|").replaceAll("\n", " ");

function table(rows) {
  return [
    "| stop | result | seconds | console errors | page errors | failed requests | note |",
    "| --- | --- | ---: | ---: | ---: | ---: | --- |",
    ...rows.map((row) => `| ${row.stop} | ${failed(row) ? `**${row.result}**` : row.result} | ${seconds(row)} | ${String(row.consoleErrors.length)} | ${String(row.pageErrors.length)} | ${String(row.badRequests.length)} | ${cell(row.note)} |`),
  ].join("\n");
}

/** Every error text, grouped by stop, with repeats counted once. */
function details(rows) {
  const parts = [];
  for (const row of rows) {
    const groups = [["page error", row.pageErrors], ["console error", row.consoleErrors], ["failed request", row.badRequests]];
    for (const [kind, list] of groups) {
      const counted = new Map();
      for (const text of list) counted.set(text, (counted.get(text) ?? 0) + 1);
      for (const [text, times] of counted) parts.push(`- **${row.stop}**, ${kind}${times > 1 ? ` (x${String(times)})` : ""}: \`${text.replaceAll("`", "'").replaceAll("\n", " ").slice(0, 400)}\``);
    }
  }
  return parts;
}

function report(rows, run) {
  const bad = rows.filter(failed);
  const locked = rows.filter((row) => row.result === "not playable").map((row) => row.stop);
  const lost = rows.filter((row) => row.result === "lost").map((row) => row.stop);
  const verdict = bad.length === 0
    ? "**Pass.** No stop crashed, hung or logged an error."
    : `**Fail:** ${bad.map((row) => `**${row.stop}** (${row.result})`).join(", ")}.`;
  const notPlayed = locked.length === 0 ? "" : `\n\nNot played: ${locked.join(", ")}. The map keeps a stop locked until its 3D model exists, so there is no fight to open; this does not fail the run. Run this again when the models land.`;
  const lostPart = lost.length === 0 ? "" : `\n\nLost: ${lost.join(", ")}. A lost fight still ended cleanly, so it does not fail the run.`;
  const errors = details(rows);
  const errorPart = errors.length === 0 ? "" : `\n\n## Errors seen\n\n${errors.join("\n")}`;
  return `# Smoke run

Written by \`node scripts/smoke.mjs\`. Do not edit by hand: run it again.

- **When:** ${run.when}
- **Commit:** ${run.commit}
- **Machine:** ${run.machine}
- **WebGL renderer:** \`${run.renderer}\`
- **Browser:** ${run.browser}, headless, started with \`${run.flags.join(" ")}\`
- **Play:** ${String(VIEWPORT.width)}x${String(VIEWPORT.height)}, keyboard only (no camera, no pose tracking), style ${run.style || "n/a"}, cap ${String(run.capSeconds)} s per fight

${verdict}${notPlayed}${lostPart}

${table(rows)}${errorPart}

## How to read it

- Each stop is opened at \`/?stop=<id>\` in a fresh browser context: Keyboard only, the first style, the open stop on the map, then the fight.
- The script plays for real. Every ${String(POLL_MS)} ms it reads the prompt card, holds the key of the defense it asks for until the prompt goes away, or presses the key of the strike or finisher. The key comes from the hint on the card, or from \`src/moves/defs\` when hints are off.
- **result** is \`won\` or \`lost\` (from the result overlay), \`not playable\` (the map does not offer the stop), \`never ended\` (no result inside the cap), \`hung\` (the page stopped answering) or \`crashed\` (a screen on the way in never came up).
- **seconds** is from the fight's canvas appearing to the result overlay.
- **console errors** are console messages of type error; **page errors** are uncaught exceptions; **failed requests** are requests that failed or answered 4xx or 5xx. Requests the browser cancels itself (\`net::ERR_ABORTED\`) are not counted.
- The run fails (exit code 1) on any console error, page error or failed request (a 404 counts), and on \`never ended\`, \`hung\` or \`crashed\`. \`lost\` and \`not playable\` do not fail it.
- Pose tracking was off, so this says nothing about the webcam path, and nobody listens to the audio.

## Run it

\`\`\`
node scripts/smoke.mjs
node scripts/smoke.mjs --no-build --stops=polyphemus --cap=120 --no-write
\`\`\`

It needs Chrome and Playwright. Playwright is not a dependency of this repo: if \`node_modules\` has none, set \`FPS_PLAYWRIGHT\` to a playwright-core folder (\`.../node_modules/playwright-core\`). \`FPS_GL=swiftshader\` forces software GL, \`FPS_CHANNEL=msedge\` uses Edge, \`FPS_MACHINE\` names the machine. These are the same variables \`scripts/fps.mjs\` reads.
`;
}

function commit() {
  const git = (...gitArgs) => spawnSync("git", gitArgs, { cwd: ROOT, encoding: "utf8" }).stdout?.trim() ?? "";
  const hash = git("rev-parse", "--short", "HEAD");
  return hash ? `\`${hash}\` ${git("log", "-1", "--format=%s")}` : "unknown";
}

async function main() {
  const capSeconds = Number(option("cap", "240"));
  const wanted = option("stops", "");
  const stops = readStops().filter((stop) => !wanted || wanted.split(",").includes(stop.id));
  if (stops.length === 0) throw new Error("no stops to play");
  const moveKeys = readMoveKeys();
  const chromium = loadChromium();
  let server = null;
  let browser = null;
  const stopServer = () => { server?.kill(); };
  process.on("exit", stopServer);
  process.on("SIGINT", () => process.exit(130));
  process.on("SIGTERM", () => process.exit(143));
  try {
    if (!flag("no-build")) {
      say("Building...");
      await build();
    }
    const port = await freePort();
    const base = `http://127.0.0.1:${String(port)}`;
    server = vite(["preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], "ignore");
    await waitForServer(base, server);
    const flags = glArgs();
    const channel = process.env.FPS_CHANNEL ?? "chrome";
    browser = await chromium.launch({ headless: true, args: flags, ...(channel ? { channel } : {}) });
    const probe = await browser.newPage();
    await probe.goto(base);
    const renderer = await probe.evaluate(readRenderer);
    await probe.close();
    say(`WebGL renderer: ${renderer}`);
    const rows = [];
    for (const stop of stops) {
      const row = await runStop(browser, base, stop, moveKeys, capSeconds * 1000);
      rows.push(row);
      say(line(row));
    }
    const cpu = os.cpus()[0]?.model.trim() ?? "unknown CPU";
    const text = report(rows, {
      when: new Date().toISOString().slice(0, 10),
      commit: commit(),
      machine: `${process.env.FPS_MACHINE ? `${process.env.FPS_MACHINE}, ` : ""}${cpu}, ${String(Math.round(os.totalmem() / 2 ** 30))} GB, ${os.type()} ${os.release()}`,
      renderer,
      browser: `${channel || "chromium"} ${browser.version()}`,
      flags,
      style: rows.find((row) => row.style)?.style ?? "",
      capSeconds,
    });
    const errors = details(rows);
    if (errors.length > 0) say(`\nErrors seen:\n${errors.join("\n")}`);
    if (!flag("no-write")) {
      writeFileSync(OUT, text);
      say(`\nWrote ${OUT}`);
    }
    const bad = rows.filter(failed);
    if (bad.length > 0) {
      say(`\nFAIL: ${bad.map((row) => `${row.stop} (${row.result})`).join(", ")}`);
      process.exitCode = 1;
    } else {
      say("\nPASS");
    }
  } finally {
    await browser?.close().catch(() => undefined);
    stopServer();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
