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
/** A sample taken with more than this share of the machine's processor time in use is taken again. */
const BUSY_LIMIT = 0.65;
/** So is a sample taken while one core ran at less than this share of its full speed (a clamped processor). */
const SPEED_LIMIT = 0.4;
const MAX_SAMPLES = 5;
const REST_MS = 15_000;
const QUIET_WAIT_MS = 180_000;
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
 * Title -> Keyboard only -> first style -> this stop on the map -> intro button -> fight. Returns the style picked,
 * or null when the map keeps this stop locked (a stop with no 3D model stays locked, see `playable` in flow.ts).
 */
async function enterFight(page, base, stop) {
  await page.goto(`${base}/?stop=${stop.id}&debug`);
  await page.getByRole("button", { name: "Keyboard only" }).click();
  await page.getByRole("heading", { name: "Choose your fighting style" }).waitFor();
  const styleButton = page.locator("main.menu button").first();
  // textContent, not innerText: the CSS shows buttons and headings in upper case, and innerText returns what is shown.
  const style = await styleButton.evaluate((element) => element.firstChild?.textContent?.trim() ?? "");
  await styleButton.click();
  await page.getByRole("heading", { name: "The Road Home" }).waitFor();
  // The map draws one button per enemy in ladder order; only the one for this stop will do.
  const button = page.locator("button.stop").nth(stop.index);
  if (!(await button.evaluate((element) => element.classList.contains("open")))) return null;
  await button.click();
  const heading = ((await page.locator("main.menu h1").textContent()) ?? "").trim();
  if (heading !== stop.name) throw new Error(`the map opened "${heading}" instead of "${stop.name}"`);
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

/** Processor time of the whole machine so far, over every core. */
function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
  }
  return { idle, total };
}

/** The share of the whole machine's processor time that was in use since `before`, this browser included. */
function busySince(before) {
  const now = cpuTimes();
  const total = now.total - before.total;
  return total > 0 ? 1 - (now.idle - before.idle) / total : 0;
}

let fastestLoopMs = Infinity;

/**
 * How fast one core runs now, as a share of the fastest it has run during this script (1 = full speed). It times
 * a fixed loop. A laptop that has clamped its processor (heat, a power limit) shows up here as a low number even
 * when nothing else is running.
 */
function cpuSpeed() {
  let loopMs = Infinity;
  for (let round = 0; round < 3; round += 1) {
    const started = performance.now();
    let sum = 0;
    for (let i = 0; i < 2e7; i += 1) sum += Math.sqrt(i);
    if (sum > 0) loopMs = Math.min(loopMs, performance.now() - started);
  }
  fastestLoopMs = Math.min(fastestLoopMs, loopMs);
  return fastestLoopMs / loopMs;
}

const disturbed = (sample) => sample.busy > BUSY_LIMIT || sample.speed < SPEED_LIMIT;

/** Rests REST_MS, then waits until the machine is quiet and at speed for two seconds, or QUIET_WAIT_MS at most. */
async function waitForQuiet() {
  await new Promise((next) => setTimeout(next, REST_MS));
  for (const started = Date.now(); Date.now() - started < QUIET_WAIT_MS; ) {
    const before = cpuTimes();
    await new Promise((next) => setTimeout(next, 2000));
    if (!disturbed({ busy: busySince(before), speed: cpuSpeed() })) return;
  }
}

/**
 * One row of the table. A sample counts only if the fight was still on at its end: if the fight ends inside it,
 * the script goes back into the stop and samples the full time again.
 *
 * A sample is suspect when the machine was busy with other work (a build, another browser), when its processor
 * was running slow (clamped for heat or power), or when the frame rate came out under `floor`. Other work on the
 * GPU cannot be seen from here, so a low frame rate is the only sign of it. A suspect sample is taken again after
 * a rest with the game off the screen. The first sample that is not suspect is kept; if all are suspect, the
 * fastest is kept and the note lists them all, so a stop that really is slow still shows as slow.
 */
async function measure(page, base, stop, quality, seconds, floor, earlier = []) {
  const suspect = (sample) => disturbed(sample) || sample.fps < floor;
  const tries = [...earlier];
  let best = null;
  let reentries = 0;
  for (let attempt = 0; attempt < MAX_SAMPLES; attempt += 1) {
    if (await fightOver(page)) {
      await enterFight(page, base, stop);
      reentries += 1;
    }
    await holdDefenses(page);
    await setQuality(page, quality);
    const speedBefore = cpuSpeed();
    const before = cpuTimes();
    const frames = await page.evaluate(sampleFrames, seconds * 1000);
    const busy = busySince(before);
    const speed = Math.min(speedBefore, cpuSpeed());
    if (await fightOver(page)) continue;
    const sample = { ...frames, ...(await page.evaluate(countDraws, DRAW_COUNT_MS)), busy, speed };
    tries.push(sample.fps);
    if (best === null || (suspect(best) && !suspect(sample)) || (suspect(best) === suspect(sample) && sample.fps > best.fps)) best = sample;
    if (!suspect(sample)) break;
    say(`  ${stop.id} ${quality}: ${one(frames.fps)} fps with the machine ${percent(busy)}% busy and the processor at ${percent(speed)}% speed; resting, then sampling again`);
    if (attempt + 1 === MAX_SAMPLES) break;
    // The game is taken off the screen for the wait, so a hot or power-limited machine gets to recover.
    await page.goto("about:blank");
    await waitForQuiet();
    await enterFight(page, base, stop);
  }
  const notes = [];
  const list = `${tries.map(one).join(", ")} fps`;
  if (best === null) notes.push("fight ended during every sample");
  else if (reentries > 0) notes.push(`fight ended early, re-entered ${String(reentries)}x; the numbers are from a full sample of fight`);
  if (best !== null && suspect(best)) notes.push(`slow or disturbed in all ${String(tries.length)} samples (${list}); the fastest is shown`);
  else if (tries.length > 1) notes.push(`sampled ${String(tries.length)} times (${list}): the earlier ones were slow or taken with the machine busy`);
  return { stop: stop.id, quality, ...best, tries, suspect: best !== null && suspect(best), retakes: Math.max(0, tries.length - 1), note: notes.join("; ") };
}

/** One browser, every stop, every quality level. The browser is closed whatever happens. */
async function runPass(chromium, base, stops, seconds, uncapped, floorFor) {
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
        const row = await measure(page, base, stop, quality, seconds, floorFor(stop.id, quality));
        rows.push(row);
        say(`${row.stop} ${row.quality}: ${one(row.fps)} fps, slowest 1% ${one(row.slow1)} ms${row.note ? ` (${row.note})` : ""}`);
      }
      for (const key of DEFENSE_KEYS) await page.keyboard.up(key);
    }
    // A disturbance can outlast every sample of a row, so a row that is still suspect gets one more round here,
    // minutes later. A stop that really is slow stays slow and keeps its note.
    for (const [index, row] of rows.entries()) {
      if (!row.suspect) continue;
      say(`${row.stop} ${row.quality}: still suspect, measuring it again at the end of the pass`);
      const stop = stops.find((candidate) => candidate.id === row.stop);
      await enterFight(page, base, stop);
      const again = await measure(page, base, stop, row.quality, seconds, floorFor(row.stop, row.quality), row.tries);
      rows[index] = !again.suspect || again.fps > row.fps ? again : { ...row, tries: again.tries, retakes: again.retakes, note: again.note };
      say(`${row.stop} ${row.quality}: ${one(rows[index].fps)} fps, slowest 1% ${one(rows[index].slow1)} ms (${rows[index].note})`);
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
const percent = (share) => (has(share) ? String(Math.round(share * 100)) : "n/a");

function table(rows) {
  const lines = [
    "| stop | quality | mean fps | slowest 1% frame (ms) | worst frame (ms) | draw calls | triangles | machine busy (%) | processor speed (%) | note |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...rows.map((row) => `| ${row.stop} | ${row.quality} | ${one(row.fps)} | ${one(row.slow1)} | ${one(row.worst)} | ${whole(row.calls)} | ${whole(row.triangles)} | ${percent(row.busy)} | ${percent(row.speed)} | ${row.note} |`),
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
  const all = [...capped.rows, ...(headroom?.rows ?? [])].filter((row) => has(row.fps));
  const retaken = all.filter((row) => row.retakes > 0);
  const retakenPart = retaken.length === 0
    ? ""
    : `\n\n${String(retaken.length)} of ${String(all.length)} rows were sampled more than once, because a sample came out slow or was taken with the machine busy or its processor running slow. The notes give every sample, and "How to read it" says how the row is chosen.`;
  const top3 = (quality, first, second) => measured
    .filter((row) => row.quality === quality && has(row.calls) && has(row.triangles))
    .sort((a, b) => b[first] - a[first] || b[second] - a[second])
    .slice(0, 3)
    .map((row) => `${row.stop} (${whole(row.calls)} draw calls, ${whole(row.triangles)} triangles)`)
    .join(", ") || "n/a";
  const heaviest = QUALITIES.flatMap((quality) => [
    `- **${quality}**, by draw calls: ${top3(quality, "calls", "triangles")}`,
    `- **${quality}**, by triangles: ${top3(quality, "triangles", "calls")}`,
  ]).join("\n");
  const flat = measured.filter((row) => {
    const top = measured.find((other) => other.stop === row.stop && other.quality === QUALITIES[0]);
    return row.quality !== QUALITIES[0] && top && has(row.triangles) && has(top.triangles) && row.triangles >= top.triangles;
  });
  const lower = QUALITIES.slice(1).join(", ");
  const flatPart = flat.length === 0
    ? `Every measured stop draws fewer triangles at ${lower} than at ${QUALITIES[0]}.`
    : `Quality ${lower} does not reduce triangles at: ${flat.map((row) => `**${row.stop}**`).join(", ")}.`;
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

${verdict}${unmeasured}${retakenPart}

## What costs the most

The three heaviest stops at each quality level, from the run with the frame cap on. Draw calls and triangles are per frame.

${heaviest}

${flatPart}

## As a player sees it: frame cap on

Headless Chrome draws at most 60 frames a second, so 60 means "at the cap".

${table(capped.rows)}${headroomPart}

## How to read it

- Each row is ${String(run.seconds)} s of \`requestAnimationFrame\` in the fight, after ${String(WARMUP_MS / 1000)} s of warm-up, with every defense key held so no attack lands and the fight does not end.
- **mean fps** is frames drawn over time elapsed. **slowest 1% frame** is the frame time that 99% of frames beat. **worst frame** is the single longest.
- **draw calls** and **triangles** are the median per frame over ${String(DRAW_COUNT_MS / 1000)} s after the timing, summed over every pass (shadow map, scene, each post-processing pass). The game exposes no renderer under \`/?debug\`, so the script counts the draw calls on the canvas's WebGL context.
- **machine busy** is the share of the whole machine's processor time in use during the sample, this browser included. **processor speed** is how fast one core ran a fixed loop around the sample, against the fastest it ran during the whole run: a laptop that clamps its processor (heat, a power limit) shows a low number here.
- A sample is suspect when the machine was more than ${percent(BUSY_LIMIT)}% busy, when the processor was under ${percent(SPEED_LIMIT)}% speed, or when the frame rate came out under ${String(TARGET_FPS)} fps with the cap on (with the cap off: under the same row with the cap on). Other work on the GPU cannot be measured from the script, so a low frame rate is the only sign of it. The script then leaves the fight, rests ${String(REST_MS / 1000)} s, waits (up to ${String(QUIET_WAIT_MS / 1000)} s) for the machine to go quiet and come back to speed, goes back in and samples again, up to ${String(MAX_SAMPLES)} times. The first sample that is not suspect is the row. A row whose samples were all suspect gets one more round of up to ${String(MAX_SAMPLES)} at the end of the pass. If every sample is still suspect the fastest is the row, and the note lists them all: a stop that is slow every time is slow, not disturbed.
- If a fight ends inside a sample, the script goes back into the stop and samples the full ${String(run.seconds)} s again, so every row is ${String(run.seconds)} s of fight.
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
    const capped = await runPass(chromium, base, stops, seconds, false, () => TARGET_FPS);
    // With the cap off a scene cannot be drawn slower than with it on, so a row that is has been disturbed.
    const cappedFps = (id, quality) => capped.rows.find((row) => row.stop === id && row.quality === quality)?.fps ?? 0;
    const headroom = flag("no-headroom") ? null : await runPass(chromium, base, stops, seconds, true, (id, quality) => cappedFps(id, quality) * 0.9);
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
