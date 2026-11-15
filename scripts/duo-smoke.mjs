// Duo smoke run: two players on one camera (src/duo, docs/duo.md), played in a headless browser by two made-up bodies.
// Starts the dev server on a free port, opens the Multiplayer screen, presses the two-player card and plays a fight
// with the pose path on: the browser's fake camera runs the real tracker, and the bodies the tracker hands to
// `duoCamera.take` are swapped for two made-up ones (the same frames the unit tests use). Prints one PASS or FAIL
// line per check.
//
//   node scripts/duo-smoke.mjs [--port=4396] [--stop=polyphemus] [--cap=180] [--shots=<folder>]
//
// When the Multiplayer screen has no two-player card (src/duo is merged but not mounted) it prints one SKIP line
// and exits 0, so it is safe to run on any build. Exits 1 when a check fails.
//
// It uses the dev server and not a build, because the page loads the made-up bodies from tests/helpers.
// It needs Chrome (or Edge) and Playwright, found the same way as in scripts/smoke.mjs:
//   FPS_CHANNEL     browser channel (default "chrome"; "msedge" also works, "" uses Playwright's own Chromium)
//   FPS_GL          ANGLE backend (default d3d11 on Windows, metal on macOS; "swiftshader" forces software GL)
//   FPS_PLAYWRIGHT  folder of a playwright or playwright-core install, used when the repo has neither
//
// What it cannot say: anything about two real people in front of a real camera. See docs/duo.md.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Found the way node finds it, so the run also works in a git worktree whose modules are the main checkout's.
const VITE = join(dirname(createRequire(join(ROOT, "package.json")).resolve("vite/package.json")), "bin", "vite.js");
/** The two window sizes the card must fit in. */
const SIZES = [{ width: 1280, height: 720 }, { width: 1600, height: 900 }];
/** How long a screen may take to come up. The first page of a dev server is slow: it bundles the dependencies. */
const SCREEN_TIMEOUT_MS = 60_000;
/** The camera, the pose model and the three seconds of standing still all happen before the fight opens. */
const FIGHT_TIMEOUT_MS = 150_000;
/** Where the made-up bodies stand, as a shift of the test body (which stands in the middle of the picture). */
const FIRST_DX = -0.12;
const SECOND_DX = 0.2;
/** The room rule the doubled hit follows (TOGETHER_MS in src/net/host.ts). */
const TOGETHER_MS = 400;

const args = process.argv.slice(2);
const option = (name, fallback) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const say = (line) => process.stdout.write(`${line}\n`);
const sleep = (ms) => new Promise((next) => setTimeout(next, ms));

let failures = 0;
function check(ok, what, detail = "") {
  if (!ok) failures += 1;
  say(`${ok ? "PASS" : "FAIL"}: ${what}${detail ? ` (${detail})` : ""}`);
  return ok;
}

/** One field of every definition file in a folder of src/, read the way scripts/smoke.mjs reads them. */
function readDefs(folder, fields) {
  const dir = join(ROOT, "src", folder, "defs");
  return readdirSync(dir).filter((file) => file.endsWith(".ts")).map((file) => {
    const source = readFileSync(join(dir, file), "utf8");
    return Object.fromEntries(fields.map((field) => [field, new RegExp(`^ {2}${field}: "?([^",]+)"?`, "m").exec(source)?.[1] ?? ""]));
  });
}

/** The words on the card's button, read from the card itself, so a new wording does not break the run. */
function readCardButton() {
  const source = readFileSync(join(ROOT, "src", "duo", "ui", "DuoCard.tsx"), "utf8");
  return />([^<>{}]+)<\/Button>/.exec(source)?.[1].trim() ?? "Play side by side";
}

/** True when the camera panel asks duoCamera which frame to draw (the fifth file of the mount diff). */
function panelAsksDuo() {
  return readFileSync(join(ROOT, "src", "hud", "CameraView.tsx"), "utf8").includes("duoCamera.seen");
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

async function waitForServer(url, server) {
  for (let i = 0; i < 150; i += 1) {
    if (server.exitCode !== null) throw new Error("the dev server stopped before it answered");
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await sleep(200);
  }
  throw new Error(`the dev server did not answer at ${url}`);
}

function browserArgs() {
  const backend = process.env.FPS_GL ?? { win32: "d3d11", darwin: "metal" }[process.platform] ?? "";
  const list = ["--use-gl=angle", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required",
    // A camera that needs no person and no permission prompt. It shows no body: the bodies are made up in the page.
    "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--mute-audio"];
  if (backend) list.push(`--use-angle=${backend}`);
  return list;
}

/** Runs in the page: the first button under `main` whose text, tooltip or label holds one of `texts` (as in smoke.mjs). */
function findButton(texts) {
  const buttons = [...document.querySelectorAll("main button")];
  const says = (button) => `${button.textContent ?? ""}\n${button.title}\n${button.getAttribute("aria-label") ?? ""}`.toLowerCase();
  const index = buttons.findIndex((button) => texts.some((text) => text && says(button).includes(text.toLowerCase())));
  return index < 0 ? null : { index, disabled: buttons[index].disabled };
}

/** Runs in the page: where the card around the button with these words sits, after it is scrolled into view. */
function measureCard(words) {
  const button = [...document.querySelectorAll("main button")].find((one) => (one.textContent ?? "").trim() === words);
  const card = button?.closest("section");
  if (!button || !card) return null;
  card.scrollIntoView({ block: "center" });
  const box = card.getBoundingClientRect();
  const inner = button.getBoundingClientRect();
  const others = [...(card.parentElement?.children ?? [])].filter((one) => one !== card && getComputedStyle(one).display !== "none").map((one) => one.getBoundingClientRect());
  const rows = [...new Set([box, ...others].map((one) => Math.round(one.top)))].sort((a, b) => a - b);
  return {
    left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: window.innerWidth, height: window.innerHeight,
    buttonInside: inner.left >= box.left - 1 && inner.right <= box.right + 1 && inner.top >= box.top - 1 && inner.bottom <= box.bottom + 1,
    // Every line of the card inside its box. The round sticker on the top edge sits half outside on purpose.
    spills: [...card.children].some((one) => {
      if (getComputedStyle(one).position === "absolute") return false;
      const line = one.getBoundingClientRect();
      return line.left < box.left - 1 || line.right > box.right + 1 || line.top < box.top - 1 || line.bottom > box.bottom + 1;
    }),
    overlaps: others.some((one) => one.left < box.right - 1 && one.right > box.left + 1 && one.top < box.bottom - 1 && one.bottom > box.top + 1),
    row: rows.indexOf(Math.round(box.top)) + 1, rows: rows.length, cards: others.length + 1,
  };
}

/**
 * Runs in the page, before the card is pressed: swaps the bodies the tracker finds for two made-up ones and plays
 * them. Everything the script later asks is answered by `window.__duo`.
 *
 * Each body stands still (the tests' NEUTRAL pose) until it is told to do a move, then plays the tests' good
 * recording of that move (GOOD in tests/helpers/ghostCopy.ts). At the start of every defend or strike the bodies
 * named by the policy do the move the fight asks for. Every phase of the fight is written to a log with the health
 * of both sides when it began and when it ended.
 */
async function installStage(places) {
  const { duoCamera } = await import("/src/duo/duoCamera.ts");
  const { secondDrawn } = await import("/src/duo/secondDrawn.ts");
  const { duoTally } = await import("/src/duo/tally.ts");
  const { GOOD } = await import("/tests/helpers/ghostCopy.ts");
  const { sequence, frameOf, NEUTRAL } = await import("/tests/helpers/poses.ts");
  const { battle } = await import("/src/render/battle.ts");
  const puppet = (dx) => ({
    here: true, queue: [],
    perform(move) { if (GOOD[move]) this.queue = sequence(GOOD[move]).slice(20); return Boolean(GOOD[move]); },
    body(t) {
      const frame = this.queue.shift() ?? frameOf(t, NEUTRAL);
      return { image: frame.image.map((point) => ({ ...point, x: point.x + dx })), world: frame.world };
    },
  });
  const middle = (frame) => (frame ? (frame.image[11].x + frame.image[12].x) / 2 : null);
  const stage = {
    first: puppet(places.first), second: puppet(places.second),
    /** Who does the move each phase asks for: "both", "first", "second" or "none". */
    policy: { defend: "both", strike: "none" },
    /** In a strike made by both, the first body starts this long after the second. */
    gapMs: 0,
    log: [], open: null, heroX: null, frames: 0, flashes: [], flash: null,
    /** The longest time the fight's state stood still since the script last set it to 0: a pause shows up here. */
    lastState: null, changedAt: 0, stall: 0,
    /** The longest time between two pictures from the tracker since then. A fight with no pictures pauses, whoever is in them. */
    tookAt: 0, gap: 0,
    todo: [],
    now: () => ({
      players: duoCamera.players(performance.now()), on: duoCamera.on(), wanted: duoCamera.wanted(), heroX: stage.heroX, frames: stage.frames,
      figureMsAgo: performance.now() - secondDrawn.at, stall: stage.stall, gap: stage.gap, flashes: stage.flashes,
      phase: battle.state?.phase.kind ?? null, enemyHp: battle.state?.enemyHp ?? null, playerHp: battle.state?.playerHp ?? null,
      twoInState: battle.state?.players ?? null, log: stage.log,
      tag: [...document.querySelectorAll(".fight .hb-duo:not(.duo-tally)")].map((one) => one.textContent ?? ""),
      // Each player's hits and points: what src/duo counted, the two plates above the camera panel, and the end panel's score line.
      tally: duoTally.get(), line: [...document.querySelectorAll(".fight .duo-tally > *")].map((one) => one.textContent ?? "").join(" · "),
      endLine: document.querySelector(".fight > .overlay > h1 + p")?.textContent ?? "", score: battle.state?.score ?? null,
      panelTag: document.querySelector(".fight .camera-tag")?.textContent ?? "",
    }),
  };
  const idOf = (phase) => (phase.kind === "defend" ? phase.attack.counter : phase.kind === "strike" || phase.kind === "finisher" ? phase.move : "");
  const drive = (t) => {
    const state = battle.state;
    if (state !== stage.lastState) { stage.lastState = state; stage.changedAt = t; }
    stage.stall = Math.max(stage.stall, t - stage.changedAt);
    if (!state) return;
    const phase = state.phase;
    const key = `${phase.kind}:${idOf(phase)}`;
    const left = "msLeft" in phase ? phase.msLeft : 0;
    if (!stage.open || stage.open.key !== key || left > stage.open.left + 50) {
      if (stage.open) stage.log.push({ ...stage.open.entry, enemyHpEnd: state.enemyHp, playerHpEnd: state.playerHp, endAt: t });
      const who = phase.kind === "defend" ? stage.policy.defend : phase.kind === "strike" || phase.kind === "finisher" ? stage.policy.strike : "none";
      stage.open = { key, at: t, entry: { kind: phase.kind, id: idOf(phase), who, at: t, enemyHp: state.enemyHp, playerHp: state.playerHp, players: duoCamera.players(t), known: true } };
      const move = idOf(phase);
      if (move && who !== "none") {
        const delay = phase.kind === "defend" ? 250 : 200;
        if (who !== "first") stage.todo.push({ at: t + delay, body: stage.second, move });
        if (who !== "second") stage.todo.push({ at: t + delay + (who === "both" && phase.kind !== "defend" ? stage.gapMs : 0), body: stage.first, move });
      }
    }
    stage.open.left = left;
    // The flash comes up with the hit, which also ends the strike phase: so it is timed, not tied to the open phase.
    const flash = document.querySelector(".fight .hb-together");
    if (flash && flash !== stage.flash) stage.flashes.push(t);
    stage.flash = flash;
    stage.todo = stage.todo.filter((job) => {
      if (job.at > t) return true;
      if (job.body.here && !job.body.perform(job.move)) stage.open.entry.known = false;
      return false;
    });
  };
  const take = duoCamera.take;
  duoCamera.take = (_found, t) => {
    if (stage.tookAt > 0) stage.gap = Math.max(stage.gap, t - stage.tookAt);
    stage.tookAt = t;
    drive(t);
    const out = take([stage.first, stage.second].filter((body) => body.here).map((body) => body.body(t)), t);
    stage.heroX = middle(out);
    stage.frames += 1;
    return out;
  };
  window.__duo = stage;
}

/**
 * Runs in the page: where along the camera panel (0 left, 1 right) a skeleton's stones are, or null when none are
 * drawn. Player one's is the panel's own canvas; with `second` it is the canvas src/duo lays over it for player two.
 * `blue` is the share of the stones that are plainly blue: player two's are, player one's (cream, slate, terracotta) are not.
 */
function skeletonAt([second, screen] = [false, ".fight"]) {
  const canvas = document.querySelector(`${screen} ${second ? ".camera-frame canvas.duo-skeleton" : ".camera-view canvas:not(.duo-skeleton)"}`);
  if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0) return null;
  const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
  let sum = 0;
  let count = 0;
  let blue = 0;
  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      const at = (y * canvas.width + x) * 4;
      if (data[at + 3] <= 40) continue;
      sum += x;
      count += 1;
      if (data[at + 2] > data[at] + 80) blue += 1;
    }
  }
  return count < 20 ? null : { at: sum / count / canvas.width, blue: blue / count };
}

async function main() {
  const capMs = Number(option("cap", "180")) * 1000;
  const shots = option("shots", "") ? resolve(option("shots", "")) : "";
  if (shots) mkdirSync(shots, { recursive: true });
  const stops = readDefs("enemies", ["id", "name", "place", "order"]).filter((stop) => stop.id && stop.name).sort((a, b) => Number(a.order) - Number(b.order));
  const stop = stops.find((one) => one.id === option("stop", stops[0]?.id ?? ""));
  if (!stop) throw new Error(`no stop "${option("stop", "")}"; the stops are ${stops.map((one) => one.id).join(", ")}`);
  const styles = readDefs("styles", ["id", "name"]).filter((style) => style.id && style.name);
  const cardButton = readCardButton();
  const channel = process.env.FPS_CHANNEL ?? "chrome";
  const chromium = loadChromium();
  let server = null;
  let browser = null;
  const stopServer = () => { server?.kill(); };
  process.on("exit", stopServer);
  process.on("SIGINT", () => process.exit(130));
  process.on("SIGTERM", () => process.exit(143));
  try {
    const port = option("port", "") ? Number(option("port", "")) : await freePort();
    const base = `http://127.0.0.1:${String(port)}`;
    server = spawn(process.execPath, [VITE, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: ROOT, stdio: "ignore" });
    await waitForServer(base, server);
    browser = await chromium.launch({ headless: true, args: browserArgs(), ...(channel ? { channel } : {}) });
    const context = await browser.newContext({ viewport: SIZES[0], deviceScaleFactor: 1, permissions: ["camera"] });
    const page = await context.newPage();
    const errors = [];
    // The dev server has no game server behind it, so the cards that ask /api for something get no answer: not a fault here.
    const offServer = (text) => /\/api\//.test(text) || /Failed to load resource/.test(text);
    page.on("pageerror", (error) => { errors.push(`page error: ${error instanceof Error ? error.message : String(error)}`); });
    page.on("console", (message) => { if (message.type() === "error" && !offServer(`${message.text()} ${message.location().url}`)) errors.push(`console error: ${message.text()}`); });
    page.on("response", (response) => { if (response.status() >= 400 && !offServer(response.url())) errors.push(`${String(response.status())} ${response.url().replace(base, "")}`); });
    const shot = async (name) => { if (shots) await page.screenshot({ path: join(shots, `${name}.png`) }).catch(() => undefined); };
    /** A picture of one piece of the screen, as large as it is drawn. */
    const shotOf = async (name, selector) => { if (shots) await page.locator(selector).first().screenshot({ path: join(shots, `${name}.png`) }).catch(() => undefined); };
    const read = () => page.evaluate(() => window.__duo.now());
    const set = (change) => page.evaluate((next) => {
      const stage = window.__duo;
      if (next.policy) Object.assign(stage.policy, next.policy);
      if ("first" in next) stage.first.here = next.first;
      if ("second" in next) stage.second.here = next.second;
      if ("gapMs" in next) stage.gapMs = next.gapMs;
      if (next.resetStall) { stage.stall = 0; stage.gap = 0; }
      return stage.log.length;
    }, change);
    /** Waits for a finished phase, written to the log at or after place `from`, that `wanted` accepts. Null when the fight ends or time runs out first. */
    const phaseAfter = async (from, wanted, timeoutMs = 45_000) => {
      const until = Date.now() + timeoutMs;
      while (Date.now() < until) {
        const now = await read();
        const found = now.log.slice(from).find(wanted);
        if (found) return found;
        if (now.phase === "won" || now.phase === "lost") return null;
        await sleep(100);
      }
      return null;
    };
    const waitFor = async (test, timeoutMs) => {
      const until = Date.now() + timeoutMs;
      let now = await read();
      while (!test(now) && Date.now() < until) { await sleep(80); now = await read(); }
      return now;
    };

    // The dev server bundles a dependency the first time a page asks for it, and then reloads the page. So the page
    // asks for everything the run needs once, before the run starts; errors seen here are not the game's.
    await page.goto(base);
    await page.evaluate(() => Promise.all(["/src/duo/duoCamera.ts", "/src/duo/secondDrawn.ts", "/src/duo/tally.ts", "/tests/helpers/ghostCopy.ts", "/tests/helpers/poses.ts", "/src/render/battle.ts"].map((path) => import(path)))).catch(() => undefined);
    await sleep(1500);
    errors.length = 0;

    // 1. The card on the Multiplayer screen.
    await page.goto(`${base}/?stop=${stop.id}`);
    const multiplayer = page.getByRole("button", { name: /^Multiplayer/ }).first();
    await multiplayer.waitFor({ timeout: SCREEN_TIMEOUT_MS }).catch(() => { throw new Error("the main menu has no Multiplayer card"); });
    await multiplayer.click();
    // The screen is up once it offers a room; the two-player card, when it is mounted, is drawn with it.
    await page.waitForFunction(findButton, ["room"], { timeout: SCREEN_TIMEOUT_MS }).catch(() => { throw new Error("the Multiplayer screen did not come up"); });
    await sleep(500);
    if (!(await page.evaluate(findButton, [cardButton]))) {
      say("SKIP: the Multiplayer screen has no two-player card yet");
      return;
    }
    check(true, "the two-player card is on the Multiplayer screen", `its button says "${cardButton}"`);
    for (const size of SIZES) {
      await page.setViewportSize(size);
      await sleep(500);
      const at = await page.evaluate(measureCard, cardButton);
      const name = `${String(size.width)}x${String(size.height)}`;
      await shot(`multiplayer-${name}`);
      const fits = at !== null && at.left >= 0 && at.right <= at.width && at.top >= 0 && at.bottom <= at.height && at.buttonInside && !at.spills && !at.overlaps;
      const where = at === null ? "the card was not found" : `row ${String(at.row)} of ${String(at.rows)}, ${String(at.cards)} cards shown, ${String(Math.round(at.right - at.left))} by ${String(Math.round(at.bottom - at.top))} px${at.overlaps ? ", it overlaps another card" : ""}${at.spills ? ", its text spills out" : ""}`;
      check(fits, `the card fits at ${name}`, where);
    }
    await page.setViewportSize(SIZES[0]);
    await sleep(300);

    // 2. Pressing it starts a fight: camera, god scan, character, style, map, standing still, fight.
    await page.evaluate(installStage, { first: FIRST_DX, second: SECOND_DX });
    const card = await page.evaluate(findButton, [cardButton]);
    await page.locator("main button").nth(card.index).click({ timeout: 10_000 });
    const fight = page.locator(".fight canvas").first();
    const started = Date.now();
    let step = "the camera";
    /** Player two's skeleton on the standing-still screen before the fight, once it has been seen there. */
    let standing = null;
    while (Date.now() - started < FIGHT_TIMEOUT_MS && !(await fight.count())) {
      const skip = page.getByRole("button", { name: /^Skip/ }).first();
      const done = page.locator("main button.character-done").first();
      const style = await page.evaluate(findButton, styles.map((one) => one.name));
      const onMap = await page.evaluate(findButton, [stop.place, stop.name]);
      // Each click may find its button already gone (the screen moved on by itself): then the next turn looks again.
      const press = (button) => button.click({ timeout: 2000 }).catch(() => undefined);
      if (await skip.count()) { step = "the god scan"; await press(skip); }
      else if (await done.count()) { step = "the character choice"; await press(done); }
      else if (style) { step = "the style choice"; await press(page.locator("main button").nth(style.index)); }
      else if (onMap && !onMap.disabled) { step = "the map"; await press(page.locator("main button").nth(onMap.index)); }
      else if (standing === null && (standing = await page.evaluate(skeletonAt, [true, ".calibration"]).catch(() => null)) !== null) await shot("standing-still");
      await sleep(400);
    }
    const inFight = (await fight.count()) > 0;
    const before = inFight ? await read() : null;
    check(inFight && before.on && before.wanted === 2 && before.frames > 0, "pressing the card starts a fight with two bodies asked for",
      inFight ? `the tracker handed over ${String(before.frames)} pictures on the way in` : `stuck after ${step}`);
    if (!inFight) { await shot("failed"); throw new Error("no fight to play: the rest of the checks were not run"); }
    check(standing !== null && standing.blue > 0.5, "standing still before the fight, the camera panel already draws the second body in blue",
      standing === null ? "no second skeleton was seen on that screen" : `at ${standing.at.toFixed(2)} of the panel, ${String(Math.round(standing.blue * 100))}% of its stones blue`);
    const fightStarted = Date.now();
    const timeLeft = () => Math.max(1000, capMs - (Date.now() - fightStarted));

    // 3. The second body gets a figure of its own.
    const flashed = (one, now) => now.flashes.some((at) => at >= one.at && at <= one.endAt + 600);
    const stood = (now) => `the fight never stood still longer than ${String(Math.round(now.stall))} ms${now.gap > 700 ? `, but the tracker itself handed over no picture for ${String(Math.round(now.gap))} ms (a slow machine, not the two-player code): run it again` : ""}`;
    const two = await waitFor((now) => now.players === 2 && now.figureMsAgo < 300, 20_000);
    await sleep(600);
    await shot("fight-two");
    check(two.players === 2 && two.figureMsAgo < 300, "the second body gets its own figure", `players ${String(two.players)}, figure last moved ${Number.isFinite(two.figureMsAgo) ? `${String(Math.round(two.figureMsAgo))} ms ago` : "never"}`);
    const skeletonFirst = (await page.evaluate(skeletonAt))?.at ?? null;
    // Each body has a skeleton of its own in the camera panel: player two's is blue and stands to the right.
    const skeletonSecond = await page.evaluate(skeletonAt, [true, ".fight"]);
    await shotOf("camera-panel-two", ".fight .camera-view");
    check(skeletonFirst !== null && skeletonSecond !== null && skeletonSecond.blue > 0.5 && skeletonSecond.at - skeletonFirst > 0.15 && ((await page.evaluate(skeletonAt))?.blue ?? 1) < 0.05,
      "the camera panel draws the second body's skeleton too, in blue",
      skeletonSecond === null ? "no second skeleton is drawn" : `the first skeleton is at ${skeletonFirst === null ? "nowhere" : skeletonFirst.toFixed(2)} of the panel, the second at ${skeletonSecond.at.toFixed(2)} with ${String(Math.round(skeletonSecond.blue * 100))}% of its stones blue`);
    const hitsOf = (now) => `"${now.line}" (counted: player one ${String(now.tally.players[0].hits)}, player two ${String(now.tally.players[1].hits)}, together ${String(now.tally.together)})`;

    // 4. The second body alone lands the prompted strike.
    let from = await set({ policy: { defend: "both", strike: "second" } });
    const alone = await phaseAfter(from, (one) => one.kind === "strike" && one.who === "second", timeLeft());
    const aloneFlash = alone !== null && flashed(alone, await read());
    check(alone !== null && alone.enemyHpEnd < alone.enemyHp && !aloneFlash, "the second body alone lands the prompted strike",
      alone ? `${alone.id}: the monster lost ${String(alone.enemyHp - alone.enemyHpEnd)}, ${aloneFlash ? "with a Together flash it should not have" : "no Together flash"}` : "no strike phase came");
    // That hit is the second body's own: the plates above the camera panel say so.
    const oneHit = /^P1 0 hits (\d+) · P2 1 hit (\d+)$/;
    const afterAlone = await waitFor((now) => oneHit.test(now.line), 1500);
    const alonePoints = oneHit.exec(afterAlone.line);
    await shot("fight-tally");
    check(alonePoints !== null && Number(alonePoints[2]) > Number(alonePoints[1]) && afterAlone.tally.players[0].hits === 0 && afterAlone.tally.players[1].hits === 1,
      "the tally shows one hit for the body that struck, and none for the other", hitsOf(afterAlone));

    // 5. Both inside the window: the doubled hit.
    from = await set({ policy: { strike: "both" }, gapMs: 200 });
    const paired = await phaseAfter(from, (one) => one.kind === "strike" && one.who === "both", timeLeft());
    const pairedFlash = paired !== null && (await waitFor((now) => flashed(paired, now), 800)).flashes.some((at) => at >= paired.at);
    if (pairedFlash) await shot("fight-together");
    check(paired !== null && pairedFlash && paired.enemyHpEnd < paired.enemyHp, `both strike within ${String(TOGETHER_MS)} ms: the doubled hit`,
      paired ? `${paired.id}, 200 ms apart: the monster lost ${String(paired.enemyHp - paired.enemyHpEnd)}${alone ? ` (${alone.id} by one body took ${String(alone.enemyHp - alone.enemyHpEnd)})` : ""}, Together flash ${pairedFlash ? "seen" : "not seen"}` : "no strike phase came");
    const afterPair = await waitFor((now) => /^P1 1 hit \d+ · P2 2 hits \d+$/.test(now.line), 1500);
    check(/^P1 1 hit \d+ · P2 2 hits \d+$/.test(afterPair.line) && afterPair.tally.together === 1, "the doubled hit counts for both bodies in the tally", hitsOf(afterPair));

    // 6. A defend counts only when both make it.
    from = await set({ policy: { defend: "first", strike: "none" } });
    const onlyFirst = await phaseAfter(from, (one) => one.kind === "defend" && one.who === "first" && one.players === 2, timeLeft());
    from = await set({ policy: { defend: "second" } });
    const onlySecond = await phaseAfter(from, (one) => one.kind === "defend" && one.who === "second" && one.players === 2, timeLeft());
    from = await set({ policy: { defend: "both" } });
    const bothDefend = await phaseAfter(from, (one) => one.kind === "defend" && one.who === "both" && one.players === 2, timeLeft());
    const lost = (one) => (one ? `${one.id} cost ${String(one.playerHp - one.playerHpEnd)}` : "no defend phase came");
    check(onlyFirst !== null && onlyFirst.playerHpEnd < onlyFirst.playerHp && onlySecond !== null && onlySecond.playerHpEnd < onlySecond.playerHp && bothDefend !== null && bothDefend.playerHpEnd === bothDefend.playerHp,
      "a defend counts only when both make it", `only the first body: ${lost(onlyFirst)}; only the second: ${lost(onlySecond)}; both: ${lost(bothDefend)}`);

    // 7. The second body leaves: one hero, and the fight does not stop.
    await set({ second: false, policy: { defend: "first", strike: "first" }, resetStall: true });
    await sleep(1500);
    const gone = await read();
    await shot("fight-second-left");
    from = gone.log.length;
    const soloHit = await phaseAfter(from, (one) => one.kind === "strike" && one.who === "first", timeLeft());
    const afterSolo = await read();
    check(gone.players === 1 && gone.figureMsAgo > 500 && afterSolo.stall < 500 && soloHit !== null && soloHit.enemyHpEnd < soloHit.enemyHp, "the second body leaves: one hero, no pause",
      `players ${String(gone.players)}, second figure last moved ${String(Math.round(gone.figureMsAgo))} ms ago, ${stood(afterSolo)}, the first body's next strike took ${soloHit ? String(soloHit.enemyHp - soloHit.enemyHpEnd) : "nothing"}`);
    const skeletonGone = await page.evaluate(skeletonAt, [true, ".fight"]);
    check(skeletonGone === null && /^P1 \d+ hits? \d+ · P2 2 hits \d+, not seen$/.test(gone.line), "the second body leaves: its skeleton goes, and the tally keeps its hits and says it is not seen",
      `second skeleton ${skeletonGone === null ? "gone" : "still drawn"}, the plates read "${gone.line}"`);
    if (panelAsksDuo()) check(two.panelTag === "Both seen" && gone.panelTag === "One seen", "the camera panel's tag says whether the second player is in",
      `with two bodies it reads "${two.panelTag}", after the second left "${gone.panelTag}"`);
    if (gone.tag.length > 0) say(`NOTE: the "${gone.tag[0]}" tag is still up with one player left. It is drawn by the HUD from the fight's own state (players ${String(gone.twoInState)}), which src/duo cannot change.`);

    // 8. The second body comes back, then the first leaves: the one who stayed is the hero, and the fight does not stop.
    await set({ second: true, policy: { defend: "both", strike: "none" } });
    const back = await waitFor((now) => now.players === 2 && now.figureMsAgo < 300, 8000);
    if (back.players !== 2) check(false, "the second body comes back in", `players ${String(back.players)} after 8 s`);
    await set({ first: false, policy: { defend: "second", strike: "second" }, resetStall: true });
    await sleep(1800);
    const promoted = await read();
    const skeletonPromoted = (await page.evaluate(skeletonAt))?.at ?? null;
    await shot("fight-promoted");
    from = promoted.log.length;
    const heroHit = await phaseAfter(from, (one) => one.kind === "strike" && one.who === "second", timeLeft());
    const afterHero = await read();
    const home = 0.5 + FIRST_DX;
    check(promoted.players === 1 && promoted.heroX !== null && Math.abs(promoted.heroX - home) < 0.03 && afterHero.stall < 500 && heroHit !== null && heroHit.enemyHpEnd < heroHit.enemyHp, "the first body leaves: the other is promoted, no pause",
      `players ${String(promoted.players)}, the hero's frame is at ${promoted.heroX === null ? "nowhere" : promoted.heroX.toFixed(2)} of the picture (the first hero stood at ${home.toFixed(2)}, the one who stayed stands at ${(0.5 + SECOND_DX).toFixed(2)}), ${stood(afterHero)}, the promoted body's next strike took ${heroHit ? String(heroHit.enemyHp - heroHit.enemyHpEnd) : "nothing"}`);
    if (!panelAsksDuo()) say("SKIP: the camera panel does not ask duoCamera.seen which frame to draw, so after a promotion its skeleton is where the first hero stood");
    else check(skeletonFirst !== null && skeletonPromoted !== null && Math.abs(skeletonPromoted - skeletonFirst) > 0.15, "after the promotion the camera panel's skeleton is on the promoted player",
      `the skeleton was at ${skeletonFirst === null ? "nowhere" : skeletonFirst.toFixed(2)} of the panel, now at ${skeletonPromoted === null ? "nowhere" : skeletonPromoted.toFixed(2)}`);

    // 9. The one who stayed fights on to the end: the end panel's score line carries each player's hits and points.
    await set({ policy: { defend: "second", strike: "second" } });
    const split = /^Score (\d+) · P1 (\d+) hits? (\d+) · P2 (\d+) hits? (\d+)$/;
    const ended = await waitFor((now) => split.test(now.endLine), timeLeft());
    const parts = split.exec(ended.endLine);
    if (parts) {
      await shot("fight-end");
      check(Number(parts[3]) + Number(parts[5]) === Number(parts[1]) && Number(parts[4]) === 2, "when the fight ends the end panel shows each player's hits and points, and the points add up to the score", `"${ended.endLine}"`);
    } else if (ended.phase === "won" || ended.phase === "lost") check(false, "when the fight ends the end panel shows each player's hits and points", `the fight is ${ended.phase} and the panel's score line reads "${ended.endLine}"`);
    else say(`NOTE: the fight did not end inside the ${String(capMs / 1000)} s the run allows (the monster has ${String(ended.enemyHp)} health left), so the end panel was not looked at. Run it with a larger --cap.`);

    // 10. Nothing went wrong in the page.
    await sleep(500);
    const unknown = (await read()).log.filter((one) => !one.known).map((one) => one.id);
    if (unknown.length > 0) say(`NOTE: no recording for ${[...new Set(unknown)].join(", ")}; the bodies stood still for it`);
    check(errors.length === 0, "no console error", errors.length === 0 ? "" : [...new Set(errors)].slice(0, 5).join(" | ").slice(0, 600));
  } finally {
    await browser?.close().catch(() => undefined);
    stopServer();
  }
}

main().then(() => {
  if (failures > 0) process.exitCode = 1;
}).catch((error) => {
  process.stderr.write(`FAIL: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
