# Smoke run

Written by `node scripts/smoke.mjs`. Do not edit by hand: run it again.

- **When:** 2026-11-15
- **Commit:** `532abb2` Merge pull request #78 from toyeshhm/2-ai-fights
- **Machine:** Intel(R) Core(TM) Ultra 9 386H, 31 GB, Windows_NT 10.0.26200
- **WebGL renderer:** `ANGLE (Intel, Intel(R) Graphics (0x0000B0A0) Direct3D11 vs_5_0 ps_5_0, D3D11)`
- **Browser:** chrome 157.0.8103.52, headless, started with `--use-gl=angle --enable-gpu --ignore-gpu-blocklist --enable-unsafe-swiftshader --use-angle=d3d11`
- **Play:** 1280x720, keyboard only (no camera, no pose tracking), style Boxer, cap 240 s per fight

**Pass.** No stop crashed, hung or logged an error.

| stop | result | seconds | console errors | page errors | failed requests | note |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| polyphemus | won | 27.0 | 0 | 0 | 0 | "Polyphemus falls" |
| circe | won | 46.5 | 0 | 0 | 0 | "Circe falls" |
| sirens | won | 49.4 | 0 | 0 | 0 | "The Sirens falls" |
| scylla | won | 40.2 | 0 | 0 | 0 | "Scylla falls" |
| charybdis | won | 51.0 | 0 | 0 | 0 | "Charybdis falls" |
| suitors | won | 56.7 | 0 | 0 | 0 | "The Suitors falls" |

## How to read it

- Each stop is opened at `/?stop=<id>` in a fresh browser context: Keyboard only, the first style, the open stop on the map, then the fight.
- The script plays for real. Every 50 ms it reads the prompt card, holds the key of the defense it asks for until the prompt goes away, or presses the key of the strike or finisher. The key comes from the hint on the card, or from `src/moves/defs` when hints are off.
- **result** is `won` or `lost` (from the result overlay), `not playable` (the map does not offer the stop), `never ended` (no result inside the cap), `hung` (the page stopped answering) or `crashed` (a screen on the way in never came up).
- **seconds** is from the fight's canvas appearing to the result overlay.
- **console errors** are console messages of type error; **page errors** are uncaught exceptions; **failed requests** are requests that failed or answered 4xx or 5xx. Requests the browser cancels itself (`net::ERR_ABORTED`) are not counted.
- The run fails (exit code 1) on any console error, page error or failed request (a 404 counts), and on `never ended`, `hung` or `crashed`. `lost` and `not playable` do not fail it.
- Pose tracking was off, so this says nothing about the webcam path, and nobody listens to the audio.

## Run it

```
node scripts/smoke.mjs
node scripts/smoke.mjs --no-build --stops=polyphemus --cap=120 --no-write
```

It needs Chrome and Playwright. Playwright is not a dependency of this repo: if `node_modules` has none, set `FPS_PLAYWRIGHT` to a playwright-core folder (`.../node_modules/playwright-core`). `FPS_GL=swiftshader` forces software GL, `FPS_CHANNEL=msedge` uses Edge, `FPS_MACHINE` names the machine. These are the same variables `scripts/fps.mjs` reads.
