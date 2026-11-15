// Offline check: proves the judged path asks the internet for nothing. Builds the game, serves dist with
// `vite preview`, opens it in headless Chrome with every request that is not localhost aborted, and plays a
// keyboard fight against Polyphemus by reading the prompt card. No AI server is started: the /api proxy is
// pointed at a closed port, so those calls fail the way they do when the server is down.
//
//   node scripts/offline-check.mjs [--no-build | --dev] [--no-camera] [--camera-seconds=75] [--max-seconds=240] [--json=<file>]
//
// --dev serves the source through vite's dev server instead of building (for a machine where a build is too heavy).
// The proxy is pointed at the same closed port. The built game is still the last word.
//
// Exit codes: 0 pass. 1 a request tried to leave localhost, or the page threw. 2 the check could not do its
// job (no accepted defend or strike, the fight did not end, the pose tracker did not start, a screen was missing).
// 3 Playwright not found. A run that stops part way still prints what it recorded, and exits 1 when that
// holds a request that tried to leave localhost or a page error, else 2.
//
// Playwright is found the way scripts/fps.mjs finds it, with the same environment:
//   FPS_PLAYWRIGHT  folder of a playwright or playwright-core install, used when the repo has neither
//   FPS_CHANNEL     browser channel (default "chrome"; "" uses Playwright's own Chromium)
//   FPS_GL          ANGLE backend (default d3d11 on Windows, metal on macOS; "swiftshader" forces software GL)
// What it found on a real run: docs/offline.md
import { existsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, createServer as createViteServer, preview } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VIEWPORT = { width: 1280, height: 720 };
const LOCAL = new Set(["localhost", "127.0.0.1"]);
const STOP = "Polyphemus";
/** What the engine adds to the score for a defend that held (src/combat/engine.ts). */
const DEFEND_SCORE = 50;
const POLL_MS = 30;
/** A strike card still up this long after a tap gets another tap (the finisher is offered again when missed). */
const RETAP_MS = 700;
/** A strike whose card is gone is given this long to show on the monster's bar before it counts as missed. */
const LAND_MS = 1000;
/** The files src/pose/tracker.ts asks for. They are copied into public/ by `make setup`, not kept in git. */
const POSE_FILES = ["mediapipe/pose_landmarker_lite.task", "mediapipe/wasm/vision_wasm_internal.wasm", "mediapipe/wasm/vision_wasm_internal.js"];

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const say = (line) => process.stdout.write(`${line}\n`);

/** The check itself failed (exit 2 or 3), as opposed to the game failing it (exit 1). */
class CheckError extends Error {
  constructor(message, code = 2) {
    super(message);
    this.code = code;
  }
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
  throw new CheckError("Playwright not found: point FPS_PLAYWRIGHT at an install outside the repo (.../node_modules/playwright-core).", 3);
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

function browserArgs() {
  const backend = process.env.FPS_GL ?? { win32: "d3d11", darwin: "metal" }[process.platform] ?? "";
  return [
    "--use-gl=angle", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", ...(backend ? [`--use-angle=${backend}`] : []),
    "--mute-audio",
    // The camera pass uses Chrome's built-in test pattern, never a real camera.
    "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
    // A second lock behind the request filter: names other than localhost do not resolve at all.
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
  ];
}

/** Aborts every request that is not localhost and writes down every request the context makes. */
async function guard(context, log, pass) {
  const entries = new WeakMap();
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (!/^(https?|wss?):$/.test(url.protocol)) return;
    const entry = {
      pass, url: request.url(), path: url.pathname, method: request.method(), type: request.resourceType(),
      ms: Date.now() - log.t0, stage: log.stage, external: !LOCAL.has(url.hostname), result: "no answer",
    };
    entries.set(request, entry);
    log.requests.push(entry);
  });
  context.on("response", (response) => {
    const entry = entries.get(response.request());
    if (entry) entry.result = String(response.status());
  });
  context.on("requestfailed", (request) => {
    const entry = entries.get(request);
    if (entry) entry.result = request.failure()?.errorText ?? "failed";
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return /^https?:$/.test(url.protocol) && !LOCAL.has(url.hostname) ? route.abort("internetdisconnected") : route.continue();
  });
}

function listen(page, log, pass) {
  page.on("pageerror", (error) => { log.pageErrors.push({ pass, ms: Date.now() - log.t0, stage: log.stage, text: String(error) }); });
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") log.console.push({ pass, ms: Date.now() - log.t0, stage: log.stage, type: message.type(), text: message.text() });
  });
  page.on("websocket", (socket) => {
    const url = new URL(socket.url());
    log.requests.push({ pass, url: socket.url(), path: url.pathname, method: "GET", type: "websocket", ms: Date.now() - log.t0, stage: log.stage, external: !LOCAL.has(url.hostname), result: "opened" });
  });
}

/** Which font files the element is really drawn with, asked from Chrome over the DevTools protocol. */
async function platformFonts(context, page, selector) {
  const session = await context.newCDPSession(page);
  try {
    await session.send("DOM.enable");
    await session.send("CSS.enable");
    const { root } = await session.send("DOM.getDocument");
    const { nodeId } = await session.send("DOM.querySelector", { nodeId: root.nodeId, selector });
    const { fonts } = await session.send("CSS.getPlatformFontsForNode", { nodeId });
    return fonts.map((font) => `${font.familyName} (${font.isCustomFont ? "a downloaded web font" : "installed on this machine"})`);
  } finally {
    await session.detach().catch(() => undefined);
  }
}

/**
 * Runs in the page: what the HUD shows right now. Every selector names the pebble HUD (hb-, pb-), the star-chart
 * HUD (sky-, sk-) and the forge bars (fg-) side by side. Health is read from the bars' meter role, which all of
 * them have: a whole percentage.
 */
function readHud() {
  const card = document.querySelector(".fight .hb-card, .fight .sky-card");
  const bars = [...document.querySelectorAll('.fight [role="meter"][aria-label$=" health"]')];
  const mine = (bar) => bar.getAttribute("aria-label") === "You health";
  const percent = (bar) => Number.parseFloat(bar?.getAttribute("aria-valuenow") ?? "");
  const ended = document.querySelector(".fight .overlay button") !== null;
  return {
    kind: card ? (card.matches(".pb-card--defend, .sky-card--defend") ? "defend" : "strike") : null,
    finish: card?.matches(".sky-card--finish") ?? false,
    key: card?.querySelector("kbd")?.textContent ?? null,
    word: card?.querySelector(".pb-move, .sky-card__word")?.textContent ?? "",
    target: card?.querySelector(".pb-target, .sky-card__target")?.textContent ?? "",
    score: Number.parseInt(document.querySelector(".fight .hb-score, .fight .sk-score__num, .fight .fg-score__num")?.textContent ?? "", 10),
    you: percent(bars.find(mine)),
    enemy: percent(bars.find((bar) => !mine(bar))),
    ended,
    heading: ended ? (document.querySelector(".fight .overlay h1")?.textContent ?? "") : "",
    learned: ended ? [...document.querySelectorAll(".fight .overlay .learned li")].map((item) => item.textContent ?? "") : [],
  };
}

/** The label on the card to the `event.key` the game listens for (see keyLabel in src/hud/Hud.tsx). */
/** The arrow keys are shown as glyphs on the cards (ARROWS in src/hud/sky/SkyPromptCard.tsx and src/coach/ui/keyName.ts). */
const ARROW_KEYS = { "←": "ArrowLeft", "→": "ArrowRight", "↓": "ArrowDown", "↑": "ArrowUp" };
const keyFor = (label) => ARROW_KEYS[label] ?? (label === "Space" ? " " : label.length === 1 ? label.toLowerCase() : label);

/** A win's headline: "Polyphemus falls", or for a stop the ship gets past, "Past the Sirens" (src/enemies/wording.ts). */
function wonHeading(heading) {
  return heading !== "" && heading !== "You are struck down";
}

/**
 * Plays by the prompt card: holds the key of a defend until the card changes, taps the key of a strike.
 * What the game accepted is read back from the HUD: a defend that held adds exactly 50 to the score and costs
 * no health; a strike that landed shortens the enemy's bar. The score is not read for a strike: the HUD holds it
 * back until the hero's blow lands on screen (useLandedScore in src/hud/RatingFlash.tsx), up to a second later.
 */
async function playFight(page, log, maxMs) {
  const tally = { defends: 0, strikes: 0, finisher: false, hitsTaken: 0, strikesMissed: 0, unclear: 0, keys: new Set() };
  const started = Date.now();
  let card = null;
  let held = null;
  // The strike whose card is gone and whose hit does not show on the monster's bar yet.
  let flying = null;
  // The "Finish it" card was answered; whether it landed is known when the fight is over.
  let finishing = false;
  for (;;) {
    const hud = await page.evaluate(readHud);
    if (flying && hud.enemy < flying.enemy) {
      tally.strikes += 1;
      flying = null;
    } else if (flying && (hud.ended || Date.now() > flying.until)) {
      tally.strikesMissed += 1;
      flying = null;
    }
    const id = hud.kind ? `${hud.kind}|${String(hud.key)}|${hud.word}|${hud.target}` : null;
    if (card && id !== card.id) {
      if (held !== null) {
        await page.keyboard.up(held);
        held = null;
      }
      if (card.kind === "defend") {
        if (hud.score === card.score + DEFEND_SCORE && hud.you === card.you) tally.defends += 1;
        else if (hud.you < card.you) tally.hitsTaken += 1;
        else tally.unclear += 1;
      } else if (card.finish || card.target === "Finish it") {
        // The win panel waits for the last blow to be seen (FightScreen), so it is not up yet when this card goes:
        // the finisher counts as landed when the fight then ends in a win.
        finishing = true;
      } else if (hud.enemy < card.enemy) tally.strikes += 1;
      else flying = { enemy: card.enemy, until: Date.now() + LAND_MS };
      card = null;
    }
    // A fight that runs out of time is handed back as it stands, so the tally and the requests still get printed.
    if (hud.ended || Date.now() - started > maxMs) {
      if (held !== null) await page.keyboard.up(held);
      if (flying) tally.strikesMissed += 1;
      const won = wonHeading(hud.heading);
      return { ...tally, finisher: finishing && hud.ended && won, keys: [...tally.keys], ended: hud.ended, won, heading: hud.heading, score: hud.score, learned: hud.learned, seconds: (Date.now() - started) / 1000 };
    }
    if (!card && id) {
      if (hud.key === null) throw new CheckError("the prompt card shows no key: key hints are off in the saved settings");
      log.firstPromptAt ??= Date.now() - log.t0;
      const key = keyFor(hud.key);
      tally.keys.add(hud.key);
      card = { id, kind: hud.kind, finish: hud.finish, target: hud.target, key, score: hud.score, you: hud.you, enemy: hud.enemy, tappedAt: Date.now() };
      if (hud.kind === "defend") {
        await page.keyboard.down(key);
        held = key;
      } else await page.keyboard.press(key);
    } else if (card?.kind === "strike" && Date.now() - card.tappedAt > RETAP_MS) {
      card.tappedAt = Date.now();
      await page.keyboard.press(card.key);
    }
    await page.waitForTimeout(POLL_MS);
  }
}

/** Main menu -> Story mode, with the "Play with" setting on Keyboard -> first style -> first stop (its click starts the fight) -> the fight to its end -> back to the map. */
async function keyboardPass(browser, base, log, maxMs) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await guard(context, log, "keyboard");
  const page = await context.newPage();
  listen(page, log, "keyboard");
  // Keyboard play is the "Play with" setting (Account, Settings), so Story mode starts on the keys and asks for no camera.
  await page.addInitScript(() => { localStorage.setItem("odyssey-dojo.settings", JSON.stringify({ controls: "keyboard" })); });
  log.stage = "title";
  await page.goto(base, { waitUntil: "load" });
  const keyboard = page.getByRole("button", { name: /^Story mode/ });
  await keyboard.waitFor();
  await page.waitForTimeout(1500);
  const fonts = {
    heading: await platformFonts(context, page, "main.menu h1"),
    button: await platformFonts(context, page, "main.menu button"),
    webFontsDeclared: await page.evaluate(() => document.fonts.size),
  };
  await keyboard.click();
  // The character screen comes between Story mode and the styles: the character already chosen is taken as it is.
  log.stage = "character";
  await page.locator("button.character-done").click();
  log.stage = "style";
  await page.getByRole("heading", { name: "Choose your fighting style" }).waitFor();
  // The first style card. The first button of the screen is "Back" and the last is "Change character".
  const styleButton = page.locator("main.menu button.flow-style").first();
  // textContent of the name, not innerText: the CSS may show it in upper case.
  const style = await styleButton.evaluate((element) => (element.querySelector(".menu-shield__name") ?? element).textContent?.trim() ?? "");
  await styleButton.click();
  log.stage = "map";
  await page.getByRole("heading", { name: "The Road Home" }).waitFor();
  await page.waitForTimeout(1000);
  // The first open stop on a fresh page is the first of the road; its button holds the monster's name.
  const stop = page.locator("button.stop.open").first().filter({ hasText: STOP });
  await stop.waitFor();
  // The fight begins with this click. The mark is set first, so nothing the click starts is timed before it.
  log.stage = "fight";
  log.fightAt = Date.now() - log.t0;
  await stop.click();
  // The fight holds several canvases (the 3D view and the HUD's pebble pieces), so the first is waited for.
  await page.locator(".fight canvas").first().waitFor();
  const fight = await playFight(page, log, maxMs);
  if (fight.ended) {
    log.stage = "result";
    await page.waitForTimeout(3000);
    // The score of the last blow shows only once it has landed, so the score is read again here.
    const final = (await page.evaluate(readHud)).score;
    if (Number.isFinite(final)) fight.score = final;
    await page.getByRole("button", { name: fight.won ? "Back to the map" : "Map", exact: true }).click();
    await page.getByRole("heading", { name: "The Road Home" }).waitFor();
    await page.waitForTimeout(1500);
  }
  await context.close();
  return { ...fight, style, fonts };
}

/**
 * The Story mode card with Chrome's fake camera (a moving test pattern, nobody in it). It shows that the pose
 * runtime and model load from localhost and start; it cannot show a real camera or a tracked person.
 * It stays `ms` after the tracker starts, because the pose library sends its first usage log after 60 s.
 */
async function cameraPass(browser, base, log, ms) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, permissions: ["camera"] });
  await guard(context, log, "camera");
  const page = await context.newPage();
  listen(page, log, "camera");
  log.stage = "camera";
  await page.goto(base, { waitUntil: "load" });
  // The Story mode card starts the webcam. Its name is the card's own name followed by its line of small print.
  await page.getByRole("navigation", { name: "Main menu" }).getByRole("button", { name: /^Story mode/ }).click();
  // The main menu stays up until the camera has started. A tracker that starts leads to the character screen (on a
  // build that still has the god scan, to the scan first); one that fails stays on the menu, under a card that says why.
  const scan = page.getByRole("button", { name: "Reveal my god" });
  const character = page.locator("button.character-done");
  const styles = page.getByRole("heading", { name: "Choose your fighting style" });
  const problem = page.locator("main .overlay").filter({ has: page.getByRole("button", { name: "Play on the keyboard" }) });
  await scan.or(character).or(problem).first().waitFor({ timeout: 90_000 });
  const scanned = await scan.isVisible();
  const started = scanned || await character.isVisible();
  const startedAt = Date.now();
  const notice = started ? "" : (await problem.first().locator("p").first().innerText()).trim();
  let god = "";
  let calibration = "";
  let ending = "";
  if (started) {
    if (scanned) {
      // The scan sends one picture to /api/reveal. No server answers, so the god must be chosen in the browser.
      await scan.click();
      const begin = page.getByRole("button", { name: "Begin the journey" });
      await begin.waitFor({ timeout: 40_000 });
      // The screen that names the god carries reveal-name on the page itself; before the storm restyle it was on the title.
      god = (await page.locator("main.reveal.reveal-name h1, main.reveal .reveal-name").first().evaluate((element) => element.getAttribute("aria-label") ?? element.textContent ?? "")).trim();
      await begin.click();
    }
    // The characters come before the styles; the one already chosen is taken as it is.
    await character.click();
    await styles.waitFor();
    await page.locator("main.menu button.flow-style").first().click();
    await page.locator("button.stop.open").first().filter({ hasText: STOP }).click();
    // Calibration feeds camera pictures to the model. Nobody is in the test pattern, so it only has to keep running.
    calibration = ((await page.locator(".calibration h1, .overlay h1").first().textContent()) ?? "").trim();
    await page.waitForTimeout(Math.max(0, ms - (Date.now() - startedAt)));
    ending = await page.evaluate(() => {
      if (document.querySelector(".fight .hud, .fight .sky-hud")) return "the fight";
      const heading = document.querySelector("h1");
      return (heading?.getAttribute("aria-label") ?? heading?.textContent ?? "").trim() || "nothing";
    });
  }
  await context.close();
  return { started, notice, god, calibration, ending, seconds: (Date.now() - startedAt) / 1000 };
}

function countBy(items, keyOf) {
  const counts = new Map();
  for (const item of items) counts.set(keyOf(item), (counts.get(keyOf(item)) ?? 0) + 1);
  return [...counts].map(([key, count]) => `${key} ${String(count)}`).join(", ");
}

const folderOf = (entry) => entry.path.split("/")[1] || "/";
const line = (entry) => `    ${(entry.ms / 1000).toFixed(1).padStart(6)} s  ${entry.stage.padEnd(7)} ${entry.type.padEnd(10)} ${entry.result.padEnd(4)} ${entry.method} ${entry.external ? entry.url : entry.path}`;
const isApi = (entry) => entry.path.startsWith("/api/") || entry.path.startsWith("/replays");

/** Prints what was recorded. `fight` and `camera` are null when their pass did not finish. */
function report(log, fight, camera, crash) {
  const external = log.requests.filter((entry) => entry.external);
  const local = log.requests.filter((entry) => !entry.external);
  const keyboard = local.filter((entry) => entry.pass === "keyboard");
  const failed = local.filter((entry) => !/^[23]\d\d$/.test(entry.result) && !isApi(entry));
  const list = (title, entries) => { say(`  ${title}: ${String(entries.length)}`); entries.forEach((entry) => { say(line(entry)); }); };

  if (fight) {
    say(`\nKeyboard fight against ${STOP} (style ${fight.style}): ${fight.ended ? (fight.won ? "won" : "lost") : "not over"} after ${fight.seconds.toFixed(1)} s, "${fight.heading}", score ${String(fight.score)}`);
    say(`  defends accepted ${String(fight.defends)}, strikes accepted ${String(fight.strikes)}, finisher ${fight.finisher ? "landed" : "not landed"}, hits taken ${String(fight.hitsTaken)}, strikes missed ${String(fight.strikesMissed)}, unclear ${String(fight.unclear)}`);
    say(`  keys used: ${fight.keys.join(" ")}`);
    if (fight.ended) say(`  end screen, moves learned: ${fight.learned.join(", ") || "none"}`);
  }
  say(`\nRequests: ${String(log.requests.length)} in all, ${String(external.length)} tried to leave localhost`);
  external.forEach((entry) => { say(line(entry)); });
  say(`  keyboard pass by folder: ${countBy(keyboard, folderOf)}`);
  say(`  keyboard pass by screen: ${countBy(keyboard, (entry) => entry.stage)}`);
  list("calls to the AI server in the keyboard pass (none is running)", keyboard.filter(isApi));
  list("other local requests that did not get a 2xx or 3xx", failed);
  if (log.fightAt !== null) {
    // Late fetches: the first ask for a file once the fight has begun. Asking again for a file is only counted.
    const seen = new Set(keyboard.filter((entry) => entry.ms < log.fightAt).map((entry) => entry.path));
    const late = keyboard.filter((entry) => entry.ms >= log.fightAt);
    const first = late.filter((entry) => !seen.has(entry.path) && seen.add(entry.path));
    list(`first asked for after the fight began (${(log.fightAt / 1000).toFixed(1)} s; first prompt card ${log.firstPromptAt === null ? "never" : `${(log.firstPromptAt / 1000).toFixed(1)} s`})`, first);
    say(`  asked for again after the fight began (files already fetched once): ${String(late.length - first.length)}`);
  }
  if (fight) say(`\nFonts: heading drawn with ${fight.fonts.heading.join(", ")}; buttons with ${fight.fonts.button.join(", ")}; web fonts declared by the page: ${String(fight.fonts.webFontsDeclared)}`);
  say(`Console errors and warnings: ${String(log.console.length)}`);
  new Set(log.console.map((entry) => `[${entry.pass} ${entry.type}] ${entry.text.slice(0, 200)}`)).forEach((text) => { say(`    ${text}`); });
  say(`Page errors: ${String(log.pageErrors.length)}`);
  log.pageErrors.forEach((entry) => { say(`    [${entry.pass} ${entry.stage}] ${entry.text}`); });
  if (flag("no-camera")) say("\nCamera pass: skipped (--no-camera)");
  else if (camera) {
    say(`\nCamera pass (Chrome's fake camera): pose tracker ${camera.started ? "started" : `did NOT start ("${camera.notice}")`}${camera.calibration ? `, ${camera.god ? `god scan chose "${camera.god}"` : "no god scan on this build"}, then "${camera.calibration}"; watched for ${camera.seconds.toFixed(0)} s, on screen at the end: ${camera.ending}` : ""}`);
    list("pose files asked for, all from localhost", local.filter((entry) => entry.pass === "camera" && entry.path.startsWith("/mediapipe/")));
    list("calls to the AI server in the camera pass (none is running)", local.filter((entry) => entry.pass === "camera" && isApi(entry)));
  } else say("\nCamera pass: not finished");
  if (crash) say(`\nStopped on the ${crash.stage} screen: ${crash.text}`);
}

/** Why the run fails, most serious first; empty when it passes. */
function verdict(log, fight, camera, crash) {
  const reasons = [];
  const external = log.requests.filter((entry) => entry.external);
  if (external.length > 0) reasons.push({ code: 1, text: `${String(external.length)} request(s) tried to leave localhost` });
  if (log.pageErrors.length > 0) reasons.push({ code: 1, text: `the page threw ${String(log.pageErrors.length)} error(s)` });
  if (crash) reasons.push({ code: 2, text: `the check stopped on the ${crash.stage} screen (${crash.text.split("\n")[0]})` });
  if (fight && !fight.ended) reasons.push({ code: 2, text: `the fight was not over after ${fight.seconds.toFixed(0)} s` });
  if (fight && (fight.defends < 1 || fight.strikes < 1)) reasons.push({ code: 2, text: `the game accepted ${String(fight.defends)} defend(s) and ${String(fight.strikes)} strike(s); at least one of each is needed` });
  if (fight?.ended) {
    const learned = fight.learned.reduce((sum, item) => sum + Number(/x(\d+)$/.exec(item)?.[1] ?? 0), 0);
    const counted = fight.defends + fight.strikes + (fight.finisher ? 1 : 0);
    if (learned !== counted) reasons.push({ code: 2, text: `the end screen lists ${String(learned)} moves done right, the script counted ${String(counted)}` });
  }
  if (camera && !camera.started) reasons.push({ code: 2, text: `the pose tracker did not start with the fake camera: "${camera.notice}"` });
  return reasons;
}

async function main() {
  const chromium = loadChromium();
  const maxMs = Number(option("max-seconds", "240")) * 1000;
  const dev = flag("dev");
  if (!flag("no-build") && !dev) {
    say("Building...");
    await build({ root: ROOT, logLevel: "error" });
  }
  const missing = POSE_FILES.filter((file) => !existsSync(join(ROOT, dev ? "public" : "dist", file)));
  if (!flag("no-camera") && missing.length > 0) throw new CheckError(`the build has no pose files (${missing.join(", ")}): run make setup once with a network connection, or pass --no-camera`);
  const port = await freePort();
  const closed = `http://127.0.0.1:${String(await freePort())}`;
  const base = `http://127.0.0.1:${String(port)}`;
  // `vite preview` takes the dev proxy from vite.config.ts. Pointing it at a closed port keeps a server that
  // happens to be running on this machine out of the test: /api answers 502, as it does with the server down.
  const options = { host: "127.0.0.1", port, strictPort: true, proxy: { "/api": closed, "/replays": closed } };
  const server = dev ? await (await createViteServer({ root: ROOT, logLevel: "silent", server: options })).listen() : await preview({ root: ROOT, logLevel: "silent", preview: options });
  const channel = process.env.FPS_CHANNEL ?? "chrome";
  const log = { t0: Date.now(), stage: "title", fightAt: null, firstPromptAt: null, requests: [], console: [], pageErrors: [] };
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true, args: browserArgs(), ...(channel ? { channel } : {}) });
    say(`Serving ${dev ? "the source through vite dev" : "dist"} at ${base} with no AI server. Browser: ${channel || "chromium"} ${browser.version()}, headless.`);
    say("Every request that is not localhost or 127.0.0.1 is aborted and listed.");
    let fight = null;
    let camera = null;
    let crash = null;
    try {
      fight = await keyboardPass(browser, base, log, maxMs);
      if (!flag("no-camera")) camera = await cameraPass(browser, base, log, Number(option("camera-seconds", "75")) * 1000);
    } catch (error) {
      // A game that cannot start with the network blocked ends up here. What was recorded is still printed.
      crash = { stage: log.stage, text: error instanceof Error ? error.message : String(error) };
    }
    report(log, fight, camera, crash);
    const reasons = verdict(log, fight, camera, crash);
    const file = option("json", "");
    if (file) writeFileSync(resolve(file), JSON.stringify({ base, browser: browser.version(), fight, camera, crash, reasons, ...log }, null, 2));
    say(reasons.length === 0 ? "\nPASS: nothing left localhost, the page did not throw, and the fight was played." : `\nFAIL: ${reasons.map((reason) => reason.text).join("; ")}.`);
    process.exitCode = reasons.length === 0 ? 0 : Math.min(...reasons.map((reason) => reason.code));
  } finally {
    await browser?.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof CheckError ? error.message : error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = error instanceof CheckError ? error.code : 2;
});
