// Training Dojo smoke run: starts the dev server on a free port, opens the Training Dojo from the main menu in a
// headless browser, and trains every style the setup step offers by keyboard, from the setup step to the end screen.
// Prints one PASS or FAIL line per check and exits non-zero when any check failed. docs/smoke.md, "Training Dojo".
//
//   node scripts/dojo-smoke.mjs [--styles=boxer,taekwondo] [--shots=<folder>] [--port=4394] [--url=http://127.0.0.1:5173]
//
// --styles plays only those style ids (left out: every style on the setup step). --shots saves three pictures per
// style into that folder: the setup step, a move in training, and the end screen. --url uses a server that is
// already running (the dev server, or `vite preview` of a build) and starts none.
//
// What is checked, for every style: its button is on the setup step, its usual moves are listed and ticked, Start
// opens a session with those moves in the order listed, every move shows its name, a moving outline, its checklist
// and its key, the key makes the move, the strip along the bottom counts the moves done and marks the current and
// the next ones, the points add up, and the end screen comes with the right total. Along the way: no move name is
// cut, broken in the middle of a word or outside its box at 1280x720, Change moves comes back to the same choice,
// no moves ticked cannot start a session, the choice is still there after a reload, Escape, Quit, Back and Done
// leave to the main menu, and the page logs no error and no request fails.
//
// The screens are found by what the game itself defines: the style names, the move names, ids and keys and the
// points are read from src/, the Dojo's steps are read from the `data-phase`, `data-move` and `data-rep` it writes on
// its `main`, and the rest by role, label and structure. No CSS class and no colour is read, so a restyle should
// not break it.
//
// No camera: the "Play with" setting is put on Keyboard, so every repetition is a key press. What the camera sees
// is not checked here (scripts/webcam-smoke.mjs does that).
//
// Finding Playwright and Chrome, the free port and the error watch are the same as in scripts/smoke.mjs. That file
// exports nothing and runs on import, so those small parts are copied here. The same environment names are read:
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
const VIEWPORT = { width: 1280, height: 720 };
const POLL_MS = 40;
/** How long a screen may take to come up. */
const SCREEN_TIMEOUT_MS = 15_000;
/** How long one step of a repetition may take. The longest the game allows is 3 s (the player's turn). */
const STEP_TIMEOUT_MS = 9000;
/** A step that is late while the browser draws no frame at all is waited for this long in all, then it fails. */
const STALL_CAP_MS = 120_000;
/** Time at the end for late errors to show up. */
const AFTER_MS = 800;
/** The main menu's card for the Dojo: the button whose name starts with this (src/screens/MainMenu.tsx). */
const DOJO_CARD = /^Training Dojo/;
/** The Dojo's own buttons, by name (src/coach/ui/Dojo.tsx and DojoSetup.tsx). */
const NAMES = { start: "Start training", change: "Change moves", again: "Train again", done: "Done", quit: "Quit", back: "Back", all: "Select all", clear: "Clear" };

const args = process.argv.slice(2);
const option = (name, fallback) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const say = (line) => process.stdout.write(`${line}\n`);
const sleep = (ms) => new Promise((next) => setTimeout(next, ms));

// ---------- what the game defines, read from src/ ----------

const source = (...parts) => readFileSync(join(ROOT, "src", ...parts), "utf8");
const tsFiles = (...parts) => readdirSync(join(ROOT, "src", ...parts)).filter((name) => name.endsWith(".ts")).sort().map((name) => source(...parts, name));
const quoted = (list) => [...list.matchAll(/"([^"]+)"/g)].map((match) => match[1]);

/** Every move the Dojo can train, by id: the game's (src/moves/defs), then the Dojo's own (src/coach/extra/moves). */
function readMoves() {
  const moves = new Map();
  for (const [text, extra] of [...tsFiles("moves", "defs").map((text) => [text, false]), ...tsFiles("coach", "extra", "moves").map((text) => [text, true])]) {
    const field = (name) => new RegExp(`^ {2}${name}: "([^"]+)"`, "m").exec(text)?.[1];
    const [id, name, key] = [field("id"), field("name"), field("key")];
    if (id && name && key) moves.set(id, { id, name, key, extra });
  }
  return moves;
}

/** Every style the Dojo offers, in the order `dojoStyles()` (src/coach/catalog.ts) gives: the game's, then the Dojo's own. */
function readStyles() {
  const strikes = (text) => quoted(/strikes: \[([^\]]*)\]/.exec(text)?.[1] ?? "");
  const game = tsFiles("styles", "defs").map((text) => ({ id: /^ {2}id: "([^"]+)"/m.exec(text)?.[1], name: /^ {2}name: "([^"]+)"/m.exec(text)?.[1], strikes: strikes(text), extra: false }));
  const extra = [...source("coach", "extra", "styles.ts").matchAll(/id: "([^"]+)",\s*name: "([^"]+)",[^}]*?strikes: \[([^\]]*)\]/g)]
    .map((match) => ({ id: match[1], name: match[2], strikes: quoted(match[3]), extra: true }));
  const all = [...game, ...extra].filter((style) => style.id && style.name);
  return all.filter((style, index) => all.findIndex((other) => other.id === style.id) === index);
}

function readRules() {
  const catalog = source("coach", "catalog.ts");
  const list = (name) => new RegExp(`${name}[^=]*= \\[([^\\]]*)\\]`).exec(catalog)?.[1] ?? "";
  const grade = source("coach", "grade.ts");
  const points = (tier) => Number(new RegExp(`POINTS[^=]*=[^}]*\\b${tier}: (\\d+)`).exec(grade)?.[1]);
  return {
    defends: quoted(list("DOJO_DEFENDS")),
    repsChoices: list("REPS_CHOICES").split(",").map((text) => Number(text.trim())).filter((count) => count > 0),
    defaultReps: Number(/DOJO_REPS = (\d+)/.exec(source("coach", "dojo.ts"))?.[1]),
    storageKey: /DOJO_CHOICE_KEY = "([^"]+)"/.exec(catalog)?.[1] ?? "",
    keyPoints: points("excellent"),
    missPoints: points("needs_work"),
  };
}

/** As `keyName` in src/coach/ui/keyName.ts: what the key hint shows for a move's key (an arrow key is its glyph). */
const ARROWS = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" };
const keyLabel = (key) => ARROWS[key] ?? (key === " " ? "Space" : key.length === 1 ? key.toUpperCase() : key);

// ---------- the browser and the server (as in scripts/smoke.mjs) ----------

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

function glArgs() {
  const backend = process.env.FPS_GL ?? { win32: "d3d11", darwin: "metal" }[process.platform] ?? "";
  const list = ["--use-gl=angle", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"];
  if (backend) list.push(`--use-angle=${backend}`);
  return list;
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

// ---------- reading the page ----------

/**
 * Runs in the page: everything the checks need of the Dojo, in one look.
 *
 * The Dojo is the `main` that carries `data-phase` ("pick" for the setup step, then "show", "go", "result", "done"),
 * `data-move` and `data-rep`. Its parts are found by role and label: the strip is the section labelled "Moves in this
 * session", the outline is the section labelled "How to do <move>", the checklist is the list labelled "What the
 * camera is looking for", the points are the element labelled "<n> points", the key hint is the `kbd`.
 *
 * `faults` lists every text that does not fit: a box whose text is wider than it, a word broken over two lines, a
 * text outside the box that holds it or outside the screen, and things in the top bar that sit on each other.
 */
function readDojo() {
  const clean = (element) => (element?.textContent ?? "").replace(/\s+/g, " ").trim();
  const main = document.querySelector("main[data-phase]");
  if (!main) {
    const card = [...document.querySelectorAll("button")].some((button) => /^Training Dojo/.test(clean(button)));
    return { open: false, menu: card };
  }
  const screen = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  const faults = [];
  const boxOf = (element) => { const r = element.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
  const inside = (inner, outer, slack = 1.5) => inner.left >= outer.left - slack && inner.right <= outer.right + slack && inner.top >= outer.top - slack && inner.bottom <= outer.bottom + slack;
  /** The box around the text itself, which can be smaller or larger than its element's. */
  const textBox = (element) => {
    const rects = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      // Words kept for screen readers only sit in a box one pixel wide: they are not on the screen.
      const holder = node.parentElement;
      if (!holder || holder.getClientRects().length === 0 || (holder.offsetWidth <= 1 && holder.offsetHeight <= 1)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      rects.push(...[...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0));
    }
    if (rects.length === 0) return null;
    return { left: Math.min(...rects.map((r) => r.left)), top: Math.min(...rects.map((r) => r.top)), right: Math.max(...rects.map((r) => r.right)), bottom: Math.max(...rects.map((r) => r.bottom)) };
  };
  /** Words that the layout broke over two lines. A hyphen is a fair place to break. */
  const brokenWords = (element) => {
    const out = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const match of node.data.matchAll(/[^\s-]+/g)) {
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
        if (tops.size > 1) out.push(match[0]);
      }
    }
    return out;
  };
  /** The text of `element` must fit: not wider than its own box, no word broken, inside `holder` (when given) and on the screen. */
  const fits = (what, element, holder) => {
    if (!element) return;
    const said = `${what} "${clean(element).slice(0, 40)}"`;
    if (element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1) faults.push(`${said} is wider than its box (${String(element.scrollWidth)} px of text in ${String(element.clientWidth)} px)`);
    const broken = brokenWords(element);
    if (broken.length > 0) faults.push(`${said} has a word broken over two lines (${broken.join(", ")})`);
    const text = textBox(element);
    if (!text) return;
    if (holder && !inside(text, boxOf(holder), 2)) faults.push(`${said} goes outside its box`);
    // A box above it that cuts what sticks out (overflow hidden) hides part of the text. A box that scrolls does
    // not: what is outside it can be scrolled to, so a text scrolled out of view is left alone from there on.
    for (let up = element.parentElement; up && up !== main.parentElement; up = up.parentElement) {
      const style = getComputedStyle(up);
      if (style.overflowX === "visible" && style.overflowY === "visible") continue;
      const scrolls = [style.overflowX, style.overflowY].some((value) => value === "auto" || value === "scroll");
      if (inside(text, boxOf(up), 2)) continue;
      if (scrolls) return;
      faults.push(`${said} is cut by the box around it`);
      return;
    }
    if (!inside(text, screen)) faults.push(`${said} is partly off the screen`);
  };
  const phase = main.dataset.phase ?? "";
  const buttons = [...main.querySelectorAll("button")].map((button) => ({ name: clean(button), disabled: button.disabled }));
  const header = main.querySelector("header");
  const state = {
    open: true, phase, move: main.dataset.move ?? "", rep: Number(main.dataset.rep ?? "0"), tier: main.dataset.tier ?? "",
    top: clean(header), buttons, faults,
    pageWide: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
  if (state.pageWide) faults.push(`the page is wider than the screen (${String(document.documentElement.scrollWidth)} px)`);

  // The top bar: its pieces must not sit on each other.
  if (header) {
    const pieces = [...header.querySelectorAll("p, button")].filter((piece) => !piece.closest("p p, button p") && clean(piece) !== "")
      .map((piece) => ({ name: clean(piece).slice(0, 30), box: piece.tagName === "BUTTON" ? boxOf(piece) : textBox(piece) }))
      .filter((piece) => piece.box);
    for (const [index, a] of pieces.entries()) {
      for (const b of pieces.slice(index + 1)) {
        const over = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left) > 2 && Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top) > 2;
        if (over) faults.push(`in the top bar "${a.name}" sits on "${b.name}"`);
      }
      if (!inside(a.box, screen)) faults.push(`in the top bar "${a.name}" is partly off the screen`);
    }
  }

  if (phase === "pick") {
    const boxes = [...main.querySelectorAll('input[type="checkbox"]')].map((input) => {
      const label = input.closest("label");
      fits("the move", label, input.closest("fieldset"));
      // The list may scroll: a move is in view when its whole line is inside every box that scrolls around it.
      let inView = label !== null;
      for (let up = label?.parentElement; inView && up && up !== main.parentElement; up = up.parentElement) {
        const style = getComputedStyle(up);
        if ([style.overflowX, style.overflowY].some((value) => value !== "visible") && !inside(boxOf(label), boxOf(up), 2)) inView = false;
      }
      return { id: input.value, checked: input.checked, label: clean(label), inView, group: clean(input.closest("fieldset")?.querySelector("legend")) };
    });
    const styles = [...main.querySelectorAll("button[aria-pressed]")].map((button) => {
      fits("the style button", button, button.closest("fieldset"));
      return { name: clean(button), pressed: button.getAttribute("aria-pressed") === "true" };
    });
    const radios = [...main.querySelectorAll('input[type="radio"]')].map((input) => ({ value: Number(input.value), checked: input.checked }));
    const start = [...main.querySelectorAll("button")].find((button) => clean(button) === "Start training");
    if (start && !inside(boxOf(start), screen)) faults.push("the Start training button is partly off the screen");
    const count = [...main.querySelectorAll("[aria-live]")].map(clean).join(" ");
    return { ...state, styles, boxes, radios, startDisabled: start ? start.disabled : null, count };
  }

  const points = main.querySelector('[aria-label$=" points"]');
  state.points = points ? Number(/^(\d+) points$/.exec(points.getAttribute("aria-label") ?? "")?.[1] ?? "NaN") : null;

  if (phase === "done") {
    const end = main.querySelector("section");
    for (const button of main.querySelectorAll("button")) if (!inside(boxOf(button), screen)) faults.push(`the button "${clean(button)}" is partly off the screen`);
    for (const piece of end?.querySelectorAll("h1, h2, p, li") ?? []) fits("the end screen text", piece, null);
    return { ...state, heading: clean(main.querySelector("h1")), end: clean(end) };
  }

  // A move in training.
  const heading = main.querySelector("h1");
  const side = heading?.closest("section") ?? null;
  fits("the move title", heading, side);
  const guide = main.querySelector('section[aria-label^="How to do "]');
  const figure = guide?.querySelector("svg") ?? null;
  const figureBox = figure ? boxOf(figure) : null;
  const guideName = guide?.querySelector("h2") ?? null;
  fits("the outline's title", guideName, guide);
  const checks = [...(guide?.querySelectorAll('ol[aria-label="What the camera is looking for"] > li') ?? [])].filter((row) => !row.hidden);
  for (const row of checks) fits("the checklist line", row, guide);
  const strip = main.querySelector('section[aria-label="Moves in this session"]');
  const row = strip?.querySelector("ol") ?? null;
  const rowBox = row ? boxOf(row) : null;
  if (strip && !inside(boxOf(strip), screen)) faults.push("the strip of moves is partly off the screen");
  const chips = [...(row?.querySelectorAll(":scope > li") ?? [])].map((chip) => {
    fits("the strip chip", chip, chip);
    const box = boxOf(chip);
    return {
      text: clean(chip), status: chip.dataset.status ?? "", current: chip.getAttribute("aria-current") === "step",
      inView: rowBox !== null && box.left >= rowBox.left - 1.5 && box.right <= rowBox.right + 1.5,
    };
  });
  return {
    ...state,
    heading: clean(heading), side: clean(side), key: clean(main.querySelector("kbd")),
    guide: guide ? {
      label: guide.getAttribute("aria-label") ?? "", name: clean(guideName),
      lines: figure ? figure.querySelectorAll("line[data-a]").length : 0,
      size: figureBox ? [Math.round(figureBox.right - figureBox.left), Math.round(figureBox.bottom - figureBox.top)] : [0, 0],
      onScreen: figureBox ? inside(figureBox, screen) : false,
      // Where the figure's limbs are right now: it changes from look to look while the outline plays.
      pose: figure ? [...figure.querySelectorAll("line[data-a]")].map((line) => `${line.getAttribute("x2") ?? ""},${line.getAttribute("y2") ?? ""}`).join(" ") : "",
      checks: checks.map(clean).filter((text) => text !== ""),
    } : null,
    strip: strip ? { count: clean(strip.querySelector("p")), chips } : null,
  };
}

async function look(page) {
  return page.evaluate(readDojo);
}

/** Times the browser stopped drawing frames in the middle of the run, and for how long in all. Said at the end. */
const stalls = { times: 0, ms: 0 };

/** Runs in the page: how many frames the browser draws in half a second. The Dojo moves on once per drawn frame. */
function countFrames() {
  return new Promise((done) => {
    let count = 0;
    const tick = () => { count += 1; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    setTimeout(() => { done(count); }, 500);
  });
}

/**
 * Looks every POLL_MS until `ready(state)` is true. Throws with `what` and the last thing seen when it never is.
 * A busy machine can stop a headless browser from drawing for many seconds, and the Dojo, which runs on the clock,
 * carries on when the frames come back. So a late step fails only when the browser is drawing frames and the Dojo
 * still has not moved on; while no frame is drawn at all the wait goes on, up to STALL_CAP_MS.
 */
async function until(page, ready, what, timeout = STEP_TIMEOUT_MS, each = null) {
  const first = Date.now();
  let started = first;
  let state = await look(page);
  each?.(state);
  while (!ready(state)) {
    if (Date.now() - started > timeout) {
      const last = state.open ? `phase "${state.phase}", move "${state.move}", try ${String(state.rep + 1)}` : state.menu ? "the main menu" : "another screen";
      const frames = await page.evaluate(countFrames).catch(() => -1);
      if (frames === 0 && Date.now() - first < STALL_CAP_MS) {
        stalls.times += 1;
        const from = Date.now();
        while ((await page.evaluate(countFrames).catch(() => -1)) === 0 && Date.now() - first < STALL_CAP_MS) await sleep(500);
        stalls.ms += Date.now() - from + timeout;
        started = Date.now();
        continue;
      }
      throw new Error(`${what} did not come up in ${String(Math.round((Date.now() - first) / 1000))} s (the page shows ${last}; the browser ${frames === 0 ? "had stopped drawing frames" : "was drawing frames"})`);
    }
    await sleep(POLL_MS);
    state = await look(page);
    each?.(state);
  }
  return state;
}

const button = (page, name) => page.locator("main").getByRole("button", { name, exact: true });

async function openDojo(page) {
  const card = page.getByRole("button", { name: DOJO_CARD });
  await card.waitFor({ timeout: SCREEN_TIMEOUT_MS }).catch(() => { throw new Error("the main menu has no Training Dojo card"); });
  await card.click();
  return until(page, (state) => state.open && state.phase === "pick", "the Dojo's setup step", SCREEN_TIMEOUT_MS);
}

const onMenu = (page) => until(page, (state) => !state.open && state.menu, "the main menu", SCREEN_TIMEOUT_MS);

/** What is chosen on the setup step, to compare two looks at it. */
const choiceOf = (setup) => ({
  style: setup.styles.find((style) => style.pressed)?.name ?? "",
  ticked: setup.boxes.filter((box) => box.checked).map((box) => box.id),
  reps: setup.radios.find((radio) => radio.checked)?.value ?? null,
});
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sameSet = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
const tell = (choice) => `${choice.style}, ${String(choice.ticked.length)} moves (${choice.ticked.join(" ")}), ${String(choice.reps)} tries`;

// ---------- the run ----------

async function main() {
  const moves = readMoves();
  const allStyles = readStyles();
  const rules = readRules();
  if (allStyles.length === 0 || moves.size === 0 || !rules.storageKey || !(rules.keyPoints > 0)) throw new Error("could not read the styles, the moves or the rules from src/");
  const wanted = option("styles", "");
  const styles = wanted ? wanted.split(",").map((id) => {
    const style = allStyles.find((one) => one.id === id);
    if (!style) throw new Error(`no style "${id}"; the styles are ${allStyles.map((one) => one.id).join(", ")}`);
    return style;
  }) : allStyles;
  const shots = option("shots", "") ? resolve(option("shots", "")) : "";
  if (shots) mkdirSync(shots, { recursive: true });

  let failures = 0;
  let total = 0;
  const check = (scope, what, ok, detail = "") => {
    total += 1;
    if (!ok) failures += 1;
    say(`${ok ? "PASS" : "FAIL"}  ${scope}: ${what}${!ok && detail ? ` (${detail})` : ""}`);
    return ok;
  };
  /** A list of things found wrong: the check passes when it is empty, and says the first few when not. */
  const clear = (scope, what, problems) => {
    const unique = [...new Set(problems)];
    return check(scope, what, unique.length === 0, `${unique.slice(0, 4).join("; ")}${unique.length > 4 ? `; and ${String(unique.length - 4)} more` : ""}`);
  };
  const shot = async (page, name) => {
    if (shots) await page.screenshot({ path: join(shots, `${name}.png`) }).catch(() => undefined);
  };

  let server = null;
  let browser = null;
  const stopServer = () => { server?.kill(); };
  process.on("exit", stopServer);
  process.on("SIGINT", () => process.exit(130));
  process.on("SIGTERM", () => process.exit(143));
  try {
    let base = option("url", "").replace(/\/$/, "");
    if (!base) {
      const port = option("port", "") ? Number(option("port", "")) : await freePort();
      base = `http://127.0.0.1:${String(port)}`;
      // node runs vite directly (no shell), so killing the child leaves nothing behind.
      server = spawn(process.execPath, [VITE, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: ROOT, stdio: "ignore" });
      await waitForServer(base, server);
    }
    const channel = process.env.FPS_CHANNEL ?? "chrome";
    browser = await loadChromium().launch({ headless: true, args: glArgs(), ...(channel ? { channel } : {}) });
    say(`${channel || "chromium"} ${browser.version()}, ${String(VIEWPORT.width)}x${String(VIEWPORT.height)}, keyboard only, ${base}`);
    // One context for the whole run, so what the Dojo keeps in this browser is still there after a reload.
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    // Keyboard play is the "Play with" setting (Account, Settings), so the Dojo asks for no camera.
    await context.addInitScript(() => { localStorage.setItem("odyssey-dojo.settings", JSON.stringify({ controls: "keyboard" })); });
    // A first visit nobody watches: the dev server works out what to bundle on it and may load the page twice.
    const warm = await context.newPage();
    await warm.goto(base, { timeout: 120_000 });
    await warm.getByRole("button", { name: DOJO_CARD }).waitFor({ timeout: 120_000 }).catch(() => undefined);
    await warm.getByRole("button", { name: DOJO_CARD }).click().catch(() => undefined);
    await sleep(1500);
    await warm.evaluate((key) => { localStorage.removeItem(key); }, rules.storageKey).catch(() => undefined);
    await warm.close();

    const page = await context.newPage();
    const seen = watch(page, base);
    await page.goto(base);

    /**
     * Trains the session on screen to its end screen by keyboard. `ids` are the moves in the order trained.
     * `special` asks for other things on the way: a wrong key first, Space in place of the move's key, a turn
     * left to run out, a grade left to pass by itself. Returns the points earned, or throws when the session hangs.
     */
    const train = async (scope, style, ids, reps, special = {}) => {
      const wrong = { order: [], names: [], outline: [], keys: [], strip: [], points: [], grades: [] };
      // What does not fit, with the moves it was seen at.
      const seenAt = new Map();
      const noteFaults = (state, where) => { for (const fault of state.faults) seenAt.set(fault, [...new Set([...(seenAt.get(fault) ?? []), where])]); };
      const earned = new Map();
      let points = 0;
      for (const [at, id] of ids.entries()) {
        const move = moves.get(id);
        const named = `move ${String(at + 1)} (${move.name})`;
        for (let rep = 0; rep < reps; rep += 1) {
          // Every look at the outline while it plays: the figure has to be in more than one pose.
          const poses = new Set();
          const watchOutline = (state) => { if (state.open && state.move === id && state.guide?.pose) poses.add(state.guide.pose); };
          const shown = await until(page, (state) => state.open && state.move === id && state.rep === rep && (state.phase === "show" || state.phase === "go"), `${scope}: ${named}, try ${String(rep + 1)}`, STEP_TIMEOUT_MS, watchOutline);
          noteFaults(shown, move.name);
          if (rep === 0) {
            if (shown.heading.toLowerCase() !== move.name.toLowerCase()) wrong.names.push(`${named} is titled "${shown.heading}"`);
            if (!shown.top.includes(`Move ${String(at + 1)} of ${String(ids.length)}`)) wrong.order.push(`${named}: the top bar does not say "Move ${String(at + 1)} of ${String(ids.length)}" ("${shown.top}")`);
            if (!shown.top.includes(style.name)) wrong.order.push(`the top bar does not name the style ("${shown.top}")`);
            const guide = shown.guide;
            if (!guide) wrong.outline.push(`${named} has no outline`);
            else {
              if (guide.label !== `How to do ${move.name}`) wrong.outline.push(`${named}: the outline is labelled "${guide.label}"`);
              if (guide.lines < 8 || guide.size[0] < 100 || guide.size[1] < 100) wrong.outline.push(`${named}: the outline figure is missing or tiny (${String(guide.lines)} limbs, ${guide.size.join("x")} px)`);
              else if (!guide.onScreen) wrong.outline.push(`${named}: the outline figure is partly off the screen`);
              if (guide.checks.length === 0) wrong.outline.push(`${named}: the checklist is empty`);
            }
            // The strip: the moves before this one done, this one marked, the rest next, and the count at its left.
            const strip = shown.strip;
            if (!strip) wrong.strip.push(`${named}: no strip of moves`);
            else {
              if (!strip.count.startsWith(`${String(at)} of ${String(ids.length)} done`)) wrong.strip.push(`${named}: the strip says "${strip.count}", not "${String(at)} of ${String(ids.length)} done"`);
              if (strip.chips.length !== ids.length) wrong.strip.push(`${named}: the strip has ${String(strip.chips.length)} chips for ${String(ids.length)} moves`);
              for (const [index, chip] of strip.chips.entries()) {
                const want = index < at ? "done" : index === at ? "current" : "next";
                const its = moves.get(ids[index] ?? "");
                if (chip.status !== want || chip.current !== (index === at)) wrong.strip.push(`${named}: chip ${String(index + 1)} is "${chip.status}"${chip.current ? " and marked current" : ""}, not "${want}"`);
                if (its && !chip.text.includes(`${String(index + 1)}. ${its.name}`)) wrong.strip.push(`${named}: chip ${String(index + 1)} reads "${chip.text}", not "${String(index + 1)}. ${its.name}"`);
                if (want === "done" && its && !chip.text.includes(`${String(earned.get(its.id) ?? 0)} points`)) wrong.strip.push(`${named}: the done chip "${chip.text}" does not show ${String(earned.get(its.id) ?? 0)} points`);
                if (want === "current" && !chip.text.startsWith("Now")) wrong.strip.push(`${named}: the current chip reads "${chip.text}", not "Now ..."`);
                if (want === "next" && !chip.text.startsWith("Next")) wrong.strip.push(`${named}: a later chip reads "${chip.text}", not "Next ..."`);
                if (index === at && !chip.inView) wrong.strip.push(`${named}: the current chip is scrolled out of view`);
              }
            }
          }
          const turn = await until(page, (state) => state.open && state.move === id && state.rep === rep && (state.phase === "go" || state.phase === "result"), `${scope}: the turn for ${named}, try ${String(rep + 1)}`, STEP_TIMEOUT_MS, watchOutline);
          if (turn.phase === "go") {
            noteFaults(turn, move.name);
            if (turn.key !== keyLabel(move.key)) wrong.keys.push(`${named}: the key shown is "${turn.key}", the move's key is "${keyLabel(move.key)}"`);
            if (rep === 0 && shown.guide && shown.phase === "show" && poses.size < 2) wrong.outline.push(`${named}: the outline figure did not move`);
            if (rep === 0 && at === special.shotAt) await shot(page, `${style.id}-training`);
          }
          let want = rules.keyPoints;
          if (rep === 0 && at === special.wrongKeyAt) {
            // Another move's key: the turn goes on, nothing is graded.
            const other = [...moves.values()].find((each) => each.key !== move.key && each.key !== " " && each.id !== id);
            await page.keyboard.press(other.key);
            await sleep(300);
            const after = await look(page);
            if (!(after.open && after.phase === "go" && after.move === id && after.rep === rep && after.points === points)) wrong.keys.push(`${named}: the wrong key (${keyLabel(other.key)}) ended the turn`);
          }
          if (rep === 0 && at === special.runOutAt) want = rules.missPoints;
          else await page.keyboard.press(rep === 0 && at === special.spaceAt ? " " : move.key);
          const graded = await until(page, (state) => state.open && state.move === id && state.rep === rep && state.phase === "result", `${scope}: the grade for ${named}, try ${String(rep + 1)}`);
          noteFaults(graded, `the grade for ${move.name}`);
          if (want === rules.missPoints) await shot(page, `${style.id}-missed`);
          points += want;
          earned.set(id, (earned.get(id) ?? 0) + want);
          const tier = want === rules.keyPoints ? "excellent" : "needs_work";
          if (graded.tier !== tier) wrong.grades.push(`${named}, try ${String(rep + 1)}: graded "${graded.tier}", not "${tier}"`);
          if (!graded.side.includes(`+${String(want)}`)) wrong.grades.push(`${named}, try ${String(rep + 1)}: the grade does not show +${String(want)} ("${graded.side}")`);
          if (want === rules.missPoints && !/key/i.test(graded.side)) wrong.grades.push(`${named}: a turn that ran out does not say to press the key ("${graded.side}")`);
          if (graded.points !== points) wrong.points.push(`after ${named}, try ${String(rep + 1)}: ${String(graded.points)} points on screen, ${String(points)} earned`);
          // Enter leaves the grade early; once per session the grade is left to pass by itself.
          if (!(rep === 0 && at === special.waitGradeAt)) await page.keyboard.press("Enter");
        }
      }
      const end = await until(page, (state) => state.open && state.phase === "done", `${scope}: the end screen`);
      await sleep(250);
      const settled = await look(page);
      clear(scope, `all ${String(ids.length)} moves came up in the order ticked, ${String(reps)} ${reps === 1 ? "try" : "tries"} each, to the end screen`, wrong.order);
      clear(scope, "every move shows its own name", wrong.names);
      clear(scope, "every move shows a moving outline and its checklist", wrong.outline);
      clear(scope, `every move is made with the key shown for it${special.wrongKeyAt === undefined ? "" : ", and a wrong key does not end the turn"}`, wrong.keys);
      clear(scope, "the strip shows the moves done, the current one and the next ones at every move", wrong.strip);
      clear(scope, `every try is graded${special.runOutAt === undefined ? "" : ", a turn left to run out too"}, and the points add up`, [...wrong.grades, ...wrong.points]);
      clear(scope, "no move title, chip or line is cut or outside its box during training",
        [...seenAt].map(([fault, where]) => `${fault}, at ${where.slice(0, 3).join(", ")}${where.length > 3 ? ` and ${String(where.length - 3)} more` : ""}`));
      const most = ids.length * reps * rules.keyPoints;
      const totals = /(\d+) points of (\d+)/.exec(settled.end ?? "");
      check(scope, `the end screen shows ${String(points)} points of ${String(most)}`, end.points === points && totals !== null && Number(totals[1]) === points && Number(totals[2]) === most,
        `it shows ${totals ? `${totals[1]} of ${totals[2]}` : `"${(settled.end ?? "").slice(0, 60)}"`}, the top bar ${String(end.points)}`);
      const offered = settled.buttons.map((each) => each.name);
      clear(scope, "the end screen offers Train again, Change moves and Done, all on the screen and nothing cut",
        [...[NAMES.again, NAMES.change, NAMES.done].filter((name) => !offered.includes(name)).map((name) => `no "${name}" button`), ...settled.faults]);
      return points;
    };

    /** Picks `style` on the setup step and the number of tries, and returns what the step then shows. */
    const pick = async (style, reps) => {
      await button(page, style.name).click();
      await page.locator(`main input[type="radio"][value="${String(reps)}"]`).check();
      return look(page);
    };
    const start = async (scope) => {
      await button(page, NAMES.start).click();
      return until(page, (state) => state.open && state.phase === "show", `${scope}: the first move after Start training`);
    };
    /** Where the picture of a session is taken: at the move with the longest name, the one most likely not to fit. */
    const longest = (ids) => ids.reduce((best, id, at) => (moves.get(id).name.length > moves.get(ids[best]).name.length ? at : best), 0);
    const usual = (style) => [...new Set([...style.strikes, ...rules.defends])].filter((id) => moves.has(id));

    // ----- the main menu and the setup step -----
    let setup;
    try {
      setup = await openDojo(page);
      check("menu", "the Training Dojo card opens the setup step", true);
    } catch (error) {
      check("menu", "the Training Dojo card opens the setup step", false, error.message);
      throw error;
    }
    check("setup", `offers every style of dojoStyles(), the game's first: ${allStyles.map((style) => style.name).join(", ")}`,
      same(setup.styles.map((style) => style.name), allStyles.map((style) => style.name)), `the page offers: ${setup.styles.map((style) => style.name).join(", ")}`);
    const first = choiceOf(setup);
    const firstStyle = allStyles[0];
    check("setup", `starts on the first style (${firstStyle.name}) with its usual moves ticked and ${String(rules.defaultReps)} tries`,
      first.style === firstStyle.name && sameSet(first.ticked, usual(firstStyle)) && first.reps === rules.defaultReps, `it starts on ${tell(first)}`);
    check("setup", `offers ${rules.repsChoices.join(", ")} tries at each move`, same(setup.radios.map((radio) => radio.value), rules.repsChoices), `the page offers ${setup.radios.map((radio) => String(radio.value)).join(", ")}`);
    const listed = setup.boxes.map((box) => box.id);
    const extraMoves = [...moves.values()].filter((move) => move.extra);
    clear("setup", `lists the Dojo's own moves to tick (${extraMoves.map((move) => move.name).join(", ")})`, extraMoves.filter((move) => !listed.includes(move.id)).map((move) => `${move.name} is not on the list`));
    clear("setup", "every move on the list is one the game defines, under its own name, once",
      [...setup.boxes.filter((box) => !moves.has(box.id) || !box.label.startsWith(moves.get(box.id).name)).map((box) => `"${box.label}" (${box.id})`), ...listed.filter((id, index) => listed.indexOf(id) !== index).map((id) => `${id} is listed twice`)]);

    // No moves ticked: no session.
    await button(page, NAMES.clear).click();
    let empty = await look(page);
    const startButton = button(page, NAMES.start);
    await startButton.click({ force: true, timeout: 2000 }).catch(() => undefined);
    await startButton.focus().catch(() => undefined);
    await page.keyboard.press("Enter");
    await sleep(300);
    const still = await look(page);
    check("setup", "with every move unticked Start training is off and no session starts",
      empty.boxes.every((box) => !box.checked) && empty.startDisabled === true && still.open && still.phase === "pick" && /at least one/i.test(empty.count),
      `ticked ${String(empty.boxes.filter((box) => box.checked).length)}, Start disabled: ${String(empty.startDisabled)}, then phase "${still.open ? still.phase : "gone"}", note "${empty.count}"`);
    await button(page, NAMES.all).click();
    empty = await look(page);
    check("setup", "Select all ticks every move on the list and says how many", empty.boxes.every((box) => box.checked) && empty.count.includes(`${String(empty.boxes.length)} moves`) && empty.startDisabled === false, `${String(empty.boxes.filter((box) => box.checked).length)} of ${String(empty.boxes.length)} ticked, note "${empty.count}"`);

    // ----- every style -----
    // The first style played is also trained a second time around, to try Train again and Change moves in the middle.
    // The style with the fewest moves is the one played with three tries; the rest get one.
    const fewest = [...styles].sort((a, b) => usual(a).length - usual(b).length)[0];
    for (const [index, style] of styles.entries()) {
      const scope = style.name;
      const reps = style === fewest && styles.length > 1 ? 3 : 1;
      try {
        let now = await look(page);
        if (!(now.open && now.phase === "pick")) {
          // The session before this one hung or left: start from the main menu again.
          await page.goto(base);
          now = await openDojo(page);
        }
        // Another style first, so this one comes up on its own usual list whatever was ticked before.
        const other = allStyles.find((each) => each.id !== style.id);
        if (other) await button(page, other.name).click();
        setup = await pick(style, reps);
        const chosen = choiceOf(setup);
        const expected = usual(style);
        check(scope, "its button is on the setup step and is the one pressed after a click", chosen.style === style.name && setup.styles.filter((each) => each.pressed).length === 1, `pressed: ${setup.styles.filter((each) => each.pressed).map((each) => each.name).join(", ") || "none"}`);
        clear(scope, `its ${String(expected.length)} usual moves are listed and ticked, and nothing else (${expected.map((id) => moves.get(id).name).join(", ")})`, [
          ...expected.filter((id) => !setup.boxes.some((box) => box.id === id)).map((id) => `${moves.get(id).name} is not on the list`),
          ...expected.filter((id) => setup.boxes.some((box) => box.id === id && !box.checked)).map((id) => `${moves.get(id).name} is not ticked`),
          ...chosen.ticked.filter((id) => !expected.includes(id)).map((id) => `${moves.get(id)?.name ?? id} is ticked too`),
        ]);
        clear(scope, "nothing on the setup step is cut, outside its box or off the screen", setup.faults);
        const below = setup.boxes.filter((box) => box.checked && !box.inView).map((box) => moves.get(box.id)?.name ?? box.id);
        if (below.length > 0) say(`NOTE  ${scope}: ${String(below.length)} of its ${String(chosen.ticked.length)} ticked moves are scrolled out of view in the list at ${String(VIEWPORT.width)}x${String(VIEWPORT.height)} (${below.join(", ")})`);
        check(scope, `the count line says ${String(chosen.ticked.length)} moves picked and ${String(reps)} ${reps === 1 ? "try is" : "tries are"} chosen`, setup.count.includes(`${String(chosen.ticked.length)} moves picked`) && chosen.reps === reps, `"${setup.count}", ${String(chosen.reps)} tries`);
        await shot(page, `${style.id}-setup`);
        const ids = chosen.ticked;
        await start(scope);

        if (index === 0) {
          // Two moves in, Change moves: back on the setup step with the same choice. Then the session from the top.
          for (const id of ids.slice(0, 2)) {
            await until(page, (state) => state.open && state.move === id && state.phase === "go", `${scope}: the turn for ${moves.get(id).name}`);
            await page.keyboard.press(moves.get(id).key);
            for (let rep = 1; rep < reps; rep += 1) {
              await until(page, (state) => state.open && state.move === id && state.rep === rep && state.phase === "go", `${scope}: the turn for ${moves.get(id).name}`);
              await page.keyboard.press(moves.get(id).key);
            }
          }
          await button(page, NAMES.change).click();
          const back = await until(page, (state) => state.open && state.phase === "pick", `${scope}: the setup step after Change moves`);
          check(scope, "Change moves in the middle of a session comes back to the setup step with the same choice", same(choiceOf(back), chosen), `before: ${tell(chosen)}; after: ${tell(choiceOf(back))}`);
          const again = await start(scope);
          check(scope, "a session started again begins at the first move with no points", again.move === ids[0] && again.rep === 0 && again.points === 0, `move "${again.move}", try ${String(again.rep + 1)}, ${String(again.points)} points`);
        }

        // On the first style: a wrong key, Space for the move, a grade left to pass, and a turn left to run out.
        const special = index === 0 ? { wrongKeyAt: 1, spaceAt: 2, waitGradeAt: 0, runOutAt: ids.length - 1, shotAt: longest(ids) } : { shotAt: longest(ids) };
        await train(scope, style, ids, reps, special);
        await shot(page, `${style.id}-end`);

        if (index === 0) {
          await button(page, NAMES.again).click();
          const again = await until(page, (state) => state.open && state.phase === "show", `${scope}: the first move after Train again`).catch(() => null);
          check(scope, "Train again starts the same moves from the top with no points", again !== null && again.move === ids[0] && again.rep === 0 && again.points === 0 && (again.strip?.count ?? "").startsWith(`0 of ${String(ids.length)} done`),
            again ? `move "${again.move}", ${String(again.points)} points, strip "${again.strip?.count ?? ""}"` : "no session came up");
        }
        await button(page, NAMES.change).click();
        const back = await until(page, (state) => state.open && state.phase === "pick", `${scope}: the setup step after Change moves`);
        check(scope, `Change moves ${index === 0 ? "" : "on the end screen "}comes back to the setup step with the same choice`, same(choiceOf(back), chosen), `before: ${tell(chosen)}; after: ${tell(choiceOf(back))}`);
      } catch (error) {
        check(scope, "the session ran to its end without hanging", false, error instanceof Error ? error.message.split("\n")[0] : String(error));
      }
    }

    // ----- every move in one session, then Done -----
    if (!wanted) {
      const scope = "all moves";
      try {
        let now = await look(page);
        if (!(now.open && now.phase === "pick")) {
          await page.goto(base);
          now = await openDojo(page);
        }
        const style = allStyles.at(-1);
        await pick(style, 1);
        await button(page, NAMES.all).click();
        setup = await look(page);
        const ids = choiceOf(setup).ticked;
        clear(scope, `Select all under ${style.name} gives a session of every move the Dojo knows that is not a god's power (${String(ids.length)} moves)`,
          [...moves.values()].filter((move) => move.extra && !ids.includes(move.id)).map((move) => `${move.name} is missing`));
        await shot(page, "all-moves-setup");
        await start(scope);
        await train(scope, style, ids, 1, { shotAt: longest(ids) });
        await shot(page, "all-moves-end");
        await button(page, NAMES.done).click();
        const menu = await onMenu(page).catch(() => null);
        check(scope, "Done on the end screen goes back to the main menu", menu !== null, "the main menu did not come back");
      } catch (error) {
        check(scope, "the session ran to its end without hanging", false, error instanceof Error ? error.message.split("\n")[0] : String(error));
      }
    }

    // ----- the choice is kept, and the ways out -----
    try {
      const scope = "leaving";
      await page.goto(base);
      await openDojo(page);
      // A choice nobody would get by default: the last style, one of its moves unticked, the most tries.
      const style = styles.at(-1);
      const reps = rules.repsChoices.at(-1);
      const other = allStyles.find((each) => each.id !== style.id);
      if (other) await button(page, other.name).click();
      await pick(style, reps);
      const dropped = usual(style).at(-1);
      await page.locator(`main input[type="checkbox"][value="${dropped}"]`).uncheck();
      const chosen = choiceOf(await look(page));
      const during = await start(scope);
      await page.keyboard.press("Escape");
      const afterEscape = await onMenu(page).catch(() => null);
      check(scope, "Escape in the middle of a session goes back to the main menu", during.open && afterEscape !== null, "the main menu did not come back");

      await page.reload();
      const kept = await openDojo(page);
      check("remembered", `after a reload the setup step comes back on the last choice (${tell(chosen)})`, same(choiceOf(kept), chosen), `it shows ${tell(choiceOf(kept))}`);
      const stored = await page.evaluate((key) => localStorage.getItem(key), rules.storageKey);
      let parsed = null;
      try { parsed = JSON.parse(stored ?? "null"); } catch { parsed = null; }
      check("remembered", `the choice is kept under "${rules.storageKey}" as the style id, the move ids and the tries`,
        parsed !== null && parsed.style === style.id && same(parsed.moves, chosen.ticked) && parsed.reps === reps, `stored: ${String(stored).slice(0, 160)}`);

      await page.keyboard.press("Escape");
      check(scope, "Escape on the setup step goes back to the main menu", (await onMenu(page).catch(() => null)) !== null, "the main menu did not come back");
      await openDojo(page);
      await button(page, NAMES.back).click();
      check(scope, "Back on the setup step goes back to the main menu", (await onMenu(page).catch(() => null)) !== null, "the main menu did not come back");
      await openDojo(page);
      await start(scope);
      await button(page, NAMES.quit).click();
      check(scope, "Quit in the middle of a session goes back to the main menu", (await onMenu(page).catch(() => null)) !== null, "the main menu did not come back");
      const again = await openDojo(page).catch(() => null);
      check(scope, "the Dojo opens again after leaving, on the setup step with the same choice", again !== null && same(choiceOf(again), chosen), again ? `it shows ${tell(choiceOf(again))}` : "the setup step did not come up");
    } catch (error) {
      check("leaving", "the ways out and the reload ran without hanging", false, error instanceof Error ? error.message.split("\n")[0] : String(error));
    }

    // ----- nothing went wrong on the page -----
    await sleep(AFTER_MS);
    const few = (list) => { const unique = [...new Set(list)]; return `${String(list.length)}: ${unique.slice(0, 3).map((text) => text.replaceAll("\n", " ").slice(0, 200)).join(" | ")}`; };
    check("page", "no console error in the whole run", seen.consoleErrors.length === 0, few(seen.consoleErrors));
    check("page", "no uncaught error in the whole run", seen.pageErrors.length === 0, few(seen.pageErrors));
    check("page", "no request failed or answered 4xx or 5xx", seen.badRequests.length === 0, few(seen.badRequests));

    if (stalls.times > 0) say(`NOTE  the browser stopped drawing frames ${String(stalls.times)} ${stalls.times === 1 ? "time" : "times"} (about ${String(Math.round(stalls.ms / 1000))} s in all) and the run waited for it: a busy machine does this, not the game`);
    say(`\n${String(total)} checks, ${String(failures)} failed`);
    say(failures === 0 ? "PASS" : "FAIL");
    if (failures > 0) process.exitCode = 1;
  } finally {
    await browser?.close().catch(() => undefined);
    stopServer();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
