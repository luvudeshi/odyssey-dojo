# Offline check

Issue #156. The judging room's Wi-Fi may fail, so the judged path must need nothing from the internet.

`scripts/offline-check.mjs` builds the game, serves `dist` with `vite preview`, and opens it in headless Chrome. Every request that is not to `localhost` or `127.0.0.1` is aborted and listed. No AI server is started. The script then plays a keyboard fight against Polyphemus by reading the prompt card, and walks the Story mode card (the webcam path) with Chrome's fake camera.

## Result

Run on 14 November 2026 on `main` at `7557bdf`. Apple M4, macOS 15.6, Chrome 157.0.8103.51 headless on the GPU (ANGLE metal). Playwright-core 1.64.1 from another project on this machine, through `FPS_PLAYWRIGHT`.

| Path | Result |
| --- | --- |
| Keyboard fight (main menu, "Play on the keyboard instead", Boxer, map, Polyphemus, fight, end screen, map) | Nothing left localhost. The page did not throw. Exit 0 with `--no-camera`. |
| Story mode card with a fake camera (pose tracker, god scan, style, map, calibration) | **One request tried to leave localhost.** The page did not throw. Exit 1. |

The one request is `POST https://odml.pa.googleapis.com/v1/log`. It is a usage log sent by `@mediapipe/tasks-vision` 1.2.3, 60 seconds after the pose tracker starts. See "The pose library's log" below.

`main` moved while this was written. The full check was run at `532abb2` (before the god scan and the music were wired in), `130acfc`, `2cd0666`, `7557bdf` and `c34a1af`, seven times in all, and the keyboard-only check four more times. The result was the same each time. The numbers below are from the two runs at `7557bdf`; the run at `c34a1af` gave the same ones.

**Run again on 14 November 2026 at `28d9c39`, with the pebble interface on every screen** (Windows 11, Chrome 157.0.8103.52 headless on the GPU, ANGLE d3d11), after the script's selectors were moved to the new markup. Same result: nothing left localhost on the keyboard path, the page did not throw, and the one request that tried to leave was the pose library's log. The keyboard fight was won in 32.6 seconds with 9 defends, 9 strikes and the finisher, score 2190. 115 requests on the keyboard path, all answered 2xx. Two things differ from the text below. Headings and buttons were drawn with Trebuchet MS, the installed font on that laptop. In the camera pass the god scan chose a god after the 502 and calibration started, but 75 seconds after the tracker started calibration was still on screen ("Step back: I need to see your head and shoulders") instead of the fight: nobody is in the test pattern. The keyboard-only check was run once more at `34c7571`, after the star-chart fight HUD replaced the pebble one: exit 0, the same 9 defends, 9 strikes, finisher and score 2190, 115 requests.

**Run again late on 14 November 2026 at `5f81bdb`, after the main menu replaced the title screen (PR 281)** (Windows 11, Chrome 157.0.8103.52 headless on the GPU, ANGLE d3d11). The script now presses "Play on the keyboard instead" on the main menu, and the click on Polyphemus on the map starts the fight: the intro screen and its "Face Polyphemus" button are gone. The camera pass presses the Story mode card. Same result: with `--no-camera` exit 0, nothing left localhost, the page did not throw, the fight was won in 33.1 seconds with 9 defends, 9 strikes and the finisher, score 2190, 113 requests. The full check was run once: exit 1, and the one request that tried to leave was the pose library's log. One thing changed in how the script counts: the HUD now shows a strike's score only when the hero's blow lands on screen, so a strike counts as accepted when the monster's bar gets shorter, and the score is no longer read for it. Where the text below says "title", read "main menu"; where it says "Face Polyphemus is pressed", read "Polyphemus is clicked on the map"; "Fight together" is now "Host a room" and "Join a room" on the Account screen.

## The keyboard fight

Every normal run won the fight: 9 defends held, 9 strikes landed, the stake thrust finisher landed, no hits taken, score 2190. It took about 24 seconds up to `2cd0666` and about 29 seconds at `7557bdf`, where the game pauses three seconds after a phase change.

The script holds the key on a defend card until the card changes, and taps the key on a strike card. It does not read game state. It counts what the game accepted from the HUD: a defend that held adds exactly 50 to the score and costs no health, and a strike that landed raises the score and shortens the enemy's bar. At the end it checks its count against the "Moves learned" list on the end screen. They matched in every run.

## What the keyboard path asked for

About 118 requests for 90 different files, all from localhost, all answered 200 or 206. The total moves by a few from run to run, because a voice clip is asked for again each time it plays.

| What | When | Files |
| --- | --- | --- |
| Page | title | `/`, three scripts and one stylesheet under `/assets`, `/favicon.svg` |
| Models | title | `/models/polyphemus/giant.glb`, `/models/hero/spartan.glb` |
| Voice | title | `/audio/athena/index.json` and its 58 clips, `/audio/narration/index.json`, `/audio/taunts/index.json` |
| Sound effects | title | `/audio/sfx/index.json` and 11 clips |
| Music | title | `/audio/music/index.json`, `menu.mp3`, `fight.mp3`, `win.mp3`, `loss.mp3` |
| Pictures | title | `/ui/palmette.svg`, `/ui/ship.svg` |
| Sky | when the fight screen opens | `/hdri/qwantani_dusk_2_puresky_1k.hdr` |
| Picture | end screen | `/ui/laurel.svg` |

- **Fonts:** none are downloaded. The page declares no web font (`document.fonts` is empty). Chrome reports the headings and buttons drawn with Optima, a font installed on this Mac. The stack in `src/theme.css` is `Optima, "Gill Sans", "Trebuchet MS", sans-serif`, so a laptop without Optima shows a different installed font, not a missing one.
- **Fetched late:** two files are first asked for after "Face Polyphemus" is pressed: `/hdri/qwantani_dusk_2_puresky_1k.hdr` as the fight screen opens, about 1.5 seconds before the first prompt card, and `/ui/laurel.svg` on the win screen. The script prints this list. About 25 more requests in the fight ask again for a voice, sound or music clip that was already fetched on the title screen (206). The check turns the browser cache off, so a normal browser may not ask again.
- **The loss screen** asks for `/ui/owl.svg` from localhost and nothing else new. The normal run never loses, so this was seen in one run by hand with a throwaway copy of the script that presses the wrong key on every defend card: 0 defends, 23 hits taken, "You are struck down" after 68 seconds, the "Map" button led back to the quest map, and the copy exited 2.
- **The Draco decoder** (`/draco/`) and **the textures** (`/textures/`) were not asked for in this fight. `/hdri/small_cave_1k.hdr` was not asked for either.
- **The pose files** (`/mediapipe/`) are not asked for on the keyboard path.
- **The AI server:** the keyboard path made no `/api` call. The build names three: `/api/reveal` and `/api/portrait` in the god scan, which only the webcam path shows, and `/api/rooms` behind "Fight together", which the check does not press.

## The webcam button, with a fake camera

Chrome's fake camera is a moving test pattern with nobody in it. No real camera is used.

- The pose tracker started. It asked localhost for `/mediapipe/wasm/vision_wasm_internal.js`, `/mediapipe/wasm/vision_wasm_internal.wasm` and `/mediapipe/pose_landmarker_lite.task`, and nothing else.
- The god scan sent `POST /api/reveal`. No server was there, so it got a 502. The game logged `reveal_offline`, chose a god in the browser, and went on to the style menu.
- Calibration started on the test pattern. Nobody was there to calibrate, and 75 seconds after the tracker started the fight was on screen.

### The pose library's log

`PoseLandmarker.createFromOptions` (`src/pose/tracker.ts:28`) starts a logger inside `@mediapipe/tasks-vision`. Every 60 seconds it posts what it has to `https://odml.pa.googleapis.com/v1/log`. The check saw one such request, 60 seconds after the tracker started.

Offline it does no harm that the check could see: the request fails, the page does not throw, and the game carried on for the 15 seconds the check kept watching. As read in the library's code, the logger turns itself off after the first failed send. `docs/webcam-smoke.md` already notes this request.

It still makes the check exit 1, because the issue asks for that. A fix that was tried on the built page only (not in the source, at `532abb2`, `130acfc` and `7c2c1f3`): add this line to the `<head>` of `index.html`.

```html
<meta http-equiv="Content-Security-Policy" content="connect-src 'self' blob: data:" />
```

With it the browser refuses the log call before it becomes a request, the keyboard fight is won, the pose tracker and the god scan still work, and the check exits 0. Not tried with it: `make dev`, the later stops, "Fight together", and anything that calls a server on another address.

## Addresses in the built code that were not asked for

Found by searching `dist/assets` for `http`. None was requested in any run.

- `https://www.gstatic.com/draco/versioned/decoders/1.5.5/`: drei's default Draco decoder. `src/render/models/RiggedModel.tsx:34` points it at `/draco/` instead.
- `https://raw.githack.com/pmndrs/drei-assets/.../hdri/`: drei's sky presets. The game loads its own files from `/hdri/`.
- Links in comments and error messages (react.dev, github.com, docs.pmnd.rs, shadertoy.com, iquilezles.org, opencollective.com) and XML and JSON schema names (w3.org, json-schema.org).

## What this does not prove

- A real camera, the camera permission prompt, or a person being tracked. The fake camera only shows that the pose runtime and model load from localhost and start.
- The game with the AI server running but the internet down. The check never starts the server. The server's own calls to Gemini and ElevenLabs are not covered.
- The five later stops, the pause menu, the settings panel, "Fight together", and the other four styles. The loss screen is not part of the normal run; it was seen once by hand (see "Fetched late").
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

Exit codes: 0 pass. 1 a request tried to leave localhost, or the page threw. 2 the check could not do its job (no accepted defend or strike, the fight did not end, the pose tracker did not start, no pose files in the build, a screen was missing). 3 Playwright was not found.

A run that stops part way still prints what it recorded: the requests, the page errors and the screen it stopped on. It exits 1 when a request tried to leave localhost or the page threw, else 2. Tried twice by hand. With a script tag for another host added to the built `index.html`, and the page emptied when that script did not load, the check listed the blocked request, said it stopped on the title screen and exited 1. With `--max-seconds=10` the fight was not over, and the check printed the tally so far and the requests and exited 2.

`vite preview` takes the `/api` proxy from `vite.config.ts`. The script points that proxy at a closed port, so an AI server that happens to be running on the machine cannot answer. A second lock sits behind the request filter: Chrome is started with a rule that resolves no name but `localhost`.
