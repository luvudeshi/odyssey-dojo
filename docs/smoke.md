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

- Each fight is opened at `/?stop=<id>` in a fresh browser context: the main menu with the "Play with" setting on Keyboard, Story mode, the character screen ("Fight as ...", the character already chosen), the style, then the open stop on the map. The click on the stop plays the boss cutscene, which ends by itself, and then the fight starts. `--styles=all` plays every stop with every style; without it each stop is played once, with the first style on the style screen.
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
node scripts/smoke.mjs --dev --no-write
```

For Edge, or both browsers one after the other, set `FPS_CHANNEL` first:

```
FPS_CHANNEL=msedge node scripts/smoke.mjs --styles=all
FPS_CHANNEL=chrome,msedge node scripts/smoke.mjs --styles=all
```

`--port=4393` serves the build on that port (a free one is picked otherwise). `--dev` builds nothing and serves the source through vite's dev server, for a machine where a build is too heavy; the pages then run React's development build, so the built game is still the last word. `--query=ghost=1` adds that to the page address. `--shots=<folder>` saves one picture per fight, taken while the fifth prompt card is up.

It needs Chrome (or Edge) and Playwright. Playwright is not a dependency of this repo: if `node_modules` has none, set `FPS_PLAYWRIGHT` to a playwright-core folder (`.../node_modules/playwright-core`). `FPS_GL=swiftshader` forces software GL, `FPS_MACHINE` names the machine. These are the same variables `scripts/fps.mjs` reads.

## Training Dojo

The fights above never open the Training Dojo. `scripts/dojo-smoke.mjs` does: it starts the dev server on a free port, opens the Dojo from the main menu in a headless browser at 1280x720, and trains every style on the setup step by keyboard, from the setup step to the end screen. It builds nothing and writes no file. A full run takes about five minutes.

```
node scripts/dojo-smoke.mjs
node scripts/dojo-smoke.mjs --styles=boxer,taekwondo --shots=out/dojo
node scripts/dojo-smoke.mjs --url=http://127.0.0.1:5173
```

`--styles` plays only those style ids. `--shots=<folder>` saves pictures per style: the setup step, the move with the longest name in training, the end screen and, on the first style, the grade of a turn left to run out. `--url` uses a server that is already running and starts none; `--port` picks the port of the one it starts. It needs Chrome and Playwright, found the same way as above (`FPS_PLAYWRIGHT`, `FPS_CHANNEL`, `FPS_GL`).

It prints one `PASS` or `FAIL` line per check, then the count and one last `PASS` or `FAIL`, and exits with code 1 when any check failed. A `NOTE` line says something worth knowing that fails nothing.

What it checks:

- **The setup step.** The Training Dojo card opens it. It offers every style of `dojoStyles()` (the game's five, then the Dojo's own), 1, 3 and 5 tries, and every move only the Dojo knows. With every move unticked Start training is off and no session starts. Select all ticks every move.
- **Every style.** Its button is the one pressed after a click, its usual moves (its strikes, then block, duck and both dodges) are listed and ticked and nothing else is, and the count line agrees. Start opens a session with those moves in the order listed.
- **Every move of the session.** Its own name as the title, an outline figure that moves, a checklist that is not empty, and the key hint for its own key. The key makes the move, the grade is Excellent with its points, and the points on screen add up. This is the same for the moves only the Dojo knows: each has a key, so each is made, not skipped.
- **The strip along the bottom**, at every move: "n of N done", one chip per move in order, the ones before marked done with their points, the current one marked and in view, the rest marked next.
- **The end screen.** The total out of the most possible, and Train again, Change moves and Done on the screen.
- **Nothing cut**, at 1280x720: no move title, chip, checklist line, style button or move on the list is wider than its box, broken in the middle of a word, outside the box that holds it or off the screen, and nothing in the top bar sits on something else. The strip stays on the screen while a grade is shown.
- **On the first style played**: a wrong key does not end the turn, Space makes the move, a grade left alone passes by itself, a turn left to run out is graded Needs improvement and says to press the key, Train again starts from the top, and Change moves in the middle of a session comes back to the same choice. One style is played with three tries, the others with one. Change moves on every end screen comes back to the same choice.
- **Every move in one session**: Select all, one try each, then Done goes back to the main menu.
- **Leaving and coming back.** Escape and Quit in a session, Escape and Back on the setup step all go to the main menu. After a reload the setup step comes back on the last choice, and `odyssey-dojo.training` in localStorage holds it.
- **The page**: no console error, no uncaught error, and no request that failed or answered 4xx or 5xx in the whole run.

How it finds things: the style names, the move names, ids and keys, the usual defends, the points and the storage key are read from `src/`. The Dojo's steps are read from `data-phase`, `data-move` and `data-rep` on its `main`. The rest is found by role and label: the buttons by name, the strip as the section labelled "Moves in this session", the outline as the section labelled "How to do ...", the checklist as the list labelled "What the camera is looking for", the points as the element labelled "... points". No CSS class and no colour is read, so a new look should not break it.

What it does not check:

- **The camera.** The "Play with" setting is put on Keyboard, so every try is a key press. Whether a detector counts a real kick or block, the live checklist ticking, the camera picture in the corner and the grades Good and Excellent from a real body are not seen here. `scripts/webcam-smoke.mjs` (docs/webcam-smoke.md) plays a recorded video for that.
- **Other sizes.** Only 1280x720 is measured.
- **Five tries**, reduced motion, the sound, and what Done changes in the fights.
- **How it looks.** It measures boxes; it does not judge the picture. Look at the `--shots` pictures for that.

On a busy machine a headless browser can stop drawing frames for many seconds. The Dojo runs on the clock and carries on when the frames come back, so the script waits (up to two minutes) while the browser draws nothing, and says so in a `NOTE` at the end. A step that is late while the browser is drawing frames is a `FAIL`.

`node scripts/smoke.mjs` writes the rest of this file again from its own text and keeps this section as it finds it (`KEPT_SECTIONS` in that script). Edit this section here, by hand.
