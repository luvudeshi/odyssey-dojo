# Frame rate

Written by `node scripts/fps.mjs` (`make fps`). Do not edit by hand: run it again.

- **When:** 2026-11-15
- **Machine:** ASUS Vivobook 16 Flip TP3607AA (laptop, on mains power), Intel(R) Core(TM) Ultra 9 386H, 31 GB, Windows_NT 10.0.26200
- **WebGL renderer:** `ANGLE (Intel, Intel(R) Graphics (0x0000B0A0) Direct3D11 vs_5_0 ps_5_0, D3D11)`
- **GL:** hardware GL, on the GPU named above
- **Browser:** chrome 157.0.8103.52, headless, started with `--use-gl=angle --enable-gpu --ignore-gpu-blocklist --enable-unsafe-swiftshader --use-angle=d3d11`
- **Canvas:** 1280x720, device pixel ratio 1, keyboard only (no camera, no pose tracking), style Boxer

No measured stop is under 50 fps at the default quality (high).

6 of 24 rows were sampled more than once, because a sample came out slow or was taken with the machine busy or its processor running slow. The notes give every sample, and "How to read it" says how the row is chosen.

## What costs the most

The three heaviest stops at each quality level, from the run with the frame cap on. Draw calls and triangles are per frame.

- **high**, by draw calls: suitors (236 draw calls, 218268 triangles), polyphemus (133 draw calls, 60634 triangles), sirens (131 draw calls, 77764 triangles)
- **high**, by triangles: suitors (236 draw calls, 218268 triangles), sirens (131 draw calls, 77764 triangles), circe (115 draw calls, 72926 triangles)
- **low**, by draw calls: suitors (149 draw calls, 115055 triangles), sirens (100 draw calls, 50629 triangles), circe (84 draw calls, 43909 triangles)
- **low**, by triangles: suitors (149 draw calls, 115055 triangles), sirens (100 draw calls, 50629 triangles), circe (84 draw calls, 43909 triangles)

Every measured stop draws fewer triangles at low than at high.

## As a player sees it: frame cap on

Headless Chrome draws at most 60 frames a second, so 60 means "at the cap".

| stop | quality | mean fps | slowest 1% frame (ms) | worst frame (ms) | draw calls | triangles | machine busy (%) | processor speed (%) | note |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| polyphemus | high | 60.0 | 16.9 | 17.1 | 133 | 60634 | 38 | 62 | sampled 2 times (5.9, 60.0 fps): the earlier ones were slow or taken with the machine busy |
| polyphemus | low | 60.0 | 16.9 | 17.1 | 56 | 32115 | 26 | 57 |  |
| circe | high | 60.0 | 17.0 | 17.2 | 115 | 72926 | 21 | 55 |  |
| circe | low | 60.0 | 16.9 | 17.1 | 84 | 43909 | 26 | 56 |  |
| sirens | high | 60.0 | 17.0 | 17.1 | 131 | 77764 | 22 | 56 |  |
| sirens | low | 60.0 | 16.9 | 17.1 | 100 | 50629 | 25 | 57 |  |
| scylla | high | 60.0 | 17.0 | 17.2 | 126 | 55544 | 24 | 60 |  |
| scylla | low | 60.0 | 16.9 | 17.2 | 79 | 32403 | 27 | 57 |  |
| charybdis | high | 60.0 | 17.0 | 17.1 | 96 | 45168 | 28 | 55 |  |
| charybdis | low | 60.0 | 16.9 | 17.0 | 69 | 30585 | 29 | 57 |  |
| suitors | high | 60.0 | 16.9 | 17.0 | 236 | 218268 | 28 | 56 |  |
| suitors | low | 60.0 | 16.9 | 17.2 | 149 | 115055 | 26 | 58 |  |

## Headroom: the same run with the frame cap off

Started with `--use-gl=angle --enable-gpu --ignore-gpu-blocklist --enable-unsafe-swiftshader --use-angle=d3d11 --disable-frame-rate-limit --disable-gpu-vsync`. Here mean fps is how fast the scene could be drawn, not what a player sees.

| stop | quality | mean fps | slowest 1% frame (ms) | worst frame (ms) | draw calls | triangles | machine busy (%) | processor speed (%) | note |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| polyphemus | high | 179.6 | 21.6 | 167.1 | 133 | 60634 | 49 | 60 |  |
| polyphemus | low | 533.0 | 3.9 | 24.4 | 56 | 32115 | 55 | 57 |  |
| circe | high | 188.9 | 23.2 | 44.5 | 115 | 72926 | 33 | 56 |  |
| circe | low | 475.6 | 4.0 | 17.2 | 84 | 43909 | 45 | 57 |  |
| sirens | high | 212.5 | 19.5 | 148.8 | 131 | 77764 | 26 | 100 | sampled 3 times (9.8, 2.1, 212.5 fps): the earlier ones were slow or taken with the machine busy |
| sirens | low | 665.4 | 8.3 | 56.1 | 101 | 50637 | 30 | 94 |  |
| scylla | high | 189.7 | 19.8 | 266.7 | 127 | 56056 | 24 | 63 |  |
| scylla | low | 555.0 | 3.6 | 10.0 | 80 | 32915 | 44 | 40 |  |
| charybdis | high | 213.2 | 22.9 | 40.4 | 96 | 45168 | 52 | 40 | sampled 2 times (215.7, 213.2 fps): the earlier ones were slow or taken with the machine busy |
| charybdis | low | 528.6 | 17.1 | 21.2 | 69 | 30585 | 24 | 82 | sampled 2 times (487.9, 528.6 fps): the earlier ones were slow or taken with the machine busy |
| suitors | high | 151.7 | 19.5 | 106.7 | 236 | 218268 | 44 | 55 | sampled 3 times (144.7, 152.5, 151.7 fps): the earlier ones were slow or taken with the machine busy |
| suitors | low | 329.3 | 18.5 | 177.9 | 149 | 115055 | 41 | 85 | sampled 3 times (13.9, 10.0, 329.3 fps): the earlier ones were slow or taken with the machine busy |

## How to read it

- Each row is 10 s of `requestAnimationFrame` in the fight, after 3 s of warm-up, with every defense key held so no attack lands and the fight does not end.
- **mean fps** is frames drawn over time elapsed. **slowest 1% frame** is the frame time that 99% of frames beat. **worst frame** is the single longest.
- **draw calls** and **triangles** are the median per frame over 1 s after the timing, summed over every pass (shadow map, scene, each post-processing pass). The game exposes no renderer under `/?debug`, so the script counts the draw calls on the canvas's WebGL context.
- **machine busy** is the share of the whole machine's processor time in use during the sample, this browser included. **processor speed** is how fast one core ran a fixed loop around the sample, against the fastest it ran during the whole run: a laptop that clamps its processor (heat, a power limit) shows a low number here.
- A sample is suspect when the machine was more than 65% busy, when the processor was under 40% speed, or when the frame rate came out under 50 fps with the cap on (with the cap off: under the same row with the cap on). Other work on the GPU cannot be measured from the script, so a low frame rate is the only sign of it. The script then leaves the fight, rests 15 s, waits (up to 180 s) for the machine to go quiet and come back to speed, goes back in and samples again, up to 5 times. The first sample that is not suspect is the row. A row whose samples were all suspect gets one more round of up to 5 at the end of the pass. If every sample is still suspect the fastest is the row, and the note lists them all: a stop that is slow every time is slow, not disturbed.
- If a fight ends inside a sample, the script goes back into the stop and samples the full 10 s again, so every row is 10 s of fight.
- The quality level is switched with the `q` key and checked against the `q: quality` label shown under `/?debug`.
- Pose tracking was off. With the webcam on, MediaPipe shares the GPU and the CPU, so expect less.

## Run it

```
node scripts/fps.mjs            # or: make fps
node scripts/fps.mjs --no-build --no-headroom --stops=polyphemus --seconds=5 --no-write
```

It needs Chrome and Playwright. Playwright is not a dependency of this repo: if `node_modules` has none, set `FPS_PLAYWRIGHT` to the folder of an install elsewhere (`.../node_modules/playwright-core`). `FPS_GL=swiftshader` forces software GL, `FPS_CHANNEL=msedge` uses Edge, `FPS_MACHINE` names the machine.
