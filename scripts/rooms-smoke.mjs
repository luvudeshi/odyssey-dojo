// Rooms smoke run: builds the game, starts the server (which serves the built game and the room relay on one port),
// and plays an online room in two pages of headless Chrome: a host at laptop size on the keyboard and a guest at
// phone size with touch. Prints one line per step.
//
//   node scripts/rooms-smoke.mjs [--no-build | --dev] [--runs=fight,rejoin,host-leaves] [--poll] [--cap=240]
//                                [--port=6040] [--no-host-camera] [--shots=folder]
//
// The three runs:
//   fight        the host makes a room, the guest types its code, they play one whole fight; at first the host only
//                defends, so the first hit on the monster shows that the guest's strike reached the host's fight
//   rejoin       the guest's page closes in the middle of the fight and a new one comes back by the room's link;
//                the host only defends while the guest is away, so the fight is still on when the guest is back
//   host-leaves  the host's page closes in the middle of the fight; the guest must be told and get back to the start
//
// --poll  the guest's event stream never delivers (as through a Cloudflare quick tunnel), so its link falls back
//         to long polling after 3 seconds. Without it both pages use the event stream.
//
// --dev    no build: the server runs as before, and the pages load the source through vite's dev server on a second
//          free port, which passes /api on to the server. For a machine where a build is too heavy. The pages then
//          run React's development build, so the built game is still the last word.
// --shots  a folder for pictures: one of each open page after every step, named by run, step and page.
//
// Exits 1 when a run has a console error, a page error, a request that failed or answered 4xx/5xx, a guest who
// never sees the fight, or health, score or result that differ between the two pages at the end.
// One answer is expected and not counted: 409 "room full" while a guest who dropped waits for the old seat to be
// given back (the relay holds a seat for 20 seconds, see docs/rooms.md). The line for that step says how often.
//
// Both pages go through the Multiplayer shield of the main menu: the host presses "Open a room" on its host card, the
// guest types the code into its join card. At phone width the menu's four shields overlap, so the guest presses a part
// of the Multiplayer shield that is not covered (the step's line says so). After "Start" the host goes through the
// god scan, the character screen ("Fight as ..."), the style screen, the map and calibration.
//
// No real camera is used. "Start" on the host card starts the host's webcam, so the host's page is given Chrome's
// fake camera (a moving test pattern, nobody in it): the host skips the god scan, and at calibration takes "Use
// keyboard instead", so it plays on the keyboard. The guest's page is refused the camera, so it gets the touch
// buttons a phone on plain http gets.
// --no-host-camera  refuses the host the camera too, as on a laptop with no webcam. Such a host must keep its room
//                   after "Start" and play on the keyboard; today the game drops the room (see docs/rooms.md).
//
// Finding Playwright and the way the fight is played are the same as in scripts/smoke.mjs. That file exports
// nothing and runs on import, so those small parts are copied here.
//
// Environment (the same names as scripts/smoke.mjs):
//   FPS_CHANNEL     browser channel for Playwright (default "chrome"; "msedge" also works, "" uses Playwright's own Chromium)
//   FPS_GL          ANGLE backend (default d3d11 on Windows, metal on macOS; "swiftshader" forces software GL)
//   FPS_PLAYWRIGHT  folder of a playwright or playwright-core install, used when the repo has neither
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VITE = join(ROOT, "node_modules", "vite", "bin", "vite.js");
const HOST_VIEW = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };
const GUEST_VIEW = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
  userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
};
const POLL_MS = 50;
/** A strike key is pressed again this often while its prompt is still up. */
const STRIKE_EVERY_MS = 150;
/** The guest taps its strike button this often while a strike is asked for. */
const TAP_EVERY_MS = 100;
/** The page must answer one read within this, or it counts as hung. */
const POLL_TIMEOUT_MS = 10_000;
/**
 * How long a screen may take to come up. With --dev a new page loads the source file by file with nothing cached,
 * which on a busy machine has taken over 12 seconds, so it gets three times as long.
 */
const SCREEN_MS = process.argv.includes("--dev") ? 45_000 : 15_000;
/** How long the host's camera and pose tracker may take to start after "Start". */
const CAMERA_MS = 90_000;
/** A host with no camera: how long after "Start" the room must still be there (the camera is refused within a second). */
const NO_CAMERA_MS = 4_000;
/** How long the guest may take to show what the host shows. */
const FOLLOW_MS = 8_000;
/** How long the fight may take to its first hit, on either side. */
const FIRST_HIT_MS = 30_000;
/** How far into the fight the guest drops, or the host leaves. */
const MIDDLE_MS = 8_000;
/** The relay gives a guest's seat back 20 seconds after the guest went; a rejoin is tried for this long. */
const REJOIN_MS = 45_000;
const REJOIN_EVERY_MS = 2_000;
/** Time after the result for late errors to show up. */
const AFTER_MS = 1000;

const RUNS = {
  fight: "the host and the guest play one whole fight",
  rejoin: "the guest drops in the middle and comes back",
  "host-leaves": "the host leaves in the middle",
};

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const say = (line) => process.stdout.write(`${line}\n`);
const sleep = (ms) => new Promise((next) => setTimeout(next, ms));
const firstLine = (error) => (error instanceof Error ? error.message : String(error)).split("\n")[0];

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

function build() {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [VITE, "build"], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] });
    child.on("error", fail);
    child.on("exit", (code) => { if (code === 0) done(); else fail(new Error(`vite build failed with code ${String(code)}`)); });
  });
}

/**
 * The game server on `port`, as `npm run server` starts it but with node directly (no shell, no tsx wrapper
 * process), so killing the child leaves nothing behind. It serves dist/ and the room relay. Its log lines are kept.
 */
function startServer(port) {
  const child = spawn(process.execPath, ["--import", "tsx", join(ROOT, "server", "main.ts")], {
    cwd: ROOT,
    env: { ...process.env, AI_SERVER_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const lines = [];
  const keep = (chunk) => { lines.push(...String(chunk).split("\n").filter(Boolean)); lines.splice(0, Math.max(0, lines.length - 200)); };
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  return { child, lines };
}

async function waitForServer(url, server) {
  for (let i = 0; i < 150; i += 1) {
    if (server.child.exitCode !== null) throw new Error(`the server stopped before it answered:\n${server.lines.join("\n")}`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await sleep(200);
  }
  throw new Error(`the server did not answer at ${url}`);
}

/**
 * The game's source through vite's dev server on `port`, with /api sent on to the game server at `api` (vite.config.ts
 * reads API_URL). For a machine where a build is too heavy; the pages then run React's development build.
 */
function startDev(port, api) {
  const child = spawn(process.execPath, [VITE, "--port", String(port), "--strictPort", "--host", "127.0.0.1"], {
    cwd: ROOT,
    env: { ...process.env, API_URL: api },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const lines = [];
  const keep = (chunk) => { lines.push(...String(chunk).split("\n").filter(Boolean)); lines.splice(0, Math.max(0, lines.length - 200)); };
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  return { child, lines };
}

function glArgs() {
  const backend = process.env.FPS_GL ?? { win32: "d3d11", darwin: "metal" }[process.platform] ?? "";
  // Two pages draw at once: neither may be slowed down for being "in the background".
  const list = [
    "--use-gl=angle", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader",
    "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows",
  ];
  if (backend) list.push(`--use-angle=${backend}`);
  // The camera a page gets, when it is allowed one, is Chrome's test pattern and never a real camera. Only the
  // host's page is allowed one (its context's permission); without the permission headless Chrome refuses.
  list.push("--use-fake-device-for-media-stream", "--mute-audio");
  return list;
}

/** Runs in the page: the WebGL renderer string, which names the GPU or the software rasteriser. */
function readRenderer() {
  const gl = document.createElement("canvas").getContext("webgl2");
  const info = gl?.getExtension("WEBGL_debug_renderer_info");
  return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "unknown";
}

function withTimeout(promise, ms, what) {
  let timer;
  const late = new Promise((_, fail) => { timer = setTimeout(() => { fail(new Error(what)); }, ms); });
  return Promise.race([promise, late]).finally(() => { clearTimeout(timer); });
}

/**
 * Collects everything that should not happen on a page: thrown errors, console errors, failed and 4xx/5xx requests.
 * While `seen.expectFull` is true, the relay's 409 to a join (and the browser's console line about it) is counted
 * apart. Also counts the strikes the page sent and how many the relay passed on.
 */
function watch(page, base, seen = { pageErrors: [], consoleErrors: [], badRequests: [], full: 0, expectFull: false, strikes: 0, delivered: 0 }) {
  const short = (url) => (url.startsWith(base) ? url.slice(base.length) : url).replace(/token=[^&]+/, "token=...");
  page.on("pageerror", (error) => { seen.pageErrors.push(error instanceof Error ? error.message : String(error)); });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (seen.expectFull && /\b409\b/.test(message.text())) return;
    seen.consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    const url = response.url();
    if (response.status() === 409 && seen.expectFull && /\/api\/rooms\/[^/]+\/join$/.test(url)) {
      seen.full += 1;
      return;
    }
    if (response.status() >= 400) seen.badRequests.push(`${String(response.status())} ${short(url)}`);
    else if (/\/api\/rooms\/[^/]+\/send$/.test(url) && response.request().postData()?.includes('"strike"')) {
      seen.strikes += 1;
      response.json().then((answer) => { if (answer?.delivered === true) seen.delivered += 1; }, () => undefined);
    }
  });
  page.on("requestfailed", (request) => {
    const why = request.failure()?.errorText ?? "failed";
    // The browser cancelling its own request (a media preload, a page being left) is not a fault of the game.
    if (why !== "net::ERR_ABORTED") seen.badRequests.push(`${why} ${short(request.url())}`);
  });
  return seen;
}

/**
 * Runs on a button in the page: a point of the button, measured from its top left corner, where a press lands on the
 * button itself. The middle is tried first. Null when something else covers every point tried. At phone width the
 * main menu's shields overlap, and the middle of one lies under its neighbour's name ribbon; a person presses the
 * part they can see, and so does the script.
 */
function pressablePoint(button) {
  const box = button.getBoundingClientRect();
  const steps = [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9];
  for (const fy of steps) {
    for (const fx of steps) {
      const x = box.x + box.width * fx;
      const y = box.y + box.height * fy;
      const top = document.elementFromPoint(x, y);
      if (top && button.contains(top)) return { x: x - box.x, y: y - box.y, middle: fx === 0.5 && fy === 0.5 };
    }
  }
  return null;
}

/**
 * Clicks a button. The screens are being restyled, so a button is found by what it does first (`selector`, built
 * from structure and attributes) and by its words only when that finds nothing. The click goes to a point where the
 * button is on top (pressablePoint); a button that is covered all over fails the step.
 */
async function press(page, what, { selector = null, name }) {
  const deadline = Date.now() + SCREEN_MS;
  let covered = false;
  for (;;) {
    for (const target of [selector && page.locator(selector).first(), page.getByRole("button", { name }).first()].filter(Boolean)) {
      if (await target.isVisible().catch(() => false) && await target.isEnabled().catch(() => false)) {
        const point = await target.evaluate(pressablePoint).catch(() => null);
        covered = point === null;
        if (point === null) continue;
        await target.click({ position: { x: point.x, y: point.y }, timeout: SCREEN_MS });
        return point.middle ? "" : "pressed off its middle, which another button covers";
      }
    }
    if (Date.now() >= deadline) throw new Error(covered ? `the button to ${what} is covered: no part of it can be pressed` : `no button to ${what}`);
    await sleep(100);
  }
}

/** Runs in the page: the text of the screen's status or alert line, whichever has words. */
function readNotice() {
  const lines = [...document.querySelectorAll('main [role="alert"], main [role="status"]')].map((node) => node.textContent?.trim() ?? "");
  return lines.find((line) => line !== "") ?? "";
}

/** Runs in the page: where this page is, for the line of a step that failed. */
function readWhere() {
  if (document.querySelector(".fight canvas")) return "the fight";
  // A heading laid in pebbles is a canvas with its words in aria-label.
  const title = document.querySelector("main h1");
  const heading = (title?.getAttribute("aria-label") ?? title?.textContent ?? "").trim();
  const notice = [...document.querySelectorAll('main [role="alert"], main [role="status"]')].map((node) => node.textContent?.trim() ?? "").find((line) => line !== "") ?? "";
  return `"${[heading, notice].filter(Boolean).join(": ") || document.body.innerText.trim().slice(0, 80)}"`;
}

/**
 * Runs in the page: what the HUD shows right now, on the host's page or the guest's. `over` is the result overlay
 * (the only overlay with buttons that is not the pause menu). Every selector names the pebble HUD (hb-, pb-), the
 * star-chart HUD (sky-, sk-) and the forge bars (fg-) side by side. The two health bars are read from their meter
 * role, which all of them have: whole percentages, null until the bar is drawn.
 */
function readHud() {
  const fight = document.querySelector(".fight");
  if (!fight?.querySelector("canvas")) return { fight: false };
  const bars = [...fight.querySelectorAll('[role="meter"][aria-label$=" health"]')];
  const mine = (bar) => bar.getAttribute("aria-label") === "You health";
  const percent = (bar) => {
    const now = Number.parseFloat(bar?.getAttribute("aria-valuenow") ?? "");
    return Number.isFinite(now) ? now : null;
  };
  const hud = { fight: true, you: percent(bars.find(mine)), monster: percent(bars.find((bar) => !mine(bar))), score: fight.querySelector(".hb-score, .sk-score__num, .fg-score__num")?.textContent?.trim() ?? null };
  const overlay = fight.querySelector(".overlay");
  if (overlay?.querySelector("button")) return { ...hud, over: true, title: overlay.querySelector("h1")?.textContent?.trim() ?? "" };
  const prompt = fight.querySelector(".hb-card, .sky-card");
  const pad = fight.querySelector(".touchpad button");
  const box = pad instanceof HTMLButtonElement && !pad.disabled ? pad.getBoundingClientRect() : null;
  return {
    ...hud,
    over: false,
    kind: prompt ? (prompt.matches(".pb-card--defend, .sky-card--defend") ? "defend" : "strike") : null,
    word: prompt?.querySelector(".pb-move, .sky-card__word")?.textContent?.trim() ?? "",
    label: prompt?.querySelector("kbd")?.textContent?.trim() ?? "",
    touch: Boolean(fight.querySelector(".touchpad")),
    tap: box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null,
  };
}

/** Won or lost, from the health bars; from the overlay's words when the bars are not there. */
function resultOf(hud) {
  if (hud.monster === 0) return "won";
  if (hud.you === 0) return "lost";
  return /struck down/i.test(hud.title ?? "") ? "lost" : hud.title ? "won" : "unknown";
}

const shown = (hud) => `${resultOf(hud)}, you ${String(hud.you)}%, monster ${String(hud.monster)}%, score ${String(hud.score)}`;
const same = (a, b) => a.you !== null && a.monster !== null && a.you === b.you && a.monster === b.monster;

/** The reverse of `keyLabel` in src/hud/Hud.tsx: "Space" is the space bar, a letter is shown in upper case. */
function keyFor(hud, moveKeys) {
  if (hud.label === "Space") return " ";
  if (hud.label.length === 1) return hud.label.toLowerCase();
  return hud.label || moveKeys[hud.word] || null;
}

/**
 * Plays the host's fight as scripts/smoke.mjs does: every POLL_MS it reads the prompt card, holds the defend key it
 * asks for or presses the strike key. Ends on the result overlay, on the cap, when `signal.stop` is set, or when
 * the page stops answering. While `signal.defendOnly` is set it throws no strikes (a strike window that runs out
 * costs nothing), so the fight lasts.
 */
async function play(page, moveKeys, capMs, signal) {
  const started = Date.now();
  let held = null;
  let lastStrike = 0;
  const release = async () => {
    if (held !== null) await page.keyboard.up(held);
    held = null;
  };
  try {
    for (;;) {
      const elapsed = Date.now() - started;
      if (signal.stop) return { result: "stopped", ms: elapsed };
      if (elapsed >= capMs) return { result: "never ended", ms: elapsed };
      let hud;
      try {
        hud = await withTimeout(page.evaluate(readHud), POLL_TIMEOUT_MS, "poll timed out");
      } catch (error) {
        return { result: signal.stop ? "stopped" : "hung", ms: Date.now() - started, detail: firstLine(error) };
      }
      if (!hud.fight) return { result: "hung", ms: Date.now() - started, detail: "the fight left the screen" };
      if (hud.over) return { result: resultOf(hud), ms: Date.now() - started, hud };
      const key = hud.kind ? keyFor(hud, moveKeys) : null;
      if (hud.kind === "defend" && key) {
        if (held !== key) {
          await release();
          await page.keyboard.down(key);
          held = key;
        }
      } else {
        await release();
        if (key && !signal.defendOnly && Date.now() - lastStrike >= STRIKE_EVERY_MS) {
          await page.keyboard.press(key);
          lastStrike = Date.now();
        }
      }
      await sleep(POLL_MS);
    }
  } finally {
    await withTimeout(release(), POLL_TIMEOUT_MS, "key release timed out").catch(() => undefined);
  }
}

/**
 * The guest's part: taps the big strike button whenever it is live (or presses the strike key when the page gave
 * it the keyboard). Runs until `signal.stop` is set, the result shows, or the page is gone.
 */
async function strike(page, moveKeys, signal) {
  while (!signal.stop && !page.isClosed()) {
    try {
      const hud = await withTimeout(page.evaluate(readHud), POLL_TIMEOUT_MS, "poll timed out");
      if (hud.fight && hud.over) return;
      if (hud.fight && hud.tap) await page.touchscreen.tap(hud.tap.x, hud.tap.y);
      else if (hud.fight && !hud.touch && hud.kind === "strike") {
        const key = keyFor(hud, moveKeys);
        if (key) await page.keyboard.press(key);
      }
    } catch {
      // The page is closing or between screens: the next round finds out.
    }
    await sleep(TAP_EVERY_MS);
  }
}

/** Waits until `read` (run in the page) answers something `good` accepts; null when it never does. */
async function until(page, read, good, ms) {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = await page.evaluate(read).catch(() => null);
    if (value !== null && good(value)) return value;
    if (Date.now() >= deadline) return null;
    await sleep(100);
  }
}

/** A failed step ends its run. */
class StepFailed extends Error {}

function newRun(id, shoot) {
  const failures = [];
  let count = 0;
  /** With --shots: one picture of each open page after every step, named by run, step number, step and page. */
  const snap = async (label) => {
    count += 1;
    await shoot(`${id} ${String(count).padStart(2, "0")} ${label}`.replace(/[^A-Za-z0-9]+/g, "-"));
  };
  return {
    id,
    failures,
    /** Runs one step and prints its line. `action` returns the words for the line, or throws with what went wrong. */
    async step(label, action) {
      const started = Date.now();
      const took = () => `${((Date.now() - started) / 1000).toFixed(1)} s`;
      try {
        const detail = await action();
        say(`${id} | ${label}: ok${detail ? `, ${detail}` : ""} (${took()})`);
        await snap(label);
      } catch (error) {
        const why = firstLine(error);
        failures.push(`${label}: ${why}`);
        say(`${id} | ${label}: FAIL, ${why} (${took()})`);
        await snap(`${label} FAIL`);
        throw new StepFailed(why);
      }
    },
  };
}

/** The main menu's Multiplayer card: its name is the card's own name followed by its line of small print (MainMenu.tsx). */
const MULTIPLAYER_CARD = { selector: 'nav[aria-label="Main menu"] button:has-text("Multiplayer")', name: /^Multiplayer/ };

/**
 * Main menu -> Multiplayer -> "Open a room" on the host card. Returns the room code, read from the join link the QR
 * code holds. The join card on the same screen has an alert line of its own, empty unless a join failed.
 */
async function hostOpensRoom(page, base) {
  await page.goto(base);
  await press(page, "open Multiplayer", MULTIPLAYER_CARD);
  await press(page, "open a room", { name: "Open a room" });
  const ready = await until(page, () => {
    const link = document.querySelector("img[data-join-url]")?.getAttribute("data-join-url");
    const label = document.querySelector('[aria-label^="Room code"]')?.textContent?.trim();
    const alert = [...document.querySelectorAll('main [role="alert"]')].map((node) => node.textContent?.trim() ?? "").find((line) => line !== "");
    return { link: link ?? null, label: label ?? null, alert: alert ?? "" };
  }, (found) => found.link !== null || found.label !== null || found.alert !== "", SCREEN_MS);
  if (!ready) throw new Error(`the room never opened, the page shows ${await page.evaluate(readWhere)}`);
  if (ready.link === null && ready.label === null) throw new Error(`the page says "${ready.alert}"`);
  const code = (ready.link ? new URL(ready.link).searchParams.get("room") : ready.label) ?? "";
  if (!/^[A-Z]{4}$/.test(code)) throw new Error(`the room code reads "${code}"`);
  return { code, link: ready.link };
}

/**
 * Sends the code on the join screen with Enter and waits for the answer: in the room, or the screen's own words for
 * why not. Enter joins the way the screen's first button does (with the camera when the page may ask for one;
 * here the camera is refused, so the guest gets the touch buttons).
 */
async function sendCode(page) {
  const input = page.locator('main input[maxlength="4"], main input').first();
  await input.waitFor({ timeout: SCREEN_MS });
  await input.press("Enter");
  const answer = await until(page, () => {
    const typing = Boolean(document.querySelector("main input"));
    const alert = [...document.querySelectorAll('main [role="alert"]')].map((node) => node.textContent?.trim() ?? "").find((line) => line !== "") ?? "";
    return { typing, alert };
  }, (found) => !found.typing || found.alert !== "", SCREEN_MS);
  if (!answer) throw new Error(`the join was never answered, the page shows ${await page.evaluate(readWhere)}`);
  return answer.typing ? { refused: answer.alert } : { refused: null };
}

/** Main menu -> Multiplayer -> the four letters, typed into the join card. */
async function guestTypesCode(page, base, code) {
  await page.goto(base);
  const how = await press(page, "open Multiplayer", MULTIPLAYER_CARD);
  const input = page.locator('main input[maxlength="4"], main input').first();
  await input.waitFor({ timeout: SCREEN_MS });
  await input.fill(code.toLowerCase());
  const typed = await input.inputValue();
  if (typed !== code) throw new Error(`the code box reads "${typed}" after typing "${code.toLowerCase()}"`);
  const answer = await sendCode(page);
  if (answer.refused !== null) throw new Error(`refused: "${answer.refused}"`);
  return how ? `the Multiplayer shield was ${how}` : "";
}

/** Runs in the page: which screen the host is on after "Start". */
function readHostScreen() {
  const has = (selector) => Boolean(document.querySelector(selector));
  const text = (selector) => document.querySelector(selector)?.textContent?.trim() ?? "";
  if (has(".fight canvas")) return { at: "fight" };
  if (has("button.scan-skip") || has("main.reveal")) return { at: "scan" };
  if (has(".character-picker")) return { at: "character" };
  if (has(".calibration")) return { at: "calibration" };
  if (has("button.stop")) return { at: "map" };
  if (has("main .styles button")) return { at: "style" };
  if (has('nav[aria-label="Main menu"]')) return { at: "menu", problem: text("main .overlay p") };
  if (has("main.mp, main .rooms")) return { at: "multiplayer" };
  return { at: "other" };
}

/**
 * The host's "Start" (live once the friend is in), then the way to the fight: the god scan (skipped), the character
 * already chosen ("Fight as ..."), the first style, the first open stop, calibration ("Use keyboard instead": nobody
 * stands in the test pattern), the fight.
 * "Start" is the button right after the room's status line; "Close the room" is live all the time and must not be
 * taken for it.
 *
 * "Start" starts the host's webcam. The character screen shows at once, and the god scan takes its place when the
 * camera is up. A character and a style picked before that would leave the camera to come up in the middle of the
 * fight, so the script waits for the scan. If the camera fails instead, the game leaves that screen: the step then
 * says where the page went.
 *
 * A host that is refused the camera (--no-host-camera) gets no scan and no calibration. The room must still be there
 * NO_CAMERA_MS after "Start", with the host on the character screen; from there it plays on the keyboard.
 */
async function hostStartsFight(page, hostCamera) {
  const friend = await until(page, () => {
    const start = document.querySelector('main [role="status"] + button') ?? [...document.querySelectorAll("main button")].find((button) => /^start/i.test(button.textContent?.trim() ?? ""));
    return { live: start instanceof HTMLButtonElement && !start.disabled, notice: document.querySelector('main [role="status"]')?.textContent?.trim() ?? "" };
  }, (found) => found.live, SCREEN_MS);
  if (!friend) throw new Error(`the host never saw the guest, the page shows ${await page.evaluate(readWhere)}`);
  await press(page, "start", { selector: 'main:has(img[data-join-url]) [role="status"] + button:enabled', name: /^start/i });
  await page.locator("img[data-join-url]").waitFor({ state: "detached", timeout: SCREEN_MS });
  const camera = await until(page, readHostScreen, (screen) => screen.at !== "character" && screen.at !== "style" && screen.at !== "other", hostCamera ? CAMERA_MS : NO_CAMERA_MS);
  if (camera?.at !== "scan" && (hostCamera || camera !== null)) {
    const where = camera === null ? `still shows ${await page.evaluate(readWhere).catch(() => "nothing")} after ${String(CAMERA_MS / 1000)} s`
      : camera.at === "menu" ? `is back on the main menu${camera.problem ? `, which says "${camera.problem}"` : ""}`
      : camera.at === "multiplayer" ? "is back on the Multiplayer screen with no room open"
      : `is on the ${camera.at} screen`;
    throw new Error(hostCamera ? `after "Start" the host's camera did not come up: its page ${where}` : `the host has no camera, and after "Start" its page ${where}`);
  }
  // A style button is the one with a line of small print under its name (the main menu's cards have one too, but
  // they sit in a nav).
  let styleName = "";
  let enemy = "";
  let character = "";
  try {
    if (camera !== null) await press(page, "skip the god scan", { selector: "button.scan-skip", name: /^skip/i });
    // The five characters come between the scan and the styles; the one already chosen is taken as it is.
    const done = page.locator("button.character-done").first();
    await done.waitFor({ timeout: SCREEN_MS });
    character = ((await done.textContent({ timeout: SCREEN_MS })) ?? "").trim().replace(/^fight as /i, "");
    await press(page, "confirm the character", { selector: "button.character-done", name: /^fight as/i });
    const style = page.locator("main button:has(small):not(nav button)").first();
    await style.waitFor({ timeout: SCREEN_MS });
    styleName = await style.evaluate((element) => element.firstChild?.textContent?.trim() ?? "", null, { timeout: SCREEN_MS });
    await style.click({ timeout: SCREEN_MS });
    const stop = page.locator("button.stop.open").first();
    await stop.waitFor({ timeout: SCREEN_MS });
    // The monster's name is the first text of the stop's name plate; the small print after it is the book.
    enemy = await stop.evaluate((element) => (element.querySelector(".qm-plate, .lbl")?.firstChild?.textContent ?? element.textContent ?? "").trim(), null, { timeout: SCREEN_MS });
    // The click on the stop starts the fight; with the camera on, calibration comes first.
    await stop.click({ timeout: SCREEN_MS });
    if (camera !== null) await press(page, "play on the keyboard at calibration", { selector: ".calibration button", name: "Use keyboard instead" });
    // The fight holds several canvases (the 3D view and the HUD's pebble pieces), so the first is waited for.
    await page.locator(".fight canvas").first().waitFor({ timeout: SCREEN_MS });
  } catch (error) {
    throw new Error(`after "Start" the host did not get from ${camera === null ? "the character screen" : "the god scan"} to the fight, its page shows ${await page.evaluate(readWhere).catch(() => "nothing")} (${firstLine(error)})`);
  }
  const way = camera === null ? "no camera, so no god scan and no calibration: the room is kept and the host plays on the keyboard" : "fake camera up, god scan skipped";
  return `"${friend.notice}", ${way}, character ${character}, style ${styleName}, against ${enemy}${camera === null ? "" : ", keyboard taken at calibration"}`;
}

/**
 * Both pages are read together until they show the same health, after the first hit of the fight (two full bars
 * would agree on a guest that draws nothing new). Throws with what each showed last.
 */
async function sameHealth(host, guest, ms) {
  const hit = await until(host, readHud, (hud) => hud.fight === true && (hud.over === true || hud.you < 100 || hud.monster < 100), FIRST_HIT_MS);
  if (!hit) throw new Error(`nobody was hit in the first ${String(FIRST_HIT_MS / 1000)} s of the fight`);
  const deadline = Date.now() + ms;
  let last = "";
  for (;;) {
    const [a, b] = await Promise.all([host.evaluate(readHud), guest.evaluate(readHud)]);
    if (a.fight && b.fight && same(a, b)) return { host: a, guest: b };
    last = `host shows you ${String(a.you)}%, monster ${String(a.monster)}%; guest shows ${b.fight ? `you ${String(b.you)}%, monster ${String(b.monster)}%` : "no fight"}`;
    if (Date.now() >= deadline) throw new Error(`the pages never agreed in ${String(ms / 1000)} s: ${last}`);
    await sleep(100);
  }
}

/** One run in two fresh browser contexts, so saved settings and errors never leak from one run into the next. */
async function runOne(browser, base, kind, index, moveKeys, capMs, poll, hostCamera, shots) {
  const pages = { host: null, guest: null };
  const run = newRun(`run ${String(index + 1)} ${kind}`, async (name) => {
    if (!shots) return;
    for (const [who, page] of Object.entries(pages)) {
      if (page && !page.isClosed()) await page.screenshot({ path: join(shots, `${name}-${who}.png`), timeout: POLL_TIMEOUT_MS }).catch(() => undefined);
    }
  });
  const hostContext = await browser.newContext({ ...HOST_VIEW, permissions: hostCamera ? ["camera"] : [] });
  const guestContext = await browser.newContext(GUEST_VIEW);
  // The stream answers and then says nothing, which is what a guest behind a quick tunnel gets.
  if (poll) await guestContext.route("**/api/rooms/*/events*", (route) => route.fulfill({ status: 200, contentType: "text/event-stream", body: "" }));
  const host = await hostContext.newPage();
  let guest = await guestContext.newPage();
  pages.host = host;
  pages.guest = guest;
  const hostSeen = watch(host, base);
  const guestSeen = watch(guest, base);
  // In the fight run the host only defends at first, so the first hit on the monster can only be the guest's.
  const hostSignal = { stop: false, defendOnly: kind === "fight" };
  let guestSignal = { stop: false };
  let hostPlay = null;
  let room = { code: "", link: null };
  let fightStarted = 0;

  const guestSeesFight = async () => {
    const seen = await until(guest, readHud, (hud) => hud.fight === true && (hud.over === true || hud.you !== null), SCREEN_MS);
    if (!seen) throw new Error(`the guest never saw the fight, its page shows ${await guest.evaluate(readWhere).catch(() => "nothing")}`);
    void strike(guest, moveKeys, guestSignal);
    return `${seen.touch ? "touch buttons" : "keyboard"}, ${((Date.now() - fightStarted) / 1000).toFixed(1)} s after the host's fight began`;
  };
  const guestStrikeLands = async () => {
    const hit = await until(host, readHud, (hud) => hud.fight === true && (hud.over === true || hud.monster < 100), FIRST_HIT_MS);
    hostSignal.defendOnly = false;
    if (!hit || hit.over) throw new Error(`the host threw no strike and the guest tapped its strike button for ${String(FIRST_HIT_MS / 1000)} s, but the monster on the host's page was never hit (guest strikes sent ${String(guestSeen.strikes)}, passed on ${String(guestSeen.delivered)})`);
    return `the host threw no strike, and the monster on its page is down to ${String(hit.monster)}% (guest strikes sent ${String(guestSeen.strikes)}, passed on ${String(guestSeen.delivered)}); the host strikes too from here`;
  };
  const guestFollows = async () => {
    const both = await sameHealth(host, guest, FOLLOW_MS);
    return `both pages show you ${String(both.host.you)}%, monster ${String(both.host.monster)}%`;
  };
  const fightEnds = async () => {
    const played = await hostPlay;
    if (played.result !== "won" && played.result !== "lost") throw new Error(`the host's fight ${played.result}${played.detail ? ` (${played.detail})` : ""} after ${(played.ms / 1000).toFixed(1)} s`);
    return `the host ${played.result} "${played.hud.title}" after ${(played.ms / 1000).toFixed(1)} s`;
  };
  const sameResult = async () => {
    const over = await until(guest, readHud, (hud) => hud.fight === true && hud.over === true, FOLLOW_MS);
    const hostHud = await host.evaluate(readHud);
    if (!over) throw new Error(`the guest never showed the result, its page shows ${await guest.evaluate(readWhere).catch(() => "nothing")}; host: ${shown(hostHud)}`);
    const line = `host: ${shown(hostHud)}; guest: ${shown(over)}`;
    if (!same(hostHud, over) || resultOf(hostHud) !== resultOf(over) || hostHud.score !== over.score) throw new Error(`the pages differ, ${line}`);
    await sleep(AFTER_MS);
    return `${line}; guest strikes sent ${String(guestSeen.strikes)}, passed on ${String(guestSeen.delivered)}`;
  };

  try {
    await run.step("host opens a room", async () => {
      room = await hostOpensRoom(host, base);
      return `code ${room.code}`;
    });
    await run.step("guest joins by typing the code", async () => {
      const how = await guestTypesCode(guest, base, room.code);
      const notice = await guest.evaluate(readNotice);
      return `${how ? `${how}, ` : ""}phone size ${String(GUEST_VIEW.viewport.width)}x${String(GUEST_VIEW.viewport.height)} with touch, ${poll ? "polling" : "event stream"}, page says "${notice}"`;
    });
    await run.step("host sees the guest and starts a fight", async () => {
      const detail = await hostStartsFight(host, hostCamera);
      fightStarted = Date.now();
      hostPlay = play(host, moveKeys, capMs, hostSignal);
      return detail;
    });
    await run.step("guest sees the fight", guestSeesFight);
    if (kind === "fight") await run.step("guest's strike lands in the host's fight", guestStrikeLands);
    await run.step("guest shows the host's health", guestFollows);

    if (kind === "rejoin") {
      await sleep(Math.max(0, MIDDLE_MS - (Date.now() - fightStarted)));
      let before = null;
      let atReturn = null;
      await run.step("guest drops (its page closes)", async () => {
        guestSignal.stop = true;
        await guest.close();
        // A clean fight is over in about half a minute and the seat is held for 20 s: the host only defends until the guest is back.
        hostSignal.defendOnly = true;
        before = await host.evaluate(readHud);
        return `${((Date.now() - fightStarted) / 1000).toFixed(1)} s into the fight; from here the host only defends, so the fight lasts until the guest is back`;
      });
      await run.step("host carries on alone", async () => {
        const moved = await until(host, readHud, (hud) => hud.fight === true && (hud.over === true || (hud.kind !== null && (hud.kind !== before.kind || hud.word !== before.word))), SCREEN_MS);
        if (!moved) throw new Error(`the host's fight stood still for ${String(SCREEN_MS / 1000)} s: ${shown(before)}`);
        return `the fight moved on to its next prompt (${moved.over ? "the result" : `${moved.kind}: ${moved.word}`})`;
      });
      await run.step("guest comes back by the room's link", async () => {
        guest = await guestContext.newPage();
        pages.guest = guest;
        guestSignal = { stop: false };
        watch(guest, base, guestSeen);
        guestSeen.expectFull = true;
        const started = Date.now();
        let words = "";
        await guest.goto(`${base}/?room=${room.code}`);
        for (;;) {
          const answer = await sendCode(guest);
          if (answer.refused === null) break;
          words = answer.refused;
          if (Date.now() - started >= REJOIN_MS) throw new Error(`still refused after ${String(REJOIN_MS / 1000)} s: "${words}"`);
          await sleep(REJOIN_EVERY_MS);
        }
        guestSeen.expectFull = false;
        atReturn = await host.evaluate(readHud);
        const waited = `${((Date.now() - started) / 1000).toFixed(1)} s after it first asked`;
        const fight = atReturn.over ? "the host's fight is already over" : `the host's fight is still on (you ${String(atReturn.you)}%, monster ${String(atReturn.monster)}%)`;
        return `${guestSeen.full === 0 ? `let in at once, ${waited}` : `refused ${String(guestSeen.full)} times with "${words}" (409, the seat is held 20 s), then let in ${waited}`}; ${fight}`;
      });
      await run.step("guest sees the fight again", async () => {
        if (atReturn.over) throw new Error("not checked: the host's fight was over before the guest was let back in");
        const seen = await until(guest, readHud, (hud) => hud.fight === true, FOLLOW_MS);
        if (!seen) throw new Error(`${String(FOLLOW_MS / 1000)} s after it was let back into a fight that was still on, the guest's page shows ${await guest.evaluate(readWhere)}`);
        hostSignal.defendOnly = false;
        void strike(guest, moveKeys, guestSignal);
        return `${seen.touch ? "touch buttons" : "keyboard"}; the host strikes again`;
      });
      await run.step("guest shows the host's health again", guestFollows);
    }

    if (kind === "host-leaves") {
      await sleep(Math.max(0, MIDDLE_MS - (Date.now() - fightStarted)));
      await run.step("host leaves (its page closes)", async () => {
        hostSignal.stop = true;
        await hostPlay;
        await host.close();
        return `${((Date.now() - fightStarted) / 1000).toFixed(1)} s into the fight`;
      });
      await run.step("guest is told the host left", async () => {
        const told = await until(guest, () => ({ fight: Boolean(document.querySelector(".fight")), notice: document.querySelector('main [role="status"]')?.textContent?.trim() ?? "" }), (found) => !found.fight && found.notice !== "", 30_000);
        if (!told) throw new Error(`30 s later the guest's page still shows ${await guest.evaluate(readWhere)}`);
        return `page says "${told.notice}"`;
      });
      await run.step("guest goes back to the start", async () => {
        guestSignal.stop = true;
        await press(guest, "leave", { selector: 'main:has([role="status"]) button', name: /back|leave/i });
        const title = await until(guest, () => ({ notice: Boolean(document.querySelector('main [role="status"]')), buttons: document.querySelectorAll("main button").length, heading: (document.querySelector("main h1")?.getAttribute("aria-label") ?? document.querySelector("main h1")?.textContent ?? "").trim() }), (found) => !found.notice && found.buttons >= 2, SCREEN_MS);
        if (!title) throw new Error(`the page shows ${await guest.evaluate(readWhere)}`);
        await sleep(AFTER_MS);
        return `page shows "${title.heading}" with ${String(title.buttons)} buttons`;
      });
    } else {
      await run.step("the fight ends", fightEnds);
      await run.step("both pages show the same result", sameResult);
    }
  } catch (error) {
    if (!(error instanceof StepFailed)) {
      run.failures.push(firstLine(error));
      say(`${run.id} | crashed: ${firstLine(error)}`);
    }
  } finally {
    hostSignal.stop = true;
    guestSignal.stop = true;
    await hostPlay?.catch(() => undefined);
    await hostContext.close().catch(() => undefined);
    await guestContext.close().catch(() => undefined);
  }
  return { id: run.id, kind, failures: run.failures, host: hostSeen, guest: guestSeen };
}

const errorCount = (seen) => seen.pageErrors.length + seen.consoleErrors.length + seen.badRequests.length;
const failed = (row) => row.failures.length > 0 || errorCount(row.host) > 0 || errorCount(row.guest) > 0;

function summary(row) {
  const counts = (who, seen) => `${who}: console errors ${String(seen.consoleErrors.length)}, page errors ${String(seen.pageErrors.length)}, failed requests ${String(seen.badRequests.length)}`;
  return `${row.id} | ${failed(row) ? "FAIL" : "PASS"} (${counts("host", row.host)}; ${counts("guest", row.guest)})`;
}

/** Every error text of a run, with repeats counted once. */
function details(row) {
  const parts = [];
  for (const [who, seen] of [["host", row.host], ["guest", row.guest]]) {
    for (const [what, list] of [["page error", seen.pageErrors], ["console error", seen.consoleErrors], ["failed request", seen.badRequests]]) {
      const counted = new Map();
      for (const text of list) counted.set(text, (counted.get(text) ?? 0) + 1);
      for (const [text, times] of counted) parts.push(`${row.id} | ${who}, ${what}${times > 1 ? ` (x${String(times)})` : ""}: ${text.replaceAll("\n", " ").slice(0, 400)}`);
    }
  }
  return parts;
}

async function main() {
  const capSeconds = Number(option("cap", "240"));
  const kinds = option("runs", Object.keys(RUNS).join(",")).split(",").filter(Boolean);
  const unknown = kinds.filter((kind) => !(kind in RUNS));
  if (kinds.length === 0 || unknown.length > 0) throw new Error(`--runs takes ${Object.keys(RUNS).join(", ")}${unknown.length > 0 ? `; not ${unknown.join(", ")}` : ""}`);
  const poll = flag("poll");
  const hostCamera = !flag("no-host-camera");
  const moveKeys = readMoveKeys();
  const chromium = loadChromium();
  const dev = flag("dev");
  const shots = option("shots", "") ? resolve(option("shots", "")) : null;
  if (shots) mkdirSync(shots, { recursive: true });
  let server = null;
  let devServer = null;
  let browser = null;
  const stopServer = () => { server?.child.kill(); devServer?.child.kill(); };
  process.on("exit", stopServer);
  process.on("SIGINT", () => process.exit(130));
  process.on("SIGTERM", () => process.exit(143));
  try {
    if (!dev && !flag("no-build")) {
      say("Building...");
      await build();
    }
    if (!dev && !existsSync(join(ROOT, "dist", "index.html"))) throw new Error("dist/ has no build: run without --no-build, or with --dev");
    const port = option("port", "") ? Number(option("port", "")) : await freePort();
    const api = `http://127.0.0.1:${String(port)}`;
    server = startServer(port);
    await waitForServer(`${api}/api/health`, server);
    let base = api;
    if (dev) {
      const devPort = await freePort();
      base = `http://127.0.0.1:${String(devPort)}`;
      devServer = startDev(devPort, api);
      await waitForServer(base, devServer);
    }
    say(`${dev ? `Server at ${api}, the source through vite dev at ${base}` : `Server and built game at ${base}`}; the guest's link uses ${poll ? "long polling (its event stream is kept silent)" : "the event stream"}; the host ${hostCamera ? "has Chrome's fake camera" : "is refused the camera"}`);
    const channel = process.env.FPS_CHANNEL ?? "chrome";
    browser = await chromium.launch({ headless: true, args: glArgs(), ...(channel ? { channel } : {}) });
    // One page first, as scripts/smoke.mjs does: it names the GPU, and the browser's first page load is not timed inside a run.
    const probe = await browser.newPage();
    await probe.goto(base);
    say(`WebGL renderer: ${await probe.evaluate(readRenderer)}`);
    await probe.close();
    const rows = [];
    for (const [index, kind] of kinds.entries()) {
      say(`\n${`run ${String(index + 1)} ${kind}`}: ${RUNS[kind]}`);
      const row = await runOne(browser, base, kind, index, moveKeys, capSeconds * 1000, poll, hostCamera, shots);
      rows.push(row);
      for (const line of details(row)) say(line);
      say(summary(row));
    }
    const bad = rows.filter(failed);
    if (bad.length > 0) {
      const relay = server.lines.filter((line) => /"level":"(warn|error)"/.test(line));
      if (relay.length > 0) say(`\nServer warnings and errors:\n${relay.join("\n")}`);
      say(`\nFAIL: ${bad.map((row) => row.id).join(", ")}`);
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
