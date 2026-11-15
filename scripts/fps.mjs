// Frame rate check: builds the game, serves it with `vite preview`, opens every stop in headless Chrome
// and samples requestAnimationFrame in the fight at each quality level. Prints a table and writes docs/perf.md.
//
//   node scripts/fps.mjs [--no-build] [--no-headroom] [--seconds=10] [--stops=polyphemus,scylla] [--no-write]
//
// Two passes: one as a player sees it (headless Chrome caps at 60 fps), one with the cap off to show the headroom.
//
// Environment:
//   FPS_CHANNEL     browser channel for Playwright (default "chrome"; "msedge" also works, "" uses Playwright's own Chromium)
//   FPS_GL          ANGLE backend (default d3d11 on Windows, metal on macOS; "swiftshader" forces software GL)
//   FPS_PLAYWRIGHT  folder of a playwright or playwright-core install, used when the repo has neither
//   FPS_MACHINE     a name for the machine, printed in docs/perf.md
import { spawn } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VITE = join(ROOT, "node_modules", "vite", "bin", "vite.js");
const OUT = join(ROOT, "docs", "perf.md");
const VIEWPORT = { width: 1280, height: 720 };
const WARMUP_MS = 3000;
const SETTLE_MS = 1500;
const DRAW_COUNT_MS = 1000;
const SOFTWARE = /swiftshader|llvmpipe|software|basic render/i;
const LOCKED = "not playable on this build: the stop has no 3D model yet, so the map keeps it locked";
const TARGET_FPS = 50;
/** Every defense is held while sampling so no attack lands and the fight outlasts the sample. */
const DEFENSE_KEYS = [" ", "ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp"];
/** Must match `Quality` in src/render/quality.ts; the first is what every fight starts on. */
const QUALITIES = ["high", "low"];

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const say = (line) => process.stdout.write(`${line}\n`);

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
    .sort((a, b) => a.order - b.order);
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

function glArgs(uncapped) {
  const backend = process.env.FPS_GL ?? { win32: "d3d11", darwin: "metal" }[process.platform] ?? "";
  const list = ["--use-gl=angle", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"];
  if (backend) list.push(`--use-angle=${backend}`);
  if (uncapped) list.push("--disable-frame-rate-limit", "--disable-gpu-vsync");
  return list;
}

/** Runs in the page: the WebGL renderer string, which names the GPU or the software rasteriser. */
function readRenderer() {
  const gl = document.createElement("canvas").getContext("webgl2");
  const info = gl?.getExtension("WEBGL_debug_renderer_info");
  return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "unknown";
}

/** Runs in the page: times every animation frame for `ms`. */
function sampleFrames(ms) {
  return new Promise((done) => {
    const deltas = [];
    let start = 0;
    let last = 0;
    const frame = (now) => {
      if (start === 0) start = now;
      else deltas.push(now - last);
      last = now;
      if (now - start < ms) { requestAnimationFrame(frame); return; }
      deltas.sort((a, b) => a - b);
      const at = (share) => deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * share))] ?? null;
      done({ frames: deltas.length, fps: (deltas.length * 1000) / (last - start), slow1: at(0.99), worst: at(1) });
    };
    requestAnimationFrame(frame);
  });
}

/**
 * Runs in the page: counts draw calls and triangles per frame for `ms`. The game exposes no renderer under ?debug,
 * so this wraps the draw functions of the canvas's own WebGL context, which counts every pass (shadows, scene, effects).
 * It runs after the frame timing, never during it, and takes the wrappers off again.
 */
function countDraws(ms) {
  const gl = document.querySelector(".fight canvas")?.getContext("webgl2");
  if (!gl) return Promise.resolve({ calls: null, triangles: null });
  let calls = 0;
  let triangles = 0;
  const tally = (mode, count, instances) => {
    calls += 1;
    if (mode === gl.TRIANGLES) triangles += (count / 3) * instances;
    else if (mode === gl.TRIANGLE_STRIP || mode === gl.TRIANGLE_FAN) triangles += Math.max(0, count - 2) * instances;
  };
  const proto = Object.getPrototypeOf(gl);
  gl.drawArrays = function (mode, first, count) { tally(mode, count, 1); proto.drawArrays.call(this, mode, first, count); };
  gl.drawElements = function (mode, count, type, offset) { tally(mode, count, 1); proto.drawElements.call(this, mode, count, type, offset); };
  gl.drawArraysInstanced = function (mode, first, count, n) { tally(mode, count, n); proto.drawArraysInstanced.call(this, mode, first, count, n); };
  gl.drawElementsInstanced = function (mode, count, type, offset, n) { tally(mode, count, n); proto.drawElementsInstanced.call(this, mode, count, type, offset, n); };
  return new Promise((done) => {
    const perFrame = [];
    let start = 0;
    const frame = (now) => {
      if (start === 0) start = now;
      else perFrame.push([calls, triangles]);
      calls = 0;
      triangles = 0;
      if (now - start < ms) { requestAnimationFrame(frame); return; }
      for (const name of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"]) Reflect.deleteProperty(gl, name);
      const median = (index) => perFrame.map((pair) => pair[index]).sort((a, b) => a - b)[Math.floor(perFrame.length / 2)] ?? null;
      done({ calls: median(0), triangles: median(1) });
    };
    requestAnimationFrame(frame);
  });
}

/**
 * Title -> Keyboard only -> first style -> the open stop -> intro button -> fight. Returns the style picked,
 * or null when the map does not offer this stop (a stop with no 3D model stays locked, see `playable` in flow.ts).
 */
async function enterFight(page, base, stop) {
  await page.goto(`${base}/?stop=${stop.id}&debug`);
  await page.getByRole("button", { name: "Keyboard only" }).click();
  await page.getByRole("heading", { name: "Choose your fighting style" }).waitFor();
  const styleButton = page.locator("main.menu button").first();
  const style = (await styleButton.innerText()).split("\n")[0].trim();
  await styleButton.click();
  await page.getByRole("heading", { name: "The Road Home" }).waitFor();
  const open = page.locator("button.stop.open");
  if ((await open.count()) === 0) return null;
  await open.first().click();
  const heading = (await page.locator("main.menu h1").innerText()).trim();
  if (heading !== stop.name) return null;
  await page.getByRole("button", { name: `Face ${stop.name}` }).click();
  await page.locator(".fight canvas").waitFor();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(WARMUP_MS);
  return style;
}

async function holdDefenses(page) {
  for (const key of DEFENSE_KEYS) await page.keyboard.up(key);
  for (const key of DEFENSE_KEYS) await page.keyboard.down(key);
}

const qualityNow = async (page) => (await page.getByText(/^q: quality \w+$/).innerText()).replace("q: quality ", "");
const fightOver = async (page) => (await page.locator(".fight .overlay button").count()) > 0;

/** The choice is a saved setting, so the label is read first and `q` pressed only until it matches. */
async function setQuality(page, wanted) {
  for (let presses = 0; (await qualityNow(page)) !== wanted; presses += 1) {
    if (presses >= QUALITIES.length) throw new Error(`the q key never reached quality "${wanted}"`);
    await page.keyboard.press("q");
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(SETTLE_MS);
}

/** One row of the table. If the fight ends inside the sample, goes back in and samples again, twice at most. */
async function measure(page, base, stop, quality, seconds) {
  let result = null;
  let ended = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await fightOver(page)) await enterFight(page, base, stop);
    await holdDefenses(page);
    await setQuality(page, quality);
    result = await page.evaluate(sampleFrames, seconds * 1000);
    ended = await fightOver(page);
    if (!ended) {
      result = { ...result, ...(await page.evaluate(countDraws, DRAW_COUNT_MS)) };
      break;
    }
  }
  return { stop: stop.id, quality, ...result, note: ended ? "fight ended during the sample" : "" };
}

/** One browser, every stop, every quality level. The browser is closed whatever happens. */
async function runPass(chromium, base, stops, seconds, uncapped) {
  const flags = glArgs(uncapped);
  const channel = process.env.FPS_CHANNEL ?? "chrome";
  const browser = await chromium.launch({ headless: true, args: flags, ...(channel ? { channel } : {}) });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    await page.goto(base);
    const renderer = await page.evaluate(readRenderer);
    say(`\n${uncapped ? "Frame cap off" : "Frame cap on"}. WebGL renderer: ${renderer}`);
    const rows = [];
    let style = "";
    for (const stop of stops) {
      const picked = await enterFight(page, base, stop);
      if (picked === null) {
        rows.push({ stop: stop.id, quality: "-", note: LOCKED });
        say(`${stop.id}: ${LOCKED}`);
        continue;
      }
      style = picked;
      for (const quality of QUALITIES) {
        const row = await measure(page, base, stop, quality, seconds);
        rows.push(row);
        say(`${row.stop} ${row.quality}: ${one(row.fps)} fps, slowest 1% ${one(row.slow1)} ms${row.note ? ` (${row.note})` : ""}`);
      }
      for (const key of DEFENSE_KEYS) await page.keyboard.up(key);
    }
    return { rows, renderer, flags, style, browser: `${channel || "chromium"} ${browser.version()}` };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

const has = (value) => value !== null && value !== undefined;
const one = (value) => (has(value) ? value.toFixed(1) : "n/a");
const whole = (value) => (has(value) ? String(Math.round(value)) : "n/a");

function table(rows) {
  const lines = [
    "| stop | quality | mean fps | slowest 1% frame (ms) | worst frame (ms) | draw calls | triangles | note |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ...rows.map((row) => `| ${row.stop} | ${row.quality} | ${one(row.fps)} | ${one(row.slow1)} | ${one(row.worst)} | ${whole(row.calls)} | ${whole(row.triangles)} | ${row.note} |`),
  ];
  return lines.join("\n");
}

function report(capped, headroom, run) {
  const software = SOFTWARE.test(capped.renderer);
  const measured = capped.rows.filter((row) => has(row.fps));
  const slow = measured.filter((row) => row.quality === QUALITIES[0] && row.fps < TARGET_FPS);
  const locked = capped.rows.filter((row) => !has(row.fps)).map((row) => row.stop);
  const verdict = slow.length === 0
    ? `No measured stop is under ${String(TARGET_FPS)} fps at the default quality (${QUALITIES[0]}).`
    : `Under ${String(TARGET_FPS)} fps at the default quality (${QUALITIES[0]}): ${slow.map((row) => `**${row.stop}** (${one(row.fps)} fps)`).join(", ")}.`;
  const unmeasured = locked.length === 0 ? "" : `\n\nNot measured: ${locked.join(", ")}. ${LOCKED[0].toUpperCase()}${LOCKED.slice(1)}. Run this again when their models land.`;
  const headroomPart = headroom
    ? `\n\n## Headroom: the same run with the frame cap off\n\nStarted with \`${headroom.flags.join(" ")}\`. Here mean fps is how fast the scene could be drawn, not what a player sees.\n\n${table(headroom.rows)}`
    : "";
  return `# Frame rate

Written by \`node scripts/fps.mjs\` (\`make fps\`). Do not edit by hand: run it again.

- **When:** ${run.when}
- **Machine:** ${run.machine}
- **WebGL renderer:** \`${capped.renderer}\`
- **GL:** ${software ? "**software GL**: every number here is software-rendered and says little about a real GPU" : "hardware GL, on the GPU named above"}
- **Browser:** ${capped.browser}, headless, started with \`${capped.flags.join(" ")}\`
- **Canvas:** ${String(VIEWPORT.width)}x${String(VIEWPORT.height)}, device pixel ratio 1, keyboard only (no camera, no pose tracking), style ${capped.style || "n/a"}

${verdict}${unmeasured}

## As a player sees it: frame cap on

Headless Chrome draws at most 60 frames a second, so 60 means "at the cap".

${table(capped.rows)}${headroomPart}

## How to read it

- Each row is ${String(run.seconds)} s of \`requestAnimationFrame\` in the fight, after ${String(WARMUP_MS / 1000)} s of warm-up, with every defense key held so no attack lands and the fight does not end.
- **mean fps** is frames drawn over time elapsed. **slowest 1% frame** is the frame time that 99% of frames beat. **worst frame** is the single longest.
- **draw calls** and **triangles** are the median per frame over ${String(DRAW_COUNT_MS / 1000)} s after the timing, summed over every pass (shadow map, scene, each post-processing pass). The game exposes no renderer under \`/?debug\`, so the script counts the draw calls on the canvas's WebGL context.
- The quality level is switched with the \`q\` key and checked against the \`q: quality\` label shown under \`/?debug\`.
- Pose tracking was off. With the webcam on, MediaPipe shares the GPU and the CPU, so expect less.

## Run it

\`\`\`
node scripts/fps.mjs            # or: make fps
node scripts/fps.mjs --no-build --no-headroom --stops=polyphemus --seconds=5 --no-write
\`\`\`

It needs Chrome and Playwright. Playwright is not a dependency of this repo: if \`node_modules\` has none, set \`FPS_PLAYWRIGHT\` to the folder of an install elsewhere (\`.../node_modules/playwright-core\`). \`FPS_GL=swiftshader\` forces software GL, \`FPS_CHANNEL=msedge\` uses Edge, \`FPS_MACHINE\` names the machine.
`;
}

async function main() {
  const seconds = Number(option("seconds", "10"));
  const wanted = option("stops", "");
  const stops = readStops().filter((stop) => !wanted || wanted.split(",").includes(stop.id));
  if (stops.length === 0) throw new Error("no stops to measure");
  const chromium = loadChromium();
  let server = null;
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
    const capped = await runPass(chromium, base, stops, seconds, false);
    const headroom = flag("no-headroom") ? null : await runPass(chromium, base, stops, seconds, true);
    const cpu = os.cpus()[0]?.model.trim() ?? "unknown CPU";
    const text = report(capped, headroom, {
      when: new Date().toISOString().slice(0, 10),
      machine: `${process.env.FPS_MACHINE ? `${process.env.FPS_MACHINE}, ` : ""}${cpu}, ${String(Math.round(os.totalmem() / 2 ** 30))} GB, ${os.type()} ${os.release()}`,
      seconds,
    });
    say(`\nFrame cap on${SOFTWARE.test(capped.renderer) ? " (software GL)" : ""}:\n${table(capped.rows)}`);
    if (headroom) say(`\nFrame cap off:\n${table(headroom.rows)}`);
    if (!flag("no-write")) {
      writeFileSync(OUT, text);
      say(`\nWrote ${OUT}`);
    }
  } finally {
    stopServer();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
