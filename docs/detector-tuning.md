# Tuning the detectors on real bodies

Record a move once, keep the file, and every later change to a detector is checked against it by `npm test`. Nobody has to stand up again to find out whether a fix broke last hour's fix.

## Record a trace

1. Run `npm run dev` and open `http://localhost:5173/tools/recorder/index.html`. Allow the camera.
2. Stand where you would stand to play: head to hips in view, and knees and feet too for the kicks. The yellow skeleton should sit on your body.
3. Pick the move, type your name in **Person**, and press **Record**.
4. Stand still with your arms down through the 3, 2, 1. The last second of the countdown is measured as your neutral stance, the same way the game calibrates.
5. When the skeleton turns red, make the move **once**. Three seconds are recorded.
6. The browser downloads `<move>-<person>-<n>.json`, and the page says straight away whether the detectors read it correctly.
7. Move the file into `tests/fixtures/poses/`. Do not rename it: the name is the label.

Record `idle` takes too: standing, shifting your weight, scratching your nose, walking in and out. An `idle-*` file must fire nothing at all.

Useful takes for each move: one clean, one slow, one small, one from each person, and one from further back.

## What the test checks

`tests/moves/replay.test.ts` plays every file in `tests/fixtures/poses/` through all the detectors, frame by frame, with the same hold and release levels as the game (on at 0.70, off below 0.40).

| File name | Must happen |
|---|---|
| a strike, such as `jab-ana-1.json` | that strike fires exactly once, and no other strike fires |
| a defend move, such as `duck-ana-1.json` | that move is held on at least one frame, and no strike fires |
| `idle-ana-1.json` | no strike fires and no defend move is held |

Run only this test with `npx vitest run tests/moves/replay.test.ts`.

## When a trace fails

The failure names the file and says what went wrong, with the highest confidence each move reached.

- **`jab did not fire (peak 0.55, needs 0.70)`**: the detector is too strict for this body. Open `src/moves/defs/jab.ts`, find the threshold the motion missed, and loosen it a little. Rerun the test: every older trace must still pass.
- **`hook also fired (peak 1.00)`**: two detectors accept the same motion. Tighten the one that should not have fired, usually by requiring the part of its motion that this take does not have.
- **`jab fired 2 times, not once`**: the confidence dipped below 0.40 and came back. Smooth the detector or widen the gap between its two levels. If the person really did jab twice, record it again.
- **`block was held while idle`**: a resting pose reads as a defense. Tighten that defend move.
- **The take itself was bad** (wrong move, half out of frame, two moves): delete the file and record again. Never edit a trace by hand.

If the fix needs a change in `src/pose/` or `src/input/`, write `NEEDS:` on the issue for the lead.

Do not loosen a threshold until the trace passes and stop there. Look at why it missed: a real webcam punch comes toward the camera, so it shortens in the picture instead of travelling across it.

## Known overlap

Hands that shoot from the waist up to the chin in under 0.4 seconds read as `rising_palm` and `uppercut`, because that is what those moves are. So a take of `block` or `jab` that starts with the arms hanging and snaps up will also fire them. In a fight this does not matter, because only the strike being asked for counts. For a clean trace, raise the guard at a normal pace, or record such takes on purpose and tune the two moves against them.

## The file

JSON, about 100 kB for three seconds. `baseline` is the neutral stance. Each frame has a time in milliseconds from the first frame and 33 points for `image` (0 to 1 across the mirrored picture) and `world` (metres from the hips), each stored as `[x, y, z, visibility]`. The format lives in `tools/recorder/trace.ts`.

The three `*-madeup-1.json` files are not real people. They were generated from the made-up poses in `tests/helpers/poses.ts` so the test had something to run before the first recording. Delete them once real traces of those moves are in.
