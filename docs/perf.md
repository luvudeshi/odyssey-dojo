# Frame rate

Written by `node scripts/fps.mjs` (`make fps`). Do not edit by hand: run it again.

- **When:** 2026-11-14
- **Machine:** ASUS Vivobook 16 Flip TP3607AA (laptop, on mains power), Intel(R) Core(TM) Ultra 9 386H, 31 GB, Windows_NT 10.0.26200
- **WebGL renderer:** `ANGLE (Intel, Intel(R) Graphics (0x0000B0A0) Direct3D11 vs_5_0 ps_5_0, D3D11)`
- **GL:** hardware GL, on the GPU named above
- **Browser:** chrome 157.0.8103.52, headless, started with `--use-gl=angle --enable-gpu --ignore-gpu-blocklist --enable-unsafe-swiftshader --use-angle=d3d11`
- **Canvas:** 1280x720, device pixel ratio 1, keyboard only (no camera, no pose tracking), style Boxer

No measured stop is under 50 fps at the default quality (high).

Not measured: circe, sirens, scylla, charybdis, suitors. Not playable on this build: the stop has no 3D model yet, so the map keeps it locked. Run this again when their models land.

## As a player sees it: frame cap on

Headless Chrome draws at most 60 frames a second, so 60 means "at the cap".

| stop | quality | mean fps | slowest 1% frame (ms) | worst frame (ms) | draw calls | triangles | note |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| polyphemus | high | 60.0 | 17.0 | 17.2 | 115 | 33760 |  |
| polyphemus | low | 60.0 | 16.9 | 17.0 | 46 | 19697 |  |
| circe | - | n/a | n/a | n/a | n/a | n/a | not playable on this build: the stop has no 3D model yet, so the map keeps it locked |
| sirens | - | n/a | n/a | n/a | n/a | n/a | not playable on this build: the stop has no 3D model yet, so the map keeps it locked |
| scylla | - | n/a | n/a | n/a | n/a | n/a | not playable on this build: the stop has no 3D model yet, so the map keeps it locked |
| charybdis | - | n/a | n/a | n/a | n/a | n/a | not playable on this build: the stop has no 3D model yet, so the map keeps it locked |
| suitors | - | n/a | n/a | n/a | n/a | n/a | not playable on this build: the stop has no 3D model yet, so the map keeps it locked |

## Headroom: the same run with the frame cap off

Started with `--use-gl=angle --enable-gpu --ignore-gpu-blocklist --enable-unsafe-swiftshader --use-angle=d3d11 --disable-frame-rate-limit --disable-gpu-vsync`. Here mean fps is how fast the scene could be drawn, not what a player sees.

| stop | quality | mean fps | slowest 1% frame (ms) | worst frame (ms) | draw calls | triangles | note |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| polyphemus | high | 200.3 | 19.5 | 212.0 | 119 | 33846 |  |
| polyphemus | low | 676.5 | 13.0 | 157.2 | 49 | 19773 |  |
| circe | - | n/a | n/a | n/a | n/a | n/a | not playable on this build: the stop has no 3D model yet, so the map keeps it locked |
| sirens | - | n/a | n/a | n/a | n/a | n/a | not playable on this build: the stop has no 3D model yet, so the map keeps it locked |
| scylla | - | n/a | n/a | n/a | n/a | n/a | not playable on this build: the stop has no 3D model yet, so the map keeps it locked |
| charybdis | - | n/a | n/a | n/a | n/a | n/a | not playable on this build: the stop has no 3D model yet, so the map keeps it locked |
| suitors | - | n/a | n/a | n/a | n/a | n/a | not playable on this build: the stop has no 3D model yet, so the map keeps it locked |

## How to read it

- Each row is 10 s of `requestAnimationFrame` in the fight, after 3 s of warm-up, with every defense key held so no attack lands and the fight does not end.
- **mean fps** is frames drawn over time elapsed. **slowest 1% frame** is the frame time that 99% of frames beat. **worst frame** is the single longest.
- **draw calls** and **triangles** are the median per frame over 1 s after the timing, summed over every pass (shadow map, scene, each post-processing pass). The game exposes no renderer under `/?debug`, so the script counts the draw calls on the canvas's WebGL context.
- The quality level is switched with the `q` key and checked against the `q: quality` label shown under `/?debug`.
- Pose tracking was off. With the webcam on, MediaPipe shares the GPU and the CPU, so expect less.

## Run it

```
node scripts/fps.mjs            # or: make fps
node scripts/fps.mjs --no-build --no-headroom --stops=polyphemus --seconds=5 --no-write
```

It needs Chrome and Playwright. Playwright is not a dependency of this repo: if `node_modules` has none, set `FPS_PLAYWRIGHT` to the folder of an install elsewhere (`.../node_modules/playwright-core`). `FPS_GL=swiftshader` forces software GL, `FPS_CHANNEL=msedge` uses Edge, `FPS_MACHINE` names the machine.
