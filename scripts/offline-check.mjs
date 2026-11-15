// Offline check: proves the judged path asks the internet for nothing. Builds the game, serves dist with
// `vite preview`, opens it in headless Chrome with every request that is not localhost aborted, and plays a
// keyboard fight against Polyphemus by reading the prompt card. No AI server is started: the /api proxy is
// pointed at a closed port, so those calls fail the way they do when the server is down.
//
//   node scripts/offline-check.mjs [--no-build] [--no-camera] [--camera-seconds=75] [--max-seconds=240] [--json=<file>]
//
// Exit codes: 0 pass. 1 a request tried to leave localhost, or the page threw. 2 the check could not do its
// job (no accepted defend or strike, the pose tracker did not start, a screen was missing). 3 Playwright not found.
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
import { build, preview } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VIEWPORT = { width: 1280, height: 720 };
const LOCAL = new Set(["localhost", "127.0.0.1"]);
const STOP = "Polyphemus";
/** What the engine adds to the score for a defend that held (src/combat/engine.ts). */
const DEFEND_SCORE = 50;
const POLL_MS = 30;
/** A strike card still up this long after a tap gets another tap (the finisher is offered again when missed). */
const RETAP_MS = 700;
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
      ms: Date.now() - log.t0, stage: log.stage, afterFirstPrompt: log.firstPromptAt !== null, external: !LOCAL.has(url.hostname), result: "no answer",
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
    log.requests.push({ pass, url: socket.url(), path: url.pathname, method: "GET", type: "websocket", ms: Date.now() - log.t0, stage: log.stage, afterFirstPrompt: log.firstPromptAt !== null, external: !LOCAL.has(url.hostname), result: "opened" });
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

/** Runs in the page: what the HUD shows right now. */
function readHud() {
  const card = document.querySelector(".fight .hud .prompt");
  const width = (side) => Number.parseFloat(document.querySelector(`.fight .bar.${side} .bar-fill`)?.style.width ?? "");
  const ended = document.querySelector(".fight .overlay button") !== null;
  return {
    kind: card ? (card.classList.contains("defend") ? "defend" : "strike") : null,
    key: card?.querySelector("kbd")?.textContent ?? null,
    word: card?.querySelector(".prompt-word")?.textContent ?? "",
    target: card?.querySelector(".prompt-target")?.textContent ?? "",
    score: Number.parseInt(document.querySelector(".fight .score")?.textContent ?? "", 10),
    you: width("left"),
    enemy: width("right"),
    ended,
    heading: ended ? (document.querySelector(".fight .overlay h1")?.textContent ?? "") : "",
    learned: ended ? [...document.querySelectorAll(".fight .overlay .learned li")].map((item) => item.textContent ?? "") : [],
  };
}

/** The label on the card to the `event.key` the game listens for (see keyLabel in src/hud/Hud.tsx). */
const keyFor = (label) => (label === "Space" ? " " : label.length === 1 ? label.toLowerCase() : label);

/**
 * Plays by the prompt card: holds the key of a defend until the card changes, taps the key of a strike.
 * What the game accepted is read back from the HUD: a defend that held adds exactly 50 to the score and costs
 * no health; a strike that landed raises the score and shortens the enemy's bar.
 */
async function playFight(page, log, maxMs) {
  const tally = { defends: 0, strikes: 0, finisher: false, hitsTaken: 0, strikesMissed: 0, unclear: 0, keys: new Set() };
  const started = Date.now();
  let card = null;
  let held = null;
  for (;;) {
    if (Date.now() - started > maxMs) throw new CheckError(`the fight did not end in ${String(maxMs / 1000)} s`);
    const hud = await page.evaluate(readHud);
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
      } else if (card.target === "Finish it") {
        tally.finisher = hud.ended && hud.heading.endsWith("falls");
      } else if (hud.score > card.score && hud.enemy < card.enemy) tally.strikes += 1;
      else tally.strikesMissed += 1;
      card = null;
    }
    if (hud.ended) return { ...tally, keys: [...tally.keys], won: hud.heading.endsWith("falls"), heading: hud.heading, score: hud.score, learned: hud.learned, seconds: (Date.now() - started) / 1000 };
    if (!card && id) {
      if (hud.key === null) throw new CheckError("the prompt card shows no key: key hints are off in the saved settings");
      log.firstPromptAt ??= Date.now() - log.t0;
      const key = keyFor(hud.key);
      tally.keys.add(hud.key);
      card = { id, kind: hud.kind, target: hud.target, key, score: hud.score, you: hud.you, enemy: hud.enemy, tappedAt: Date.now() };
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

/** Title -> Keyboard only -> first style -> first stop -> intro -> the fight to its end -> back to the map. */
async function keyboardPass(browser, base, log, maxMs) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await guard(context, log, "keyboard");
  const page = await context.newPage();
  listen(page, log, "keyboard");
  log.stage = "title";
  await page.goto(base, { waitUntil: "load" });
  await page.getByRole("button", { name: "Keyboard only" }).waitFor();
  await page.waitForTimeout(1500);
  const fonts = {
    heading: await platformFonts(context, page, "main.menu h1"),
    button: await platformFonts(context, page, "main.menu button"),
    webFontsDeclared: await page.evaluate(() => document.fonts.size),
  };
  await page.getByRole("button", { name: "Keyboard only" }).click();
  log.stage = "style";
  await page.getByRole("heading", { name: "Choose your fighting style" }).waitFor();
  const styleButton = page.locator("main.menu button").first();
  const style = (await styleButton.innerText()).split("\n")[0].trim();
  await styleButton.click();
  log.stage = "map";
  await page.getByRole("heading", { name: "The Road Home" }).waitFor();
  await page.waitForTimeout(1000);
  await page.locator("button.stop.open").first().click();
  log.stage = "intro";
  await page.getByRole("button", { name: `Face ${STOP}` }).waitFor();
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: `Face ${STOP}` }).click();
  log.stage = "fight";
  log.fightAt = Date.now() - log.t0;
  await page.locator(".fight canvas").waitFor();
  const fight = await playFight(page, log, maxMs);
  log.stage = "result";
  await page.waitForTimeout(3000);
  await page.getByRole("button", { name: fight.won ? "Back to the map" : "Map", exact: true }).click();
  await page.getByRole("heading", { name: "The Road Home" }).waitFor();
  await page.waitForTimeout(1500);
  await context.close();
  return { ...fight, style, fonts };
}

/**
 * The webcam button with Chrome's fake camera (a moving test pattern, nobody in it). It shows that the pose
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
  await page.getByRole("button", { name: "Fight with your body (webcam)" }).click();
  // A tracker that starts leads to the god scan; one that fails leads straight to the style menu with a notice.
  const scan = page.getByRole("button", { name: "Reveal my god" });
  const styles = page.getByRole("heading", { name: "Choose your fighting style" });
  await scan.or(styles).waitFor({ timeout: 90_000 });
  const started = await scan.isVisible();
  const startedAt = Date.now();
  const notice = started ? "" : (await page.locator("main.menu .notice").innerText()).trim();
  let god = "";
  let calibration = "";
  if (started) {
    // The scan sends one picture to /api/reveal. No server answers, so the god must be chosen in the browser.
    await scan.click();
    const begin = page.getByRole("button", { name: "Begin the journey" });
    await begin.waitFor({ timeout: 40_000 });
    god = (await page.locator("main.reveal .reveal-name").innerText()).trim();
    await begin.click();
    await styles.waitFor();
    await page.locator("main.menu button").first().click();
    await page.locator("button.stop.open").first().click();
    await page.getByRole("button", { name: `Face ${STOP}` }).click();
    // Calibration feeds camera pictures to the model. Nobody is in the test pattern, so it only has to keep running.
    calibration = (await page.locator(".overlay h1").first().innerText()).trim();
    await page.waitForTimeout(Math.max(0, ms - (Date.now() - startedAt)));
  }
  await context.close();
  return { started, notice, god, calibration, seconds: (Date.now() - startedAt) / 1000 };
}

function countBy(items, keyOf) {
  const counts = new Map();
  for (const item of items) counts.set(keyOf(item), (counts.get(keyOf(item)) ?? 0) + 1);
  return [...counts].map(([key, count]) => `${key} ${String(count)}`).join(", ");
}

const folderOf = (entry) => entry.path.split("/")[1] || "/";
const line = (entry) => `    ${(entry.ms / 1000).toFixed(1).padStart(6)} s  ${entry.stage.padEnd(7)} ${entry.type.padEnd(10)} ${entry.result.padEnd(4)} ${entry.method} ${entry.external ? entry.url : entry.path}`;
const isApi = (entry) => entry.path.startsWith("/api/") || entry.path.startsWith("/replays");

function report(log, fight, camera) {
  const external = log.requests.filter((entry) => entry.external);
  const local = log.requests.filter((entry) => !entry.external);
  const keyboard = local.filter((entry) => entry.pass === "keyboard");
  const failed = local.filter((entry) => !/^[23]\d\d$/.test(entry.result) && !isApi(entry));
  const late = keyboard.filter((entry) => entry.afterFirstPrompt);
  const list = (title, entries) => { say(`  ${title}: ${String(entries.length)}`); entries.forEach((entry) => { say(line(entry)); }); };

  say(`\nKeyboard fight against ${STOP} (style ${fight.style}): ${fight.won ? "won" : "lost"} in ${fight.seconds.toFixed(1)} s, "${fight.heading}", score ${String(fight.score)}`);
  say(`  defends accepted ${String(fight.defends)}, strikes accepted ${String(fight.strikes)}, finisher ${fight.finisher ? "landed" : "not landed"}, hits taken ${String(fight.hitsTaken)}, strikes missed ${String(fight.strikesMissed)}, unclear ${String(fight.unclear)}`);
  say(`  keys used: ${fight.keys.join(" ")}`);
  say(`  end screen, moves learned: ${fight.learned.join(", ") || "none"}`);
  say(`\nRequests: ${String(log.requests.length)} in all, ${String(external.length)} tried to leave localhost`);
  external.forEach((entry) => { say(line(entry)); });
  say(`  keyboard pass by folder: ${countBy(keyboard, folderOf)}`);
  say(`  keyboard pass by screen: ${countBy(keyboard, (entry) => entry.stage)}`);
  list("calls to the AI server in the keyboard pass (none is running)", keyboard.filter(isApi));
  list("other local requests that did not get a 2xx or 3xx", failed);
  list(`asked for after the first prompt card (${((log.firstPromptAt ?? 0) / 1000).toFixed(1)} s)`, late);
  say(`\nFonts: heading drawn with ${fight.fonts.heading.join(", ")}; buttons with ${fight.fonts.button.join(", ")}; web fonts declared by the page: ${String(fight.fonts.webFontsDeclared)}`);
  say(`Console errors and warnings: ${String(log.console.length)}`);
  new Set(log.console.map((entry) => `[${entry.pass} ${entry.type}] ${entry.text.slice(0, 200)}`)).forEach((text) => { say(`    ${text}`); });
  say(`Page errors: ${String(log.pageErrors.length)}`);
  log.pageErrors.forEach((entry) => { say(`    [${entry.pass} ${entry.stage}] ${entry.text}`); });
  if (camera) {
    const pose = local.filter((entry) => entry.pass === "camera" && entry.path.startsWith("/mediapipe/"));
    say(`\nCamera pass (Chrome's fake camera): pose tracker ${camera.started ? "started" : `did NOT start ("${camera.notice}")`}${camera.calibration ? `, god scan chose "${camera.god}", then "${camera.calibration}"; watched for ${camera.seconds.toFixed(0)} s` : ""}`);
    list("pose files asked for, all from localhost", pose);
    list("calls to the AI server in the camera pass (none is running)", local.filter((entry) => entry.pass === "camera" && isApi(entry)));
  } else say("\nCamera pass: skipped (--no-camera)");
}

/** Why the run fails, most serious first; empty when it passes. */
function verdict(log, fight, camera) {
  const reasons = [];
  const external = log.requests.filter((entry) => entry.external);
  if (external.length > 0) reasons.push({ code: 1, text: `${String(external.length)} request(s) tried to leave localhost` });
  if (log.pageErrors.length > 0) reasons.push({ code: 1, text: `the page threw ${String(log.pageErrors.length)} error(s)` });
  if (fight.defends < 1 || fight.strikes < 1) reasons.push({ code: 2, text: `the game accepted ${String(fight.defends)} defend(s) and ${String(fight.strikes)} strike(s); at least one of each is needed` });
  const learned = fight.learned.reduce((sum, item) => sum + Number(/x(\d+)$/.exec(item)?.[1] ?? 0), 0);
  const counted = fight.defends + fight.strikes + (fight.finisher ? 1 : 0);
  if (learned !== counted) reasons.push({ code: 2, text: `the end screen lists ${String(learned)} moves done right, the script counted ${String(counted)}` });
  if (camera && !camera.started) reasons.push({ code: 2, text: `the pose tracker did not start with the fake camera: "${camera.notice}"` });
  return reasons;
}

async function main() {
  const chromium = loadChromium();
  const maxMs = Number(option("max-seconds", "240")) * 1000;
  if (!flag("no-build")) {
    say("Building...");
    await build({ root: ROOT, logLevel: "error" });
  }
  const missing = POSE_FILES.filter((file) => !existsSync(join(ROOT, "dist", file)));
  if (!flag("no-camera") && missing.length > 0) throw new CheckError(`the build has no pose files (${missing.join(", ")}): run make setup once with a network connection, or pass --no-camera`);
  const port = await freePort();
  const closed = `http://127.0.0.1:${String(await freePort())}`;
  const base = `http://127.0.0.1:${String(port)}`;
  // `vite preview` takes the dev proxy from vite.config.ts. Pointing it at a closed port keeps a server that
  // happens to be running on this machine out of the test: /api answers 502, as it does with the server down.
  const server = await preview({ root: ROOT, logLevel: "silent", preview: { host: "127.0.0.1", port, strictPort: true, proxy: { "/api": closed, "/replays": closed } } });
  const channel = process.env.FPS_CHANNEL ?? "chrome";
  const log = { t0: Date.now(), stage: "title", fightAt: null, firstPromptAt: null, requests: [], console: [], pageErrors: [] };
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true, args: browserArgs(), ...(channel ? { channel } : {}) });
    say(`Serving dist at ${base} with no AI server. Browser: ${channel || "chromium"} ${browser.version()}, headless.`);
    say("Every request that is not localhost or 127.0.0.1 is aborted and listed.");
    const fight = await keyboardPass(browser, base, log, maxMs);
    const camera = flag("no-camera") ? null : await cameraPass(browser, base, log, Number(option("camera-seconds", "75")) * 1000);
    report(log, fight, camera);
    const reasons = verdict(log, fight, camera);
    const file = option("json", "");
    if (file) writeFileSync(resolve(file), JSON.stringify({ base, browser: browser.version(), fight, camera, reasons, ...log }, null, 2));
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
