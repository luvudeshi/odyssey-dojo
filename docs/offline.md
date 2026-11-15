# Offline check

Issue #156. The judging room's Wi-Fi may fail, so the judged path must need nothing from the internet.

`scripts/offline-check.mjs` builds the game, serves `dist` with `vite preview`, and opens it in headless Chrome. Every request that is not to `localhost` or `127.0.0.1` is aborted and listed. No AI server is started. The script then plays a keyboard fight against Polyphemus by reading the prompt card, and walks the webcam button with Chrome's fake camera.

## Result

Run on 14 November 2026 on `main` at `130acfc`. Apple M4, macOS 15.6, Chrome 157.0.8103.51 headless on the GPU (ANGLE metal). Playwright-core 1.64.1 from another project on this machine, through `FPS_PLAYWRIGHT`.

| Path | Result |
| --- | --- |
| Keyboard fight (title, Keyboard only, Boxer, map, Polyphemus, fight, end screen, map) | Nothing left localhost. The page did not throw. Exit 0 with `--no-camera`. |
| Webcam button with a fake camera (pose tracker, god scan, style, map, intro, calibration) | **One request tried to leave localhost.** The page did not throw. Exit 1. |

The one request is `POST https://odml.pa.googleapis.com/v1/log`. It is a usage log sent by `@mediapipe/tasks-vision` 1.2.3, 60 seconds after the pose tracker starts. See "The pose library's log" below.

Three full runs and two keyboard-only runs gave the same result each time. Two of the full runs were on an older `main` (`532abb2`), before the god scan and the music were wired in.

## The keyboard fight

Every run won the fight in about 24 seconds: 9 defends held, 9 strikes landed, the stake thrust finisher landed, no hits taken, score 2190.

The script holds the key on a defend card until the card changes, and taps the key on a strike card. It does not read game state. It counts what the game accepted from the HUD: a defend that held adds exactly 50 to the score and costs no health, and a strike that landed raises the score and shortens the enemy's bar. At the end it checks its count against the "Moves learned" list on the end screen. They matched in every run.

## What the keyboard path asked for

101 requests, 77 different files, all from localhost, all answered 200 or 206.

| What | When | Files |
| --- | --- | --- |
| Page | title | `/`, three scripts and one stylesheet under `/assets`, `/favicon.svg` |
| Models | title | `/models/polyphemus/giant.glb`, `/models/hero/spartan.glb` |
| Voice | title | `/audio/athena/index.json` and its 45 clips, `/audio/narration/index.json`, `/audio/taunts/index.json` |
| Sound effects | title | `/audio/sfx/index.json` and 11 clips |
| Music | title | `/audio/music/index.json`, `menu.mp3`, `fight.mp3`, `win.mp3`, `loss.mp3` |
| Pictures | title | `/ui/palmette.svg`, `/ui/ship.svg` |
| Sky | when the fight screen opens | `/hdri/qwantani_dusk_2_puresky_1k.hdr` |
| Picture | end screen | `/ui/laurel.svg` |

- **Fonts:** none are downloaded. The page declares no web font (`document.fonts` is empty). Chrome reports the headings and buttons drawn with Optima, a font installed on this Mac. The stack in `src/theme.css` is `Optima, "Gill Sans", "Trebuchet MS", sans-serif`, so a laptop without Optima shows a different installed font, not a missing one.
- **Fetched late:** the only file first asked for after the first prompt card is `/ui/laurel.svg`, on the win screen. The loss screen was not reached, so its pictures were not seen. Voice clips are asked for again each time they play (206). The check turns the browser cache off, so a normal browser may not ask again.
- **The Draco decoder** (`/draco/`) and **the textures** (`/textures/`) were not asked for in this fight. `/hdri/small_cave_1k.hdr` was not asked for either.
- **The pose files** (`/mediapipe/`) are not asked for on the keyboard path.
- **The AI server:** the keyboard path made no `/api` call. The build names two, `/api/reveal` and `/api/portrait`, both in the god scan, which only the webcam path shows.

## The webcam button, with a fake camera

Chrome's fake camera is a moving test pattern with nobody in it. No real camera is used.

- The pose tracker started. It asked localhost for `/mediapipe/wasm/vision_wasm_internal.js`, `/mediapipe/wasm/vision_wasm_internal.wasm` and `/mediapipe/pose_landmarker_lite.task`, and nothing else.
- The god scan sent `POST /api/reveal`. No server was there, so it got a 502. The game logged `reveal_offline`, chose a god in the browser, and went on to the style menu.
- Calibration ran on the test pattern, gave up as it should with nobody there, and the fight started on the keyboard.

### The pose library's log

`PoseLandmarker.createFromOptions` (`src/pose/tracker.ts:28`) starts a logger inside `@mediapipe/tasks-vision`. Every 60 seconds it posts what it has to `https://odml.pa.googleapis.com/v1/log`. The check saw one such request, 60 seconds after the tracker started.

Offline it does no harm that the check could see: the request fails, the page does not throw, and the fight carried on for the 15 seconds the check kept watching. The library's code turns its logger off after the first failed send. `docs/webcam-smoke.md` already notes this request.

It still makes the check exit 1, because the issue asks for that. A fix that was tried on the built page only (not in the source): add this line to the `<head>` of `index.html`.

```html
<meta http-equiv="Content-Security-Policy" content="connect-src 'self' blob: data:" />
```

With it the browser refuses the log call before it becomes a request, the keyboard fight is won, the pose tracker and the god scan still work, and the check exits 0. Not tried with it: `make dev`, the later stops, and anything that calls a server on another address.

## Addresses in the built code that were not asked for

Found by searching `dist/assets` for `http`. None was requested in any run.

- `https://www.gstatic.com/draco/versioned/decoders/1.5.5/`: drei's default Draco decoder. `src/render/models/RiggedModel.tsx:34` points it at `/draco/` instead.
- `https://raw.githack.com/pmndrs/drei-assets/.../hdri/`: drei's sky presets. The game loads its own files from `/hdri/`.
- Links in comments and error messages (react.dev, github.com, docs.pmnd.rs, shadertoy.com, iquilezles.org, opencollective.com) and XML and JSON schema names (w3.org, json-schema.org).

## What this does not prove

- A real camera, the camera permission prompt, or a person being tracked. The fake camera only shows that the pose runtime and model load from localhost and start.
- The game with the AI server running but the internet down. The check never starts the server. The server's own calls to Gemini and ElevenLabs are not covered.
- The five later stops, the loss screen, the pause menu, the settings panel, and the other four styles.
- More than 75 seconds on the webcam path.
- Windows or Linux, and any browser other than Chrome.
- `make dev`. The check uses the built game.
- The pose files are not in git. `make setup` copies the runtime from `node_modules` and downloads the model once, so that one step needs a network. The check stops with exit 2 if the build has no pose files.

## Run it

```
FPS_PLAYWRIGHT=/path/to/node_modules/playwright-core node scripts/offline-check.mjs
node scripts/offline-check.mjs --no-build --no-camera
node scripts/offline-check.mjs --camera-seconds=120 --json=run.json
```

It needs Chrome and Playwright. Playwright is not a dependency of this repo. The script finds it the way `scripts/fps.mjs` does and reads the same `FPS_PLAYWRIGHT`, `FPS_CHANNEL` and `FPS_GL`. A full run takes about two minutes.

Exit codes: 0 pass. 1 a request tried to leave localhost, or the page threw. 2 the check could not do its job (no accepted defend or strike, the pose tracker did not start, no pose files in the build, a screen was missing). 3 Playwright was not found.

`vite preview` takes the `/api` proxy from `vite.config.ts`. The script points that proxy at a closed port, so an AI server that happens to be running on the machine cannot answer. A second lock sits behind the request filter: Chrome is started with a rule that resolves no name but `localhost`.
