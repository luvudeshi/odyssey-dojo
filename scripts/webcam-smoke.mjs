// Webcam smoke test. Drives the real app in headless Chrome with a fake camera fed from a video file.
// Not part of `make check`: it needs Chrome, a video and a dev server, and it proves behaviour, not correctness.
//
// Needs playwright-core (not a dependency of this repo: install it somewhere outside, e.g. `npm i playwright-core`
// in a scratch folder, and set FPS_PLAYWRIGHT to that install's folder, .../node_modules/playwright-core, as for
// scripts/fps.mjs) and a video converted to .y4m:
//   ffmpeg -i in.mp4 -vf "crop=720:540:0:200,scale=640:480,fps=30" -pix_fmt yuv420p smoke.y4m
//   npx vite --port 5581 --strictPort &
//   node webcam-smoke.mjs <video.y4m> <outDir> [--url http://localhost:5581/] [--seconds 60]
//        [--block-external] [--no-gpu] [--deny] [--stop polyphemus]
// Writes <outDir>/timeline.json, <outDir>/summary.json and a screenshot every 3 s.
//   --block-external  abort every request that is not localhost, to prove the fight works offline
//   --deny            refuse the camera permission and check the keyboard fallback (writes denied.png)
// Details and numbers: docs/webcam-smoke.md
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

/** Playwright is found the way scripts/fps.mjs finds it: in the repo, else in the folder FPS_PLAYWRIGHT names. */
function loadChromium() {
  const require = createRequire(import.meta.url);
  for (const place of ["playwright", "playwright-core", process.env.FPS_PLAYWRIGHT && resolve(process.env.FPS_PLAYWRIGHT)].filter(Boolean)) {
    try {
      return require(place).chromium;
    } catch {
      // try the next place
    }
  }
  throw new Error("Playwright not found. Install it outside the repo and point FPS_PLAYWRIGHT at its folder (.../node_modules/playwright-core).");
}
const chromium = loadChromium();
/** The ANGLE backend, as in scripts/fps.mjs: d3d11 on Windows, metal on macOS, FPS_GL to choose another. */
const angle = process.env.FPS_GL ?? { win32: "d3d11", darwin: "metal" }[process.platform] ?? "";

const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const [video, outDir] = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && args[i - 1] !== "--block-external"));
if (!video || !outDir) throw new Error("usage: node webcam-smoke.mjs <video.y4m> <outDir> [--url U] [--seconds N] [--block-external]");
const base = flag("--url", "http://localhost:5581/");
const seconds = Number(flag("--seconds", "60"));
const blockExternal = args.includes("--block-external");
const deny = args.includes("--deny");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: [...(args.includes("--no-gpu") ? ["--disable-gpu"] : ["--enable-gpu", ...(angle ? [`--use-angle=${angle}`] : []), "--ignore-gpu-blocklist"]), "--autoplay-policy=no-user-gesture-required",
    ...(deny ? [] : ["--use-fake-ui-for-media-stream"]), "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${video}`],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 810 }, permissions: deny ? [] : ["camera"] });
const page = await context.newPage();
const errors = [];
const origins = new Map();
const blocked = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
await context.route("**/*", (route) => {
  const u = new URL(route.request().url());
  origins.set(u.origin, (origins.get(u.origin) ?? 0) + 1);
  if (blockExternal && !["localhost", "127.0.0.1"].includes(u.hostname) && u.protocol.startsWith("http")) { blocked.push(u.href); return route.abort(); }
  return route.continue();
});

await page.addInitScript(() => {
  const rows = [];
  let frames = 0;
  const countFrame = () => { frames += 1; requestAnimationFrame(countFrame); };
  requestAnimationFrame(countFrame);
  let lastFrames = 0;
  let lastT = performance.now();
  setInterval(() => {
    const now = performance.now();
    const fps = ((frames - lastFrames) * 1000) / (now - lastT);
    lastFrames = frames; lastT = now;
    const pose = window.__poseRef?.current ?? null;
    const b = window.__battle;
    const video = document.querySelector(".camera-frame video, .preview video");
    rows.push({
      t: Math.round(now), modelFrames: window.__uploads ?? 0, fps: Math.round(fps * 10) / 10,
      h1: document.querySelector("h1")?.textContent ?? "",
      poseT: pose ? Math.round(pose.t) : null,
      videoTime: video ? Math.round(video.currentTime * 1000) : null,
      held: b ? [...b.held] : [], struckMove: b?.struckMove ?? "", struckAt: b && Number.isFinite(b.struckAt) ? Math.round(b.struckAt * 1000) : null,
      playerHp: b?.state?.playerHp ?? null, enemyHp: b?.state?.enemyHp ?? null,
      phase: b?.state?.phase?.kind ?? null,
    });
  }, 100);
  window.__smokeRows = rows;
  // MediaPipe uploads the camera picture to a WebGL texture once per model run, so counting uploads of video
  // elements counts model runs.
  window.__uploads = 0;
  for (const proto of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) {
    for (const name of ["texImage2D", "texSubImage2D"]) {
      const orig = proto[name];
      proto[name] = function (...a) { if (a.at(-1) instanceof HTMLVideoElement) window.__uploads += 1; return orig.apply(this, a); };
    }
  }
});

const t0 = Date.now();
const step = async (what, fn) => { try { await fn(); } catch (e) { errors.push(`step ${what}: ${String(e).split("\n")[0]}`); } };
await page.goto(`${base}?debug&stop=${flag("--stop", "polyphemus")}`, { waitUntil: "load" });
await page.waitForTimeout(500);
// The Story mode card starts the webcam ("Play with" is Camera on a fresh page).
await step("title", () => page.getByRole("button", { name: /^Story mode/ }).click());
await page.waitForTimeout(500);
if (deny) {
  // Camera refused: the game must carry on with the keyboard.
  await page.waitForTimeout(2000);
  const notice = await page.evaluate(() => document.body.innerText.slice(0, 300));
  await page.screenshot({ path: `${outDir}/denied.png` });
  console.log(JSON.stringify({ deniedScreenText: notice, errors }));
  await browser.close();
  process.exit(0);
}
// The character screen comes up when the camera is. A build that still has the god scan shows the scan first: its
// Skip button may sit off the page, so the key it names is the fallback.
await step("camera", async () => {
  const skip = page.locator("button.scan-skip");
  await skip.or(page.locator("button.character-done")).first().waitFor({ timeout: 90_000 });
  if (await skip.isVisible()) await skip.click({ timeout: 3000 }).catch(() => page.keyboard.press("Escape"));
});
// The character already chosen ("Fight as ..."), then the first style card (the screen's first button is "Back").
await step("character", () => page.locator("button.character-done").click());
await step("style", () => page.locator("main.menu button.flow-style").first().click());
// The click on the stop starts calibration, and the fight follows by itself once somebody stands still in the picture.
await step("stop", () => page.locator("button.stop.open").first().click());

let n = 0;
while (Date.now() - t0 < seconds * 1000) {
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${outDir}/s${String(n++).padStart(2, "0")}.png` });
}
const rows = await page.evaluate(() => window.__smokeRows);
writeFileSync(`${outDir}/timeline.json`, JSON.stringify(rows));

// Summary: landmark rate, fps by screen, strikes and defends seen.
const byH1 = {};
for (const r of rows) (byH1[r.h1.slice(0, 40)] ??= []).push(r);
const summary = { runSeconds: seconds, origins: Object.fromEntries(origins), blockedExternal: blocked, errors: errors.slice(0, 30), screens: {} };
for (const [h1, rs] of Object.entries(byH1)) {
  const fps = rs.map((r) => r.fps).filter((f) => f > 0);
  const span = (rs.at(-1).t - rs[0].t) / 1000;
  const modelFrames = rs.at(-1).modelFrames - rs[0].modelFrames;
  summary.screens[h1] = { samples: rs.length, seconds: Math.round(span * 10) / 10, avgFps: fps.length ? Math.round((fps.reduce((a, b) => a + b, 0) / fps.length) * 10) / 10 : 0, minFps: Math.min(...fps), modelRunsPerSec: span > 0 ? Math.round((modelFrames / span) * 10) / 10 : 0 };
}
summary.defendsSeen = [...new Set(rows.flatMap((r) => r.held))];
summary.strikesSeen = [...new Set(rows.map((r) => r.struckMove).filter(Boolean))];
writeFileSync(`${outDir}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
await browser.close();
