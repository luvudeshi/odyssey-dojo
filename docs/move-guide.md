# Move guide

A figure that does the move on a loop, with a live list of what the game is looking for. The idea is a dance game: the figure does it, you copy it, and you see at once which parts you have right.

It is built and tested but **not in the game yet**: the fight screen and the prompt card are the lead's, so the mount is in `NEEDS` at the bottom. Nobody has stood in front of a camera with it.

## The card size

The lead's ruling (issue #33) is that the guide goes inside the one prompt card at the right edge, in place of the still diagram, and never over the hero or the monster. So the default size is `card`: a box 260 px wide and at most 300 px tall (225 to 295 px across the 26 moves). From the top it holds:

- the figure, 140 px tall, drawn in a box fitted to that move so it fills the width it has;
- the how line, 18 px bold, on one or two lines;
- the time bar (when `msLeft` and `msTotal` are given) and the match bar with its percentage, which reads "Match!" when the move counts;
- at most three checks, 18 px, one line each. A row fills from the left as the player gets nearer and turns green with a tick when met.

The card has no name, no kind and no "bigger = toward the camera" line: the prompt card already shows the name, and the ring and the growing fist carry the depth. No text in it is under 18 px.

`medium` and `large` are the same guide for a screen of its own (a practice page, say). The rest of this section describes them where they differ.

## What it shows

- **The figure.** A stick figure (140 px tall on the card, 420 px at `large`), looping start pose, the move, back to the start, in a little under a second. The limb that moves is in the accent colour, with a dotted arrow along its path. A move of the whole body (duck, dodge, jump, dash) lights the body and puts the arrow beside it.
- **Toward the camera.** A flat picture cannot show forward. A straight punch, a push or a front kick is drawn as it looks from the front: the fist or foot comes to just in front of its own shoulder or hip and grows to about two and a half times its size, with a ring round it, and at the larger sizes the words "Bigger = toward the camera". It is never drawn as an arm out to the side, which is what the prompt card's diagram shows and what the detectors reject.
- **Both halves of a move.** Hammer fist, overhead strike and thunderbolt raise the hand, then bring it down, because the move counts on the way down. Moon arrow holds the draw, then lets go. Chain punch throws the left, then the right. Trident sweep goes from one side to the other. Knife hand starts across the body; pushes and the sun burst start with the hands at the chest.
- **One line on how** in three to six words (18 px on the card, 22 px and 28 px larger), and at the larger sizes **the name** in big letters (40 px and 58 px).
- **Time left**, as a bar, when `msLeft` and `msTotal` are given.
- **The checklist.** Up to three rows on the card and four at the larger sizes, each one thing the move's detector checks, in plain words ("Left arm straight", "Snap left arm out fast"). A row's tick turns green the moment that condition is met on the newest frame, and the row (a thin bar under it at the larger sizes) fills as the player gets nearer.
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
  size="card"                       // "card" (default) | "medium" | "large"
  mirrored                          // default true
/>
```

`history` returning null (keyboard, no camera) leaves the checklist as a plain list of what to do. Nothing in the component uses React state per frame: one `requestAnimationFrame` loop writes to the page, and stops when the component goes away. Give it `key={move.id}` so the loop starts from the start pose on a new move.

## The pure half

`src/coach/guide.ts`, exported from `src/coach`:

- `guideFor(move)`: `{ title, how, keyframes, loopMs, moving }`, or null for a move with no entry. Each keyframe is `{ t, pose, toward, forward }`: a flat figure in metres, and how far (0..1) the `forward` ends are toward the camera.
- `liveChecks(move, history, baseline?, max = 4)`: `{ checks: { label, met, progress }[], overall, matched }`. At most `max` checks (the card asks for three). `overall` is 1 only when every condition of the move is met.
- `poseAt(guide, ms)` and `toScreen(pose, toward, mirrored)`: the figure at a moment of the loop, and where to draw it.

The conditions come from `src/moves/measures.ts`. `LABELS` in `guide.ts` gives each one a player's label and a rank. Conditions the player rarely causes ("keep the other arm back") are shown only while they fail, in place of a row that is already met.

### Labels follow the conditions

The detectors get retuned, and the table gains, loses and reorders conditions. So a label is tied to its condition, not to its place in the list:

- Each entry in `LABELS` names its condition by `conditionKey`: the condition's `name` in `measures.ts` up to the first comma or bracket, with every number written `#` ("ms since left elbow was bent under 115" is `ms since left elbow was bent under #`). It also says which way the condition compares (`min`, `max`, or `group` for an "any of"). Both have to agree. A changed threshold or unit keeps its label; a condition turned round does not.
- A condition with no entry gets `plainLabel`: its own name without units and numbers, cut to 28 characters ("Left elbow opening"). It is clumsier, but it is about the right condition, and it is shown only while it fails. A move whose conditions are all new shows them as they come.
- An entry whose condition has gone is not used. Nothing throws either way, and the match meter always counts every condition in the table.

`labelOf(moveId, condition)` gives the label, its rank and whether it was written. A written label says what the condition means in that move at about today's threshold: if a threshold moves far (shoulder height to overhead, say), reword the label.

A written label is at most 28 characters, which is what fits one line of the 260 px card at 18 px beside the tick.

A new move needs an entry in `GUIDES`, or `tests/coachGuide.test.ts` fails. It should get entries in `LABELS` too; until it does, its checklist is made of plain labels.

## What copying the figure does

`tests/coachGuide.test.ts` plays a made-up body that follows the keyframes exactly (`tools/guide/body.ts`, with half a metre of reach toward the camera where the figure shows it) through the real pose input. All 26 moves are counted.

Copying it also sets off other moves on the way, which the test does not forbid: the guard the figure starts from and returns to is read as a block or an uppercut for some moves, and pairs the game already confuses (spear thrust and double palm, dodge and dash) fire together. That is the detectors' cross-fire, not the guide's.

The figure uses the right leg for the kick and the knee, the right hand for the thunderbolt and the left arm as the bow arm, where the detector takes either side.

## See it

```
npm run dev
```

then open `/tools/guide/index.html` on the dev server. It goes through all the moves; the checklist is fed by the same made-up body, in step with the figure. `?move=jab` stays on one move; `?size=medium` or `?size=large` (the card is the default), `?theme=pebble`, `?mirrored=0` and `?camera=0` change the rest. The page is not part of the game or its build.

## NEEDS (for the lead)

`src/hud`, `src/screens` and `src/core/types.ts` are yours, so these are not in this PR.

1. **Keep the history where the HUD can read it.** In `src/screens/FightScreen.tsx` the history is a local `let` inside the loop. Add `const historyRef = useRef<PoseHistory | null>(null);` next to `poseRef`, and after `history = pushFrame(history, frame);` add `historyRef.current = history;`. Leave it null when there is no tracker or in keyboard mode. Pass `historyRef` down to `Hud`.
2. **Mount it inside the prompt card, in place of the still diagram.** In the prompt card in `src/hud`, where the move's stick figure is drawn for a defend, strike or finisher phase, render instead:
   `<MoveGuide key={move.id} move={move} history={() => historyRef.current} />`
   The default size is the card: 260 px wide, at most 300 px tall, three checks at 18 px. Keep the card's own name, target line ("Hit the eye", "Boulder incoming"), key hint and timer; the guide repeats none of them. If the card's timer should be the guide's bar instead, add `msLeft={phase.msLeft} msTotal={phase.totalMs}`. The history already carries the baseline, so `baseline` can be left out.
3. **Room.** The guide sets its own width to 260 px and has its own dark panel and 2 px border. If the card is narrower than that inside its padding, say so and the width can become a variable. It never draws outside its own box, so it stays where the card is: nothing over the hero or the monster.
4. **Optional, `src/core/types.ts`:** `diagramFrom?: MoveDiagram` on `MoveDef`, the start pose proposed in the ghost check. `guideFor` already reads it when it is there, in place of the wind-up poses written in `guide.ts`.
