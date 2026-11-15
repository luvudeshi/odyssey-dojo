# Move guide

A large figure that does the move on a loop, with a live list of what the game is looking for. The idea is a dance game: the figure does it, you copy it, and you see at once which parts you have right.

It is built and tested but **not in the game yet**: the fight screen and the prompt card are the lead's, so the mount is in `NEEDS` at the bottom. Nobody has stood in front of a camera with it.

## What it shows

- **The figure.** A stick figure at least 280 px tall (size `large`), looping start pose, the move, back to the start, in a little under a second. The limb that moves is in the accent colour, with a dotted arrow along its path. A move of the whole body (duck, dodge, jump, dash) lights the body and puts the arrow beside it.
- **Toward the camera.** A flat picture cannot show forward. A straight punch, a push or a front kick is drawn as it looks from the front: the fist or foot comes to just in front of its own shoulder or hip and grows to about two and a half times its size, with a ring round it, and the words "Bigger = toward the camera". It is never drawn as an arm out to the side, which is what the prompt card's diagram shows and what the detectors reject.
- **Both halves of a move.** Hammer fist, overhead strike and thunderbolt raise the hand, then bring it down, because the move counts on the way down. Moon arrow holds the draw, then lets go. Chain punch throws the left, then the right. Trident sweep goes from one side to the other. Knife hand starts across the body; pushes and the sun burst start with the hands at the chest.
- **The name** in big letters (58 px at `large`, 40 px at `medium`) and **one line on how** in three to six words (28 px and 22 px).
- **Time left**, as a bar, when `msLeft` and `msTotal` are given.
- **The checklist.** Up to four rows, each one thing the move's detector checks, in plain words ("Left arm straight", "Snap left arm out fast"). A row's tick turns green the moment that condition is met on the newest frame, and a thin bar under it fills as the player gets nearer.
- **The match meter.** One big bar over every condition of the move. It reaches full and turns green, with "Match!", exactly when every condition is met, which is when the detector fires. It stays lit for 0.7 s, because a strike is over in a frame or two.

With `prefers-reduced-motion` nothing loops: the poses of the move are drawn side by side, numbered 1, 2, 3.

It is one dark panel with light text, so it reads on the pottery theme and on the dark pebble and star themes. Colours come from the theme's variables with fallbacks.

## Left and right

The camera view is mirrored by default (`mirror: true` in the settings), and pose frames and move diagrams already put the player's left at the left of the picture. `mirrored` defaults to true to match: the figure's left arm is on the left, and the player copies it like a mirror. `mirrored={false}` flips it, for a figure that faces the player like a teacher.

## Props

```tsx
import { MoveGuide } from "../coach/ui/MoveGuide";

<MoveGuide
  move={move}                       // MoveDef
  history={() => historyRef.current} // () => PoseHistory | null, read once per animation frame
  baseline={baseline}               // optional Baseline | null; left out, the history's own is used
  msLeft={phase.msLeft}             // optional, with msTotal: the time bar
  msTotal={phase.totalMs}
  size="large"                      // "large" (default) | "medium"
  mirrored                          // default true
/>
```

`history` returning null (keyboard, no camera) leaves the checklist as a plain list of what to do. Nothing in the component uses React state per frame: one `requestAnimationFrame` loop writes to the page, and stops when the component goes away. Give it `key={move.id}` so the loop starts from the start pose on a new move.

## The pure half

`src/coach/guide.ts`, exported from `src/coach`:

- `guideFor(move)`: `{ title, how, keyframes, loopMs, moving }`, or null for a move with no entry. Each keyframe is `{ t, pose, toward, forward }`: a flat figure in metres, and how far (0..1) the `forward` ends are toward the camera.
- `liveChecks(move, history, baseline?)`: `{ checks: { label, met, progress }[], overall, matched }`. At most four checks. `overall` is 1 only when every condition of the move is met.
- `poseAt(guide, ms)` and `toScreen(pose, toward, mirrored)`: the figure at a moment of the loop, and where to draw it.

The conditions come from `src/moves/measures.ts`. `LABELS` in `guide.ts` gives each one a player's label and a rank. Conditions the player rarely causes ("keep the other arm back") are shown only while they fail, in place of a row that is already met.

A new move needs an entry in `GUIDES` and in `LABELS`; `tests/coachGuide.test.ts` fails without them.

## What copying the figure does

`tests/coachGuide.test.ts` plays a made-up body that follows the keyframes exactly (`tools/guide/body.ts`, with half a metre of reach toward the camera where the figure shows it) through the real pose input. All 26 moves are counted.

Copying it also sets off other moves on the way, which the test does not forbid: the guard the figure starts from and returns to is read as a block or an uppercut for some moves, and pairs the game already confuses (spear thrust and double palm, dodge and dash) fire together. That is the detectors' cross-fire, not the guide's.

The figure uses the right leg for the kick and the knee, the right hand for the thunderbolt and the left arm as the bow arm, where the detector takes either side.

## See it

```
npm run dev
```

then open `/tools/guide/index.html` on the dev server. It goes through all the moves; the checklist is fed by the same made-up body, in step with the figure. `?move=jab` stays on one move; `?size=medium`, `?theme=pebble`, `?mirrored=0` and `?camera=0` change the rest. The page is not part of the game or its build.

## NEEDS (for the lead)

`src/hud`, `src/screens` and `src/core/types.ts` are yours, so these are not in this PR.

1. **Keep the history where the HUD can read it.** In `src/screens/FightScreen.tsx` the history is a local `let` inside the loop. Add `const historyRef = useRef<PoseHistory | null>(null);` next to `poseRef`, and after `history = pushFrame(history, frame);` add `historyRef.current = history;`. Leave it null when there is no tracker or in keyboard mode.
2. **Mount it.** Either of:
   - **In place of the prompt card's stick figure.** In `src/hud/Hud.tsx`, where `PromptCard` is rendered for a defend, strike or finisher phase, render instead (or at prompt level `full` only):
     `<MoveGuide key={move.id} move={move} history={() => historyRef.current} msLeft={phase.msLeft} msTotal={phase.totalMs} size="medium" />`
     `Hud` needs `historyRef` passed down from `FightScreen`; the history already carries the baseline, so `baseline` can be left out. The card's target line ("Hit the eye", "Boulder incoming") and key hint are not in the guide; keep them above it.
   - **Beside the camera panel.** In `FightScreen.tsx`, next to `<CameraView ... />`, the same element at `size="large"`, positioned bottom-left above or to the right of `.camera-view`, shown only while `phase.kind` is `defend`, `strike` or `finisher`. This keeps the figure next to the player's own picture, which is where the eyes go to compare.
3. **Size.** `large` is about 800 by 450 px, `medium` about 620 by 370 px. On a narrow screen the words drop under the figure.
4. **Optional, `src/core/types.ts`:** `diagramFrom?: MoveDiagram` on `MoveDef`, the start pose proposed in the ghost check. `guideFor` already reads it when it is there, in place of the wind-up poses written in `guide.ts`.
