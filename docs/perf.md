# Frame rate

Written by `node scripts/fps.mjs` (`make fps`). Do not edit by hand: run it again.

- **When:** 2026-11-15
- **Machine:** ASUS Vivobook 16 Flip TP3607AA (laptop, on mains power), Intel(R) Core(TM) Ultra 9 386H, 31 GB, Windows_NT 10.0.26200
- **WebGL renderer:** `ANGLE (Intel, Intel(R) Graphics (0x0000B0A0) Direct3D11 vs_5_0 ps_5_0, D3D11)`
- **GL:** hardware GL, on the GPU named above
- **Browser:** chrome 157.0.8103.52, headless, started with `--use-gl=angle --enable-gpu --ignore-gpu-blocklist --enable-unsafe-swiftshader --use-angle=d3d11`
- **Canvas:** 1280x720, device pixel ratio 1, keyboard only (no camera, no pose tracking), style Boxer

No measured stop is under 50 fps at the default quality (high).

5 of 24 rows were sampled more than once because the machine was busy with other work or its processor was running slow at the time; the notes say which, and "How to read it" says how that is decided.

## What costs the most

The three heaviest stops at each quality level, from the run with the frame cap on. Draw calls and triangles are per frame.

- **high**, by draw calls: suitors (222 draw calls, 127634 triangles), polyphemus (163 draw calls, 62666 triangles), sirens (161 draw calls, 79796 triangles)
- **high**, by triangles: suitors (222 draw calls, 127634 triangles), sirens (161 draw calls, 79796 triangles), circe (139 draw calls, 69630 triangles)
- **low**, by draw calls: suitors (141 draw calls, 69226 triangles), sirens (98 draw calls, 50029 triangles), scylla (94 draw calls, 33419 triangles)
- **low**, by triangles: suitors (141 draw calls, 69226 triangles), sirens (98 draw calls, 50029 triangles), circe (93 draw calls, 38973 triangles)

Every measured stop draws fewer triangles at low than at high.

## As a player sees it: frame cap on

Headless Chrome draws at most 60 frames a second, so 60 means "at the cap".

| stop | quality | mean fps | slowest 1% frame (ms) | worst frame (ms) | draw calls | triangles | machine busy (%) | processor speed (%) | note |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| polyphemus | high | 60.0 | 17.0 | 17.7 | 163 | 62666 | 18 | 100 |  |
| polyphemus | low | 60.0 | 16.9 | 17.1 | 56 | 32115 | 20 | 98 |  |
| circe | high | 60.0 | 17.0 | 17.2 | 139 | 69630 | 13 | 93 |  |
| circe | low | 60.0 | 16.9 | 17.0 | 93 | 38973 | 21 | 100 |  |
| sirens | high | 60.0 | 17.0 | 18.5 | 161 | 79796 | 18 | 82 |  |
| sirens | low | 60.0 | 17.0 | 17.4 | 98 | 50029 | 18 | 61 | sampled again 2x because the machine was busy or slow |
| scylla | high | 60.0 | 16.9 | 17.2 | 156 | 57576 | 25 | 62 |  |
| scylla | low | 60.0 | 16.9 | 29.8 | 94 | 33419 | 23 | 61 |  |
| charybdis | high | 60.0 | 17.0 | 17.1 | 126 | 47200 | 23 | 63 |  |
| charybdis | low | 60.0 | 17.0 | 17.3 | 86 | 31929 | 20 | 64 |  |
| suitors | high | 60.0 | 17.0 | 17.1 | 222 | 127634 | 25 | 64 |  |
| suitors | low | 60.0 | 16.9 | 17.0 | 141 | 69226 | 28 | 66 |  |

## Headroom: the same run with the frame cap off

Started with `--use-gl=angle --enable-gpu --ignore-gpu-blocklist --enable-unsafe-swiftshader --use-angle=d3d11 --disable-frame-rate-limit --disable-gpu-vsync`. Here mean fps is how fast the scene could be drawn, not what a player sees.

| stop | quality | mean fps | slowest 1% frame (ms) | worst frame (ms) | draw calls | triangles | machine busy (%) | processor speed (%) | note |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| polyphemus | high | 189.3 | 22.3 | 34.2 | 163 | 62666 | 39 | 65 |  |
| polyphemus | low | 474.0 | 4.5 | 22.8 | 56 | 32115 | 49 | 65 |  |
| circe | high | 190.4 | 23.6 | 185.3 | 139 | 69630 | 36 | 62 |  |
| circe | low | 418.7 | 4.6 | 5.7 | 93 | 38973 | 46 | 86 |  |
| sirens | high | 199.6 | 19.8 | 38.2 | 161 | 79796 | 32 | 61 | sampled again 1x because the machine was busy or slow |
| sirens | low | 396.5 | 4.7 | 11.9 | 117 | 51661 | 40 | 64 |  |
| scylla | high | 208.3 | 20.1 | 32.3 | 156 | 57576 | 32 | 63 |  |
| scylla | low | 350.4 | 4.9 | 12.5 | 94 | 33419 | 47 | 63 |  |
| charybdis | high | 207.2 | 18.7 | 204.9 | 126 | 47200 | 51 | 63 | sampled again 3x because the machine was busy or slow |
| charybdis | low | 386.0 | 6.4 | 27.3 | 85 | 31761 | 59 | 77 |  |
| suitors | high | 150.4 | 12.5 | 113.9 | 219 | 128086 | 56 | 50 | the machine was busy or slow in every sample, so the frame rate may be too low |
| suitors | low | 264.7 | 6.7 | 31.9 | 124 | 68180 | 36 | 56 | the machine was busy or slow in every sample, so the frame rate may be too low |

## How to read it

- Each row is 10 s of `requestAnimationFrame` in the fight, after 3 s of warm-up, with every defense key held so no attack lands and the fight does not end.
- **mean fps** is frames drawn over time elapsed. **slowest 1% frame** is the frame time that 99% of frames beat. **worst frame** is the single longest.
- **draw calls** and **triangles** are the median per frame over 1 s after the timing, summed over every pass (shadow map, scene, each post-processing pass). The game exposes no renderer under `/?debug`, so the script counts the draw calls on the canvas's WebGL context.
- **machine busy** is the share of the whole machine's processor time in use during the sample, this browser included. **processor speed** is how fast one core ran a fixed loop around the sample, against the fastest it ran during the whole run: a laptop that clamps its processor (heat, a power limit) shows a low number here.
- A sample with the machine more than 65% busy or the processor under 60% speed says more about the machine than about the scene. The script then leaves the fight, waits (up to 180 s) for the machine to go quiet and come back to speed, goes back in and samples again, up to 5 times, and keeps the least disturbed sample. The note says when that happened.
- If a fight ends inside a sample, the script goes back into the stop and samples the full 10 s again, so every row is 10 s of fight.
- The quality level is switched with the `q` key and checked against the `q: quality` label shown under `/?debug`.
- Pose tracking was off. With the webcam on, MediaPipe shares the GPU and the CPU, so expect less.

## Run it

```
node scripts/fps.mjs            # or: make fps
node scripts/fps.mjs --no-build --no-headroom --stops=polyphemus --seconds=5 --no-write
```

It needs Chrome and Playwright. Playwright is not a dependency of this repo: if `node_modules` has none, set `FPS_PLAYWRIGHT` to the folder of an install elsewhere (`.../node_modules/playwright-core`). `FPS_GL=swiftshader` forces software GL, `FPS_CHANNEL=msedge` uses Edge, `FPS_MACHINE` names the machine.
