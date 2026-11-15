# Smoke run

Written by `node scripts/smoke.mjs`. Do not edit by hand: run it again.

- **When:** 2026-11-15
- **Commit:** `5f81bdb` Merge pull request #286 from toyeshhm/2-demo-runbook
- **Machine:** Intel(R) Core(TM) Ultra 9 386H, 31 GB, Windows_NT 10.0.26200
- **Browsers:** chrome 157.0.8103.52; headless, started with `--use-gl=angle --enable-gpu --ignore-gpu-blocklist --enable-unsafe-swiftshader --use-angle=d3d11`
- **Play:** 1280x720, keyboard only (no camera, no pose tracking), each stop once with the first style, cap 150 s per fight

## chrome 157.0.8103.52

- **WebGL renderer:** `ANGLE (Intel, Intel(R) Graphics (0x0000B0A0) Direct3D11 vs_5_0 ps_5_0, D3D11)`

**Pass.** 6 of 6 fights won; none crashed, hung or logged an error.

| stop | style | result | seconds | prompt cards | console errors | page errors | failed requests | note |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| polyphemus | Boxer | won | 32.6 | 19 | 0 | 0 | 0 | "Polyphemus falls" |
| circe | Boxer | won | 45.0 | 31 | 0 | 0 | 0 | "Circe falls" |
| sirens | Boxer | won | 47.8 | 32 | 0 | 0 | 0 | "The Sirens fall" |
| scylla | Boxer | won | 43.2 | 34 | 0 | 0 | 0 | "Scylla falls" |
| charybdis | Boxer | won | 47.8 | 34 | 0 | 0 | 0 | "Charybdis falls" |
| suitors | Boxer | won | 56.3 | 43 | 0 | 0 | 0 | "The Suitors fall" |

## How to read it

- Each fight is opened at `/?stop=<id>` in a fresh browser context: the main menu with the "Play with" setting on Keyboard, Story mode, the style, then the open stop on the map. The click on the stop starts the fight. `--styles=all` plays every stop with every style; without it each stop is played once, with the first style on the style screen.
- The script finds the screens by what the game defines in `src/`: the style card is the button that starts with the style's name, the stop is the button that holds the stop's place or its monster's name. The keyboard link on the main menu is found by its name. The prompt card is the box around the key hint whose class ends in defend, strike or finish, and the result panel is the layer of the fight that holds two or more buttons outside a dialog. No heading and no colour is read, so a new look should not break it.
- The script plays for real. Every 50 ms it reads the prompt card, holds the key of the defense it asks for until the prompt goes away, or presses the key of the strike or finisher. The key comes from the hint on the card, or from `src/moves/defs` when hints are off.
- **result** is `won` or `lost` (from the result panel), `not playable` (the map does not offer the stop), `never ended` (no result inside the cap), `hung` (the page stopped answering) or `crashed` (a screen on the way in never came up).
- **seconds** is from the fight's canvas appearing to the result panel.
- **prompt cards** is how many prompt cards the script saw in that fight. None means it pressed nothing, and the fight fails.
- **console errors** are console messages of type error; **page errors** are uncaught exceptions; **failed requests** are requests that failed or answered 4xx or 5xx. Requests the browser cancels itself (`net::ERR_ABORTED`) are not counted.
- The run fails (exit code 1) on any console error, page error or failed request (a 404 counts), on `never ended`, `hung` or `crashed`, on a fight with no prompt card seen, and when every fight in a browser was lost. One `lost` fight and `not playable` do not fail it.
- Pose tracking was off, so this says nothing about the webcam path, and nobody listens to the audio.

## Run it

```
node scripts/smoke.mjs
node scripts/smoke.mjs --styles=all
node scripts/smoke.mjs --no-build --stops=polyphemus --styles=boxer,karate --cap=120 --no-write
```

For Edge, or both browsers one after the other, set `FPS_CHANNEL` first:

```
FPS_CHANNEL=msedge node scripts/smoke.mjs --styles=all
FPS_CHANNEL=chrome,msedge node scripts/smoke.mjs --styles=all
```

`--port=4393` serves the build on that port (a free one is picked otherwise). `--query=ghost=1` adds that to the page address. `--shots=<folder>` saves one picture per fight, taken while the fifth prompt card is up.

It needs Chrome (or Edge) and Playwright. Playwright is not a dependency of this repo: if `node_modules` has none, set `FPS_PLAYWRIGHT` to a playwright-core folder (`.../node_modules/playwright-core`). `FPS_GL=swiftshader` forces software GL, `FPS_MACHINE` names the machine. These are the same variables `scripts/fps.mjs` reads.
