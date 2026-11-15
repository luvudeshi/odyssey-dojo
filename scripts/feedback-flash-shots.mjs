// Pictures of the fight's feedback flash (src/hud/MissFlash.tsx, src/coach/extra/fightFlash.ts) over a real fight:
// starts the dev server on a free port, opens the first stop in Story mode on the keyboard, plays it, and saves
//   live-strike.png, live-defend.png   the flash the fight itself raised for a strike that landed and a defend that counted
//   excellent.png, great.png, good.png, needs-improvement.png   each grade, with a tip, raised over the same fight
// Keyboard play only ever earns one grade (a key press has one quality and no body to read), so the four grades are
// raised through the game's own `noteFeedback`, the call the fight makes: the same element, place and timing.
// For every picture it prints the flash's box and whether it is inside the screen and clear of the prompt card.
//
//   node scripts/feedback-flash-shots.mjs --shots=<folder> [--size=1280x720] [--url=http://127.0.0.1:5173] [--reduced]
//
// --url uses a dev server that is already running (it must be `vite`, not a build: the script imports a source
// module from it). --reduced asks the page for reduced motion. Exits non-zero when a picture could not be taken or
// a flash is cut off or over the card.
//
// Finding Playwright and Chrome and the free port are the same as in scripts/smoke.mjs, which exports nothing, so
// those small parts are copied here. The same environment names are read:
//   FPS_CHANNEL     browser channel for Playwright (default "chrome"; "msedge" also works, "" uses Playwright's own Chromium)
//   FPS_GL          ANGLE backend (default d3d11 on Windows, metal on macOS; "swiftshader" forces software GL)
//   FPS_PLAYWRIGHT  folder of a playwright or playwright-core install, used when the repo has neither
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VITE = join(ROOT, "node_modules", "vite", "bin", "vite.js");
const SCREEN_TIMEOUT_MS = 20_000;
/** How long the fight may take to raise a flash by itself. */
const LIVE_TIMEOUT_MS = 60_000;
/** A picture is taken this long after the flash comes up: past the pop, well inside the hold. */
const SETTLE_MS = 500;
const STORY_CARD = /^Story mode/;
/** The grades, with a tip as long as a tip may be (24 characters), so the widest case is the one looked at. */
const GRADES = [
  { file: "excellent", feedback: { grade: "EXCELLENT", points: 150, tip: "Clean. Guard stayed up" } },
  { file: "great", feedback: { grade: "GREAT", points: 100, tip: "Hands too low" } },
  { file: "good", feedback: { grade: "GOOD", points: 50, tip: "Turn your hips into it" } },
  { file: "needs-improvement", feedback: { grade: "NEEDS IMPROVEMENT", points: 25, tip: "Extend your arm fully" } },
];

const args = process.argv.slice(2);
const option = (name, fallback) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const say = (line) => process.stdout.write(`${line}\n`);
const sleep = (ms) => new Promise((next) => setTimeout(next, ms));

function firstOf(folder, fields) {
  const dir = join(ROOT, "src", folder, "defs");
  return readdirSync(dir).filter((file) => file.endsWith(".ts")).map((file) => {
    const source = readFileSync(join(dir, file), "utf8");
    return Object.fromEntries(fields.map((name) => [name, new RegExp(`^ {2}${name}: "?([^",]+)"?`, "m").exec(source)?.[1] ?? ""]));
  });
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

function glArgs() {
  const backend = process.env.FPS_GL ?? { win32: "d3d11", darwin: "metal" }[process.platform] ?? "";
  const list = ["--use-gl=angle", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"];
  if (backend) list.push(`--use-angle=${backend}`);
  return list;
}

/** Clicks the first button under `main` whose text holds one of `texts`. */
async function clickButton(page, texts, what) {
  const find = (wanted) => [...document.querySelectorAll("main button")].findIndex((button) => wanted.some((text) => text && (button.textContent ?? "").toLowerCase().includes(text.toLowerCase())));
  await page.waitForFunction((wanted) => {
    const buttons = [...document.querySelectorAll("main button")];
    return buttons.some((button) => wanted.some((text) => text && (button.textContent ?? "").toLowerCase().includes(text.toLowerCase())));
  }, texts, { timeout: SCREEN_TIMEOUT_MS }).catch(() => { throw new Error(`${what} did not come up`); });
  await page.locator("main button").nth(await page.evaluate(find, texts)).click();
}

/** Main menu -> Story mode (keyboard) -> the style offered first -> the first stop: its fight starts at once. */
async function enterFight(page, base) {
  const stop = firstOf("enemies", ["id", "name", "place", "order"]).filter((one) => one.id).sort((a, b) => Number(a.order) - Number(b.order))[0];
  const styles = firstOf("styles", ["name"]).map((one) => one.name).filter(Boolean);
  await page.addInitScript(() => { localStorage.setItem("odyssey-dojo.settings", JSON.stringify({ controls: "keyboard" })); });
  await page.goto(`${base}/?stop=${stop.id}`);
  await page.getByRole("button", { name: STORY_CARD }).click({ timeout: SCREEN_TIMEOUT_MS });
  // The style screen has shown the styles by name and as heroes ("Fight as Odysseus") at different times: either will do.
  await clickButton(page, ["Fight as ", ...styles], "the style screen");
  await clickButton(page, [stop.place, stop.name], "the map");
  await page.locator(".fight canvas").first().waitFor({ timeout: SCREEN_TIMEOUT_MS });
}

/** Runs in the page: the prompt card's kind and key, and whether the fight is over. */
function readCard() {
  const fight = document.querySelector(".fight");
  if (!fight) return { over: true };
  const hint = [...fight.querySelectorAll("kbd")].find((one) => !one.closest('[role="dialog"], button'));
  if (!hint) return { over: fight.querySelectorAll(".overlay button").length >= 2 };
  let box = hint.parentElement;
  while (box && box !== fight && !/defend|strike|finish/.test(box.className)) box = box.parentElement;
  const label = (hint.textContent ?? "").trim();
  return { over: false, defend: /defend/.test(box?.className ?? ""), key: label === "Space" ? " " : label.length === 1 ? label.toLowerCase() : label };
}

/** Runs in the page: the flash's box, the card's, and the screen's. */
function readFlash() {
  const box = (element) => {
    if (!element) return null;
    const r = element.getBoundingClientRect();
    return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) };
  };
  const flash = document.querySelector(".hb-feedback");
  const cards = [...document.querySelectorAll(".fight [class*='card']")].filter((one) => one.querySelector("kbd"));
  return { flash: box(flash), words: flash?.getAttribute("aria-label") ?? "", card: box(cards[0]), width: window.innerWidth, height: window.innerHeight, pointer: flash ? getComputedStyle(flash).pointerEvents : "" };
}

/**
 * Plays the fight by its prompt card (holds the defend key, presses the strike key) until `wanted(card)` was the
 * card when a flash came up, or the time runs out. Returns true when the flash is up.
 */
async function playUntilFlash(page, wanted, held) {
  const started = Date.now();
  let lastStrike = 0;
  while (Date.now() - started < LIVE_TIMEOUT_MS) {
    const card = await page.evaluate(readCard);
    if (card.over) return false;
    if (card.key && card.defend) {
      if (held.key !== card.key) {
        if (held.key) await page.keyboard.up(held.key);
        await page.keyboard.down(card.key);
        held.key = card.key;
      }
    } else {
      if (held.key) await page.keyboard.up(held.key);
      held.key = null;
      if (card.key && Date.now() - lastStrike > 150) {
        await page.keyboard.press(card.key);
        lastStrike = Date.now();
      }
    }
    if (card.key && wanted(card) && await page.evaluate(() => Boolean(document.querySelector(".hb-feedback")))) return true;
    await sleep(40);
  }
  return false;
}

async function main() {
  const shots = option("shots", "");
  if (!shots) throw new Error("say where the pictures go: --shots=<folder>");
  const out = resolve(shots);
  mkdirSync(out, { recursive: true });
  const [width, height] = option("size", "1280x720").split("x").map(Number);
  let base = option("url", "");
  let server = null;
  if (!base) {
    const port = await freePort();
    base = `http://127.0.0.1:${String(port)}`;
    server = spawn(process.execPath, [VITE, "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: ROOT, stdio: "ignore" });
    await waitForServer(base, server);
  }
  let browser = null;
  let failed = 0;
  try {
    const channel = process.env.FPS_CHANNEL ?? "chrome";
    browser = await loadChromium().launch({ headless: true, ...(channel ? { channel } : {}), args: glArgs() });
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: args.includes("--reduced") ? "reduce" : "no-preference" });
    const page = await context.newPage();
    await enterFight(page, base);
    const held = { key: null };
    const shoot = async (file, label) => {
      await sleep(SETTLE_MS);
      const seen = await page.evaluate(readFlash);
      await page.screenshot({ path: join(out, `${file}.png`) });
      const { flash, card } = seen;
      const inside = Boolean(flash) && flash.left >= 0 && flash.top >= 0 && flash.right <= seen.width && flash.bottom <= seen.height;
      const clear = Boolean(flash) && (!card || flash.right <= card.left || flash.bottom <= card.top || flash.top >= card.bottom);
      const ok = inside && clear && seen.pointer === "none";
      if (!ok) failed += 1;
      say(`${ok ? "PASS" : "FAIL"} ${label}: "${seen.words}" box ${JSON.stringify(flash)} card ${JSON.stringify(card)} inside=${String(inside)} clear-of-card=${String(clear)} pointer-events=${seen.pointer}`);
    };
    for (const [file, label, wanted] of [["live-strike", "the fight's own flash for a strike", (card) => !card.defend], ["live-defend", "the fight's own flash for a defend", (card) => card.defend]]) {
      if (await playUntilFlash(page, wanted, held)) await shoot(file, label);
      else { failed += 1; say(`FAIL ${label}: no flash came up in ${String(LIVE_TIMEOUT_MS / 1000)} s`); }
      // Let that flash go before the next one is looked for.
      await page.waitForFunction(() => !document.querySelector(".hb-feedback"), null, { timeout: 5000 }).catch(() => undefined);
    }
    if (held.key) await page.keyboard.up(held.key);
    for (const { file, feedback } of GRADES) {
      await page.evaluate(async (result) => { (await import("/src/hud/MissFlash.tsx")).noteFeedback(result); }, feedback);
      await shoot(file, feedback.grade);
      await sleep(1900);
    }
  } finally {
    await browser?.close().catch(() => undefined);
    server?.kill();
  }
  say(`${failed === 0 ? "PASS" : "FAIL"}: pictures in ${shots}`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
  say(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
