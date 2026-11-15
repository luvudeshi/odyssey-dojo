// Smoke run: builds the game, serves it with `vite preview`, and plays every stop from start to end by keyboard
// in a headless browser. Prints one line per fight (result, seconds, console errors) and writes docs/smoke.md.
//
//   node scripts/smoke.mjs [--no-build | --dev] [--stops=polyphemus,scylla] [--styles=all|boxer,karate] [--cap=240] [--no-write]
//                          [--port=4393] [--query=ghost=1] [--shots=<folder>]
//
// --dev serves the source through vite's dev server instead of building (for a machine where a build is too heavy;
// the pages then run React's development build, so the built game is still the last word).
// --styles=all plays every stop with every fighting style (6 stops by 5 styles is 30 fights); a comma list of style
// ids plays those; left out, each stop is played once with the first style on the style screen.
// --query adds its text to the page address (for a switch such as ghost=1); --shots saves one picture per fight,
// taken while a prompt card is up, into that folder.
//
// Exits non-zero when any fight has a page error, a console error, a request that failed or answered 4xx/5xx
// (a 404 fails the run), a page that stopped answering, a fight that did not end inside the cap, or a fight in which
// the script never saw a prompt card (then it pressed nothing, which means it no longer understands the HUD).
// One lost fight does not fail the run, and neither does a stop the map keeps locked ("not playable"); but a run
// in which every fight was lost fails, because a bot that reads the prompts wins most of them.
//
// The screens are found by what the game itself defines (style names, stop names and places, prompt words and keys,
// all read from src/), by roles and by structure, not by headings or CSS looks, so a restyle should not break it.
//
// Finding Playwright, the build, the preview server on a free port and the way into a stop are the same as in
// scripts/fps.mjs. That file exports nothing and runs on import, so those small parts are copied here.
//
// Environment (the same names as scripts/fps.mjs):
//   FPS_CHANNEL     browser channel for Playwright (default "chrome"; "msedge" also works, "" uses Playwright's own Chromium).
//                   Here it may also be a comma list ("chrome,msedge"): the fights are played in each, one after the other.
//   FPS_GL          ANGLE backend (default d3d11 on Windows, metal on macOS; "swiftshader" forces software GL)
//   FPS_PLAYWRIGHT  folder of a playwright or playwright-core install, used when the repo has neither
//   FPS_MACHINE     a name for the machine, printed in docs/smoke.md
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
/** How long each screen on the way into a fight may take to come up. */
const SCREEN_TIMEOUT_MS = process.argv.includes("--dev") ? 45_000 : 15_000;
/** With --shots: the picture is taken on this prompt card of the fight, once it has been up this long. */
const SHOT_CARD = 5;
const SHOT_AFTER_MS = 500;
/** The main menu's way in without a webcam: the name of the link under the four cards (src/screens/MainMenu.tsx). */
const STORY_CARD = /^Story mode/;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
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
      return { id: field(/^ {2}id: "([^"]+)"/m), name: field(/^ {2}name: "([^"]+)"/m), place: field(/^ {2}place: "([^"]+)"/m) ?? "", order: Number(field(/^ {2}order: ([\d.]+)/m)) };
    })
    .filter((stop) => stop.id && stop.name)
    .sort((a, b) => a.order - b.order)
    .map((stop, index) => ({ ...stop, index }));
}

/** The fighting styles (id and the name shown on the style screen), read from the style definitions. */
function readStyles() {
  const dir = join(ROOT, "src", "styles", "defs");
  return readdirSync(dir)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => {
      const source = readFileSync(join(dir, file), "utf8");
      return { id: /^ {2}id: "([^"]+)"/m.exec(source)?.[1], name: /^ {2}name: "([^"]+)"/m.exec(source)?.[1] };
    })
    .filter((style) => style.id && style.name);
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
    if (server.exitCode !== null) throw new Error("vite stopped before it answered");
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((next) => setTimeout(next, 200));
  }
  throw new Error(`vite did not answer at ${url}`);
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

/** Runs in the page: the first button under `main` whose text, tooltip or label holds one of `texts`. */
function findButton(texts) {
  const buttons = [...document.querySelectorAll("main button")];
  const says = (button) => `${button.textContent ?? ""}
${button.title}
${button.getAttribute("aria-label") ?? ""}`.toLowerCase();
  const index = buttons.findIndex((button) => texts.some((text) => text && says(button).includes(text.toLowerCase())));
  return index < 0 ? null : { index, disabled: buttons[index].disabled, text: (buttons[index].textContent ?? "").trim() };
}

/**
 * Runs in the page: which screen follows Story mode. The character screen is the one with a button that starts
 * "Fight as" (it confirms the character already chosen); the style screen is the one with a button that starts with
 * a style's name. The character screen is looked for first: a character's card may name a style.
 */
function afterStory(styleNames) {
  const buttons = [...document.querySelectorAll("main button")];
  const text = (button) => (button.textContent ?? "").trim();
  const confirm = buttons.findIndex((button) => /^fight as\b/i.test(text(button)));
  if (confirm >= 0) return { at: "character", index: confirm, text: text(buttons[confirm]) };
  const style = buttons.findIndex((button) => styleNames.some((name) => text(button).toLowerCase().startsWith(name.toLowerCase())));
  return style < 0 ? null : { at: "style", index: style, text: text(buttons[style]) };
}

async function waitForButton(page, texts, what) {
  try {
    await page.waitForFunction(findButton, texts, { timeout: SCREEN_TIMEOUT_MS });
  } catch {
    throw new Error(`${what} did not come up`);
  }
  const found = await page.evaluate(findButton, texts);
  return { ...found, locator: page.locator("main button").nth(found.index) };
}

/**
 * Main menu -> Story mode, with the "Play with" setting on Keyboard -> the character ("Fight as ...", taken as it is)
 * -> the style -> this stop on the map -> fight. A stop on the map starts its fight at once. Returns the name of the style picked, or null when the map keeps this stop locked (a stop
 * with no 3D model stays locked, see `playable` in flow.ts). `style` null means the first style the screen offers.
 *
 * Nothing here reads a heading or a CSS look. Story mode is the button whose name starts with that (see MainMenu.tsx), the
 * style card is the button that starts with a style's name, the stop is the button that holds the stop's place or its
 * monster's name: those two texts come from the game's own definitions in src/. A locked stop is a disabled button.
 */
async function enterFight(page, base, stop, style, styles, query) {
  // Keyboard play is the "Play with" setting (Account, Settings), so Story mode starts on the keys and asks for no camera.
  await page.addInitScript(() => { localStorage.setItem("odyssey-dojo.settings", JSON.stringify({ controls: "keyboard" })); });
  await page.goto(`${base}/?stop=${stop.id}${query ? `&${query}` : ""}`);
  const story = page.getByRole("button", { name: STORY_CARD });
  await story.waitFor({ timeout: SCREEN_TIMEOUT_MS }).catch(() => { throw new Error("the main menu has no Story mode card"); });
  await story.click();

  // The character screen ("Fight as ...") comes between Story mode and the styles: the character already chosen is
  // taken as it is. A build without that screen goes straight to the styles, and that will do as well.
  const offered = style ? [style] : styles;
  await page.waitForFunction(afterStory, offered.map((one) => one.name), { timeout: SCREEN_TIMEOUT_MS }).catch(() => { throw new Error("neither the character screen nor the style screen came up after Story mode"); });
  const confirm = await page.evaluate(afterStory, offered.map((one) => one.name));
  if (confirm.at === "character") {
    const done = page.locator("main button").nth(confirm.index);
    const handle = await done.elementHandle();
    await done.click();
    await page.waitForFunction((element) => !element.isConnected, handle, { timeout: SCREEN_TIMEOUT_MS }).catch(() => { throw new Error(`the character screen did not close after "${confirm.text}" was clicked`); });
  }
  const card = await waitForButton(page, offered.map((one) => one.name), "the style screen");
  const picked = offered.find((one) => card.text.toLowerCase().startsWith(one.name.toLowerCase())) ?? offered[0];
  await card.locator.click();

  // The map has shown the stop by its place and by its monster's name at different times: either will do.
  const onMap = await waitForButton(page, [stop.place, stop.name], `the map with the stop "${stop.name}"`);
  if (onMap.disabled) return null;
  const mapButton = await onMap.locator.elementHandle();
  await onMap.locator.click();
  await page.waitForFunction((element) => !element.isConnected, mapButton, { timeout: SCREEN_TIMEOUT_MS }).catch(() => { throw new Error("the map did not close after the stop was clicked"); });

  // The click on the stop starts the fight. Where the build plays a boss cutscene first, it ends by itself well inside the wait.
  await page.locator(".fight canvas").first().waitFor({ timeout: SCREEN_TIMEOUT_MS }).catch(() => { throw new Error(`the fight did not open after "${stop.name}" was clicked on the map`); });
  return picked.name;
}

/**
 * Runs in the page: what the fight shows right now.
 *
 * `over` is the result panel: a layer of the fight that holds two or more buttons outside a dialog (the pause menu
 * and the settings are dialogs; the camera panel holds one button). It is a loss when one of them offers the fight
 * again. The number of buttons says nothing: a win has "Your god card" next to the map and the style.
 *
 * The prompt card is found by structure, so it is the same code for the first HUD (`.prompt.defend`), the pebble card
 * (`.pb-card--defend`) and the star-chart card (`.sky-card--defend`): the nearest box around the key hint (`kbd`), or
 * around a known prompt word, whose class names end in defend, strike or finish. A defense also carries a HOLD tag.
 */
function readHud(words) {
  const fight = document.querySelector(".fight") ?? document.body;
  const clean = (element) => (element?.textContent ?? "").trim();
  // The fight's own children are its layers (scene, HUD, camera panel, overlays): the buttons are grouped by layer.
  const layers = new Map();
  for (const button of fight.querySelectorAll("button")) {
    if (button.closest('[role="dialog"]')) continue;
    let layer = button;
    while (layer.parentElement && layer.parentElement !== fight) layer = layer.parentElement;
    layers.set(layer, [...(layers.get(layer) ?? []), button]);
  }
  const [panel, buttons] = [...layers].find(([, list]) => list.length >= 2) ?? [null, []];
  if (panel) {
    const heading = panel.querySelector('h1, [role="heading"], [class*="title"]');
    return {
      over: true,
      won: !buttons.some((button) => /again|retry/i.test(clean(button))),
      title: clean(heading) || heading?.getAttribute("aria-label") || "",
      canvas: Boolean(fight.querySelector("canvas")),
    };
  }
  const KIND = /(?:^|[-_])(defend|strike|finish|finisher)$/;
  const kindOf = (element) => {
    for (const name of element.classList) {
      const match = KIND.exec(name);
      if (match) return match[1] === "defend" ? "defend" : "strike";
    }
    return null;
  };
  const cardAround = (element) => {
    for (let box = element; box && box !== fight; box = box.parentElement) if (kindOf(box)) return box;
    return null;
  };
  const inPlay = (element) => !element.closest('[role="dialog"], button');
  let card = null;
  for (const hint of fight.querySelectorAll("kbd")) {
    if (inPlay(hint)) card = cardAround(hint);
    if (card) break;
  }
  let word = "";
  if (card) {
    word = [...card.querySelectorAll("*")].map(clean).find((text) => words.includes(text)) ?? "";
  } else {
    // Key hints are off: look for the prompt word itself.
    for (const element of fight.querySelectorAll("div, span, strong, b, p")) {
      if (element.childElementCount > 0 || !words.includes(clean(element)) || !inPlay(element)) continue;
      card = cardAround(element);
      if (card) { word = clean(element); break; }
    }
  }
  if (!card) return { over: false, kind: null };
  const hold = [...card.querySelectorAll("strong, b")].some((element) => clean(element) === "HOLD");
  return { over: false, kind: hold ? "defend" : kindOf(card), word, label: clean(card.querySelector("kbd")) };
}

/** The arrow keys are shown as glyphs on the cards (ARROWS in src/hud/sky/SkyPromptCard.tsx and src/coach/ui/keyName.ts). */
const ARROW_KEYS = { "←": "ArrowLeft", "→": "ArrowRight", "↓": "ArrowDown", "↑": "ArrowUp" };

/** The reverse of the card's key hint: "Space" is the space bar, an arrow is its glyph, a letter is shown in upper case. */
function keyFor(hud, moveKeys) {
  if (hud.label === "Space") return " ";
  if (ARROW_KEYS[hud.label]) return ARROW_KEYS[hud.label];
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
async function play(page, moveKeys, capMs, shotPath) {
  const started = Date.now();
  const words = Object.keys(moveKeys);
  let held = null;
  let lastStrike = 0;
  // How many prompt cards came up, counted by the card changing (kind and word) or going away and coming back.
  let cards = 0;
  let showing = "";
  let since = 0;
  let shot = !shotPath;
  const unknown = new Set();
  const release = async () => {
    if (held !== null) await page.keyboard.up(held);
    held = null;
  };
  try {
    for (;;) {
      const elapsed = Date.now() - started;
      if (elapsed >= capMs) return { result: "never ended", ms: elapsed, unknown, cards };
      let hud;
      try {
        hud = await withTimeout(page.evaluate(readHud, words), POLL_TIMEOUT_MS, "poll timed out");
      } catch (error) {
        return { result: "hung", ms: Date.now() - started, unknown, cards, detail: error instanceof Error ? error.message.split("\n")[0] : String(error) };
      }
      if (hud.over) return { result: hud.won ? "won" : "lost", ms: Date.now() - started, unknown, cards, title: hud.title, canvas: hud.canvas };
      const now = hud.kind ? `${hud.kind} ${hud.word}` : "";
      if (now !== showing) {
        showing = now;
        since = Date.now();
        if (now) cards += 1;
      }
      if (!shot && now && cards >= SHOT_CARD && Date.now() - since >= SHOT_AFTER_MS) {
        shot = true;
        await page.screenshot({ path: shotPath }).catch(() => undefined);
      }
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

/** One fight in its own browser context, so saved settings and errors never leak from one fight into the next. */
async function runFight(browser, base, stop, style, styles, moveKeys, run) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    const seen = watch(page, base);
    const row = { stop: stop.id, result: "", seconds: null, style: style?.name ?? "", cards: null, note: "", ...seen };
    try {
      const picked = await enterFight(page, base, stop, style, styles, run.query);
      if (picked === null) {
        row.result = "not playable";
        row.note = "the map keeps this stop locked on this build (no 3D model yet)";
        return row;
      }
      row.style = picked;
      const shotPath = run.shots ? join(run.shots, `${run.channel || "chromium"}-${stop.id}-${picked.toLowerCase().replaceAll(" ", "-")}.png`) : null;
      const played = await play(page, moveKeys, run.capMs, shotPath);
      row.result = played.result;
      row.seconds = played.ms / 1000;
      row.cards = played.cards;
      const notes = [];
      if (played.title) notes.push(`"${played.title}"`);
      if (played.detail) notes.push(played.detail);
      if (played.cards === 0) notes.push("no prompt card seen, so no key was pressed");
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
  row.result === "never ended" || row.result === "hung" || row.result === "crashed" || row.cards === 0 ||
  row.pageErrors.length > 0 || row.consoleErrors.length > 0 || row.badRequests.length > 0;

/** Every fight that was played was lost: the bot answers each prompt, so this means it can no longer play. */
const allLost = (rows) => {
  const fought = rows.filter((row) => row.result === "won" || row.result === "lost");
  return fought.length > 0 && fought.every((row) => row.result === "lost");
};

const seconds = (row) => (row.seconds === null ? "-" : row.seconds.toFixed(1));
const fightName = (row) => (row.style ? `${row.stop} as ${row.style}` : row.stop);

function line(row) {
  const counts = `console errors ${String(row.consoleErrors.length)}, page errors ${String(row.pageErrors.length)}, failed requests ${String(row.badRequests.length)}`;
  const time = row.seconds === null ? "" : ` in ${seconds(row)} s`;
  return `${fightName(row)}: ${row.result}${time}, ${counts}${row.note ? ` (${row.note})` : ""}${failed(row) ? "  FAIL" : ""}`;
}

const cell = (text) => text.replaceAll("|", "\\|").replaceAll("\n", " ");

function table(rows) {
  return [
    "| stop | style | result | seconds | prompt cards | console errors | page errors | failed requests | note |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ...rows.map((row) => `| ${row.stop} | ${row.style || "-"} | ${failed(row) ? `**${row.result}**` : row.result} | ${seconds(row)} | ${row.cards === null ? "-" : String(row.cards)} | ${String(row.consoleErrors.length)} | ${String(row.pageErrors.length)} | ${String(row.badRequests.length)} | ${cell(row.note)} |`),
  ].join("\n");
}

/** Every error text, grouped by fight, with repeats counted once. */
function details(rows) {
  const parts = [];
  for (const row of rows) {
    const groups = [["page error", row.pageErrors], ["console error", row.consoleErrors], ["failed request", row.badRequests]];
    for (const [kind, list] of groups) {
      const counted = new Map();
      for (const text of list) counted.set(text, (counted.get(text) ?? 0) + 1);
      for (const [text, times] of counted) parts.push(`- **${fightName(row)}**, ${kind}${times > 1 ? ` (x${String(times)})` : ""}: \`${text.replaceAll("`", "'").replaceAll("\n", " ").slice(0, 400)}\``);
    }
  }
  return parts;
}

/** One line for a browser's fights: what failed, or how many were won. */
function verdict(rows) {
  const bad = rows.filter(failed);
  const fought = rows.filter((row) => row.result === "won" || row.result === "lost");
  const won = fought.filter((row) => row.result === "won").length;
  if (bad.length > 0) return `**Fail:** ${bad.map((row) => `**${fightName(row)}** (${row.result})`).join(", ")}.`;
  if (allLost(rows)) return `**Fail:** every fight was lost (${String(fought.length)} of ${String(fought.length)}). The script answers each prompt, so it should win most fights: either it no longer reads the prompt card, or the fights cannot be won.`;
  return `**Pass.** ${String(won)} of ${String(fought.length)} fights won; none crashed, hung or logged an error.`;
}

const passed = (rows) => rows.every((row) => !failed(row)) && !allLost(rows);

/** One browser's part of the report. */
function section(part) {
  const { rows } = part;
  const locked = [...new Set(rows.filter((row) => row.result === "not playable").map((row) => row.stop))];
  const lost = rows.filter((row) => row.result === "lost").map(fightName);
  const notPlayed = locked.length === 0 ? "" : `\n\nNot played: ${locked.join(", ")}. The map keeps a stop locked until its 3D model exists, so there is no fight to open; this does not fail the run. Run this again when the models land.`;
  const lostPart = lost.length === 0 || allLost(rows) ? "" : `\n\nLost: ${lost.join(", ")}. A lost fight still ended cleanly, so it does not fail the run.`;
  const errors = details(rows);
  const errorPart = errors.length === 0 ? "" : `\n\n### Errors seen\n\n${errors.join("\n")}`;
  return `## ${part.browser}

- **WebGL renderer:** \`${part.renderer}\`

${verdict(rows)}${notPlayed}${lostPart}

${table(rows)}${errorPart}`;
}

function report(parts, run) {
  return `# Smoke run

Written by \`node scripts/smoke.mjs\`. Do not edit by hand: run it again.

- **When:** ${run.when}
- **Commit:** ${run.commit}
- **Machine:** ${run.machine}
- **Browsers:** ${parts.map((part) => part.browser).join("; ")}; headless, started with \`${run.flags.join(" ")}\`
- **Play:** ${String(VIEWPORT.width)}x${String(VIEWPORT.height)}, keyboard only (no camera, no pose tracking), ${run.styles}, cap ${String(run.capSeconds)} s per fight${run.query ? `, page opened with \`${run.query}\`` : ""}

${parts.map(section).join("\n\n")}

## How to read it

- Each fight is opened at \`/?stop=<id>\` in a fresh browser context: the main menu with the "Play with" setting on Keyboard, Story mode, the character screen ("Fight as ...", the character already chosen), the style, then the open stop on the map. The click on the stop plays the boss cutscene, which ends by itself, and then the fight starts. \`--styles=all\` plays every stop with every style; without it each stop is played once, with the first style on the style screen.
- The script finds the screens by what the game defines in \`src/\`: the style card is the button that starts with the style's name, the stop is the button that holds the stop's place or its monster's name. The keyboard link on the main menu is found by its name. The prompt card is the box around the key hint whose class ends in defend, strike or finish, and the result panel is the layer of the fight that holds two or more buttons outside a dialog. No heading and no colour is read, so a new look should not break it.
- The script plays for real. Every ${String(POLL_MS)} ms it reads the prompt card, holds the key of the defense it asks for until the prompt goes away, or presses the key of the strike or finisher. The key comes from the hint on the card, or from \`src/moves/defs\` when hints are off.
- **result** is \`won\` or \`lost\` (from the result panel), \`not playable\` (the map does not offer the stop), \`never ended\` (no result inside the cap), \`hung\` (the page stopped answering) or \`crashed\` (a screen on the way in never came up).
- **seconds** is from the fight's canvas appearing to the result panel.
- **prompt cards** is how many prompt cards the script saw in that fight. None means it pressed nothing, and the fight fails.
- **console errors** are console messages of type error; **page errors** are uncaught exceptions; **failed requests** are requests that failed or answered 4xx or 5xx. Requests the browser cancels itself (\`net::ERR_ABORTED\`) are not counted.
- The run fails (exit code 1) on any console error, page error or failed request (a 404 counts), on \`never ended\`, \`hung\` or \`crashed\`, on a fight with no prompt card seen, and when every fight in a browser was lost. One \`lost\` fight and \`not playable\` do not fail it.
- Pose tracking was off, so this says nothing about the webcam path, and nobody listens to the audio.

## Run it

\`\`\`
node scripts/smoke.mjs
node scripts/smoke.mjs --styles=all
node scripts/smoke.mjs --no-build --stops=polyphemus --styles=boxer,karate --cap=120 --no-write
node scripts/smoke.mjs --dev --no-write
\`\`\`

For Edge, or both browsers one after the other, set \`FPS_CHANNEL\` first:

\`\`\`
FPS_CHANNEL=msedge node scripts/smoke.mjs --styles=all
FPS_CHANNEL=chrome,msedge node scripts/smoke.mjs --styles=all
\`\`\`

\`--port=4393\` serves the build on that port (a free one is picked otherwise). \`--dev\` builds nothing and serves the source through vite's dev server, for a machine where a build is too heavy; the pages then run React's development build, so the built game is still the last word. \`--query=ghost=1\` adds that to the page address. \`--shots=<folder>\` saves one picture per fight, taken while the fifth prompt card is up.

It needs Chrome (or Edge) and Playwright. Playwright is not a dependency of this repo: if \`node_modules\` has none, set \`FPS_PLAYWRIGHT\` to a playwright-core folder (\`.../node_modules/playwright-core\`). \`FPS_GL=swiftshader\` forces software GL, \`FPS_MACHINE\` names the machine. These are the same variables \`scripts/fps.mjs\` reads.
`;
}

/** Sections of docs/smoke.md that this script does not write: they belong to other scripts and are kept as they are. */
const KEPT_SECTIONS = ["Training Dojo"];

/** The text of those sections in the file as it stands, each from its "## " heading to the next one (or the end). */
function keptSections() {
  let old = "";
  try {
    old = readFileSync(OUT, "utf8").replaceAll("\r\n", "\n");
  } catch {
    return "";
  }
  return old.split(/^(?=## )/m).filter((part) => KEPT_SECTIONS.some((title) => part.startsWith(`## ${title}\n`))).map((part) => `${part.trimEnd()}\n`).join("\n");
}

function commit() {
  const git = (...gitArgs) => spawnSync("git", gitArgs, { cwd: ROOT, encoding: "utf8" }).stdout?.trim() ?? "";
  const hash = git("rev-parse", "--short", "HEAD");
  return hash ? `\`${hash}\` ${git("log", "-1", "--format=%s")}` : "unknown";
}

/** `--styles`: nothing is one fight per stop with the first style offered (null); "all" is every style; else a list of ids. */
function pickStyles(all, wanted) {
  if (!wanted) return [null];
  if (wanted === "all") return all;
  return wanted.split(",").map((id) => {
    const style = all.find((one) => one.id === id);
    if (!style) throw new Error(`no style "${id}"; the styles are ${all.map((one) => one.id).join(", ")}`);
    return style;
  });
}

async function main() {
  const capSeconds = Number(option("cap", "240"));
  const wanted = option("stops", "");
  const stops = readStops().filter((stop) => !wanted || wanted.split(",").includes(stop.id));
  if (stops.length === 0) throw new Error("no stops to play");
  const allStyles = readStyles();
  const styles = pickStyles(allStyles, option("styles", ""));
  const moveKeys = readMoveKeys();
  const query = option("query", "");
  const shots = option("shots", "") ? resolve(option("shots", "")) : "";
  if (shots) mkdirSync(shots, { recursive: true });
  const channels = (process.env.FPS_CHANNEL ?? "chrome").split(",").map((name) => name.trim());
  const chromium = loadChromium();
  let server = null;
  let browser = null;
  const stopServer = () => { server?.kill(); };
  process.on("exit", stopServer);
  process.on("SIGINT", () => process.exit(130));
  process.on("SIGTERM", () => process.exit(143));
  try {
    if (!flag("no-build") && !flag("dev")) {
      say("Building...");
      await build();
    }
    const port = option("port", "") ? Number(option("port", "")) : await freePort();
    const base = `http://127.0.0.1:${String(port)}`;
    server = vite([...(flag("dev") ? [] : ["preview"]), "--host", "127.0.0.1", "--port", String(port), "--strictPort"], "ignore");
    await waitForServer(base, server);
    const flags = glArgs();
    const parts = [];
    for (const channel of channels) {
      browser = await chromium.launch({ headless: true, args: flags, ...(channel ? { channel } : {}) });
      const name = `${channel || "chromium"} ${browser.version()}`;
      const probe = await browser.newPage();
      await probe.goto(base);
      const renderer = await probe.evaluate(readRenderer);
      await probe.close();
      say(`\n${name}, WebGL renderer: ${renderer}`);
      const rows = [];
      for (const stop of stops) {
        for (const style of styles) {
          const row = await runFight(browser, base, stop, style, allStyles, moveKeys, { capMs: capSeconds * 1000, query, shots, channel });
          rows.push(row);
          say(line(row));
        }
      }
      await browser.close().catch(() => undefined);
      browser = null;
      parts.push({ browser: name, renderer, rows });
      const errors = details(rows);
      if (errors.length > 0) say(`\nErrors seen:\n${errors.join("\n")}`);
      say(`${name}: ${verdict(rows).replaceAll("**", "")}`);
    }
    const cpu = os.cpus()[0]?.model.trim() ?? "unknown CPU";
    const text = report(parts, {
      when: new Date().toISOString().slice(0, 10),
      commit: commit(),
      machine: `${process.env.FPS_MACHINE ? `${process.env.FPS_MACHINE}, ` : ""}${cpu}, ${String(Math.round(os.totalmem() / 2 ** 30))} GB, ${os.type()} ${os.release()}`,
      flags,
      styles: styles[0] === null ? "each stop once with the first style" : `${String(stops.length)} stops by ${String(styles.length)} styles (${styles.map((style) => style.name).join(", ")})`,
      capSeconds,
      query,
    });
    if (!flag("no-write")) {
      const kept = keptSections();
      writeFileSync(OUT, kept ? `${text}\n${kept}` : text);
      say(`\nWrote docs/smoke.md${kept ? " (the sections other scripts own are kept as they were)" : ""}`);
    }
    if (parts.every((part) => passed(part.rows))) {
      say("\nPASS");
    } else {
      say("\nFAIL");
      process.exitCode = 1;
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
