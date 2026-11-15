# The training dojo

Issue #172. A place to practise one move at a time, apart from the quest. An outline of somebody doing the move
plays, the player copies it, and every try gets a grade, points and one tip. At the end the screen says which
moves to work on and how.

The whole screen is one component, `src/coach/ui/Dojo.tsx`, with its rules in `src/coach/dojo.ts` (pure, tested
in `tests/coachDojo.test.ts`) and the grade in `src/coach/grade.ts`. It is not mounted in the game yet: that
needs two lead-only files, and the exact lines are at the end of this page. Until then it runs on a page of its
own (below).

Every number here that is not a detector's own is a first guess. Nothing has been tried on a real body yet.

## What the player sees

1. **Opened with no style chosen** (from the title screen): five buttons, one per fighting style, each listing
   its strikes. Opened with a style, this step is skipped.
2. **For each move**, three tries (`reps`, default 3). A full style is its strikes, then block, duck and both
   dodges: 6 to 8 moves, about two minutes.
   - **Watch the outline** (2 s before the first try of a move, 1 s before the others): on the left a large
     figure does the move on a loop (`MoveGuide`, 440 px tall), with the live checklist of what the camera
     sees. On the right the move's name, one line on how, a dot for each try, and the points so far.
   - **Your turn!** (up to 3 s): the outline keeps looping, the checklist ticks as the player moves, a bar
     runs down. It ends early, 0.3 s after the move is counted.
   - **The grade** (1.2 s): the word in large letters, the points earned, and one tip.
3. **Training done**: the total out of the most possible, the highlights (best move, how many of each grade,
   the level) and a **Work on** list, then **Train again** and **Done**.

Keys: on your turn the move's own key (the one the fight uses, shown on screen with no camera) or Space makes
the move; Space or Enter leaves a grade early; Escape quits. Reduced motion: the outline is shown as numbered
still poses and the grade does not animate.

## Grades and points

| Grade | Points | When |
| --- | --- | --- |
| Excellent! | 150 | The move counted and was made well. |
| Good | 100 | The move counted. |
| Needs improvement | 25 | The move was not recognised in the 3 seconds. |

Training is lenient on purpose:

- **Anything that counts is at least Good.** There is no way to make the move and be marked down.
- **A near miss counts.** The fight counts a move when its detector is 0.7 sure. Training counts from 0.6
  (`COUNT_FROM`). A near miss is Good, never Excellent, and still gets the tip for what was short.
- **Excellent is easier than in the fight.** A strike is Excellent from a quality of 0.58
  (`STRIKE_FOR_EXCELLENT`), not 0.7: copying the outline exactly scores a jab 0.69 on the fight's scale, and
  that should be Excellent. A defend has no quality score, so it is graded on how sure its detector got:
  Excellent from 0.82 (`SURE_FOR_EXCELLENT`), Good below that.
- **What the screen counted stays counted.** The try is judged again from its frames for the tip
  (`judgeRep` in `src/coach/practice.ts`); that second look can add a tip but cannot take the grade away.
- A key press is Excellent, as the fight gives a key press its full quality.

The tip under **Needs improvement** is always there: the weakest measured part of the try, or what stopped it
being seen (nobody in the picture, feet out of view, no move made). Under **Good** the tip is the part to
sharpen, when one was weak. `docs/practice.md` lists every tip.

## The end screen

- **Best move**: the highest average points; on a tie the higher quality.
- **Work on**: the moves with a try that was not recognised, lowest average first, at most three. Each has one
  line: the tip for the part that went wrong most often on the missed tries.
- If every try counted, the one weakest move is listed as **to sharpen**, with the tip for its weak part or,
  with none, the move's own how-to line. If every try was Excellent the list is empty and says so.
- **Your level**: beginner, average or good, from the skill number below.

## For the game: skill from a training session

`skillFrom({ reps })` gives a number from 0 to 1 (Excellent 1, Good 0.6, Needs improvement 0, averaged) and the
warm-up's level word for it (beginner under 0.4, average under 0.75, good from there).

`assessmentFrom({ reps })` gives the same `Assessment` the warm-up gives (`src/coach/contract.ts`), so
`tuneFor(enemy, assessment)` can tune the monsters from a training session with no other change: one step per
move, the work-on moves as the focus (at most two), no habits. `onDone` hands over the summary, whose `reps` is
what both functions take.

## Trying it without the game

`make dev`, then open `/tools/dojo/index.html`. A made-up player (`tools/dojo/player.ts`) takes each turn: one
try copied from the outline, one sloppy, one missed, so every grade and the work-on list show with no camera.

- `?quick=1`: five moves (two strikes, block, duck, one dodge), under a minute and a half.
- `?style=karate`: another style. `?style=ask`: no style given, as from the title screen.
- `?camera=1`: the real camera. `?keyboard=1`: nobody plays; press the key shown.
- `?reps=2`, and `?slow=1` for the game's own timings (the page's are a little shorter).

## The component

```tsx
<Dojo
  tracker={tracker}        // the game's PoseTracker, or null for keyboard training
  style={style}            // optional: left out or null, the screen asks which style
  moves={["jab", "block"]} // optional: default is the style's strikes, then the four defends
  reps={3}                 // optional
  onDone={(summary) => {}} // the player pressed Done; summary.points, .workOn, .level, .reps
  onQuit={() => {}}        // optional: Quit / Back button and Escape
  keyboard={false}         // optional: show the key for each move; default true exactly when tracker is null
/>
```

It fills the window, brings its own stylesheet (`dojo.css`, theme variables with fallbacks) and leaves the camera
running when it goes away. If the tracker arrives while a session is running, the session starts again from the
first move.

## NEEDS: the mount (lead-only files)

The title screen offers two choices: **Play the Odyssey** (the quest, as today) and **Training Dojo**. These
lines were tried against `main` in a local build (title screen, Training Dojo, pick a style, a key press graded,
Escape back to the title) and then taken out again; they are not in the PR.

`src/screens/TitleScreen.tsx`:

1. Add `onTraining?: () => void` to the props.
2. In the first `menu__row`, rename the primary button and add the second one beside it:

```tsx
<Button primary onClick={() => { speakLine("homer_title"); props.onCamera(); }}>Play the Odyssey (webcam)</Button>
{props.onTraining && <Button onClick={props.onTraining}>Training Dojo</Button>}
```

`src/App.tsx`:

1. With the imports: `import { Dojo } from "./coach/ui/Dojo";`
2. With the other `useState` lines: `const [training, setTraining] = useState(false);`
3. Just above `if (flow.screen === "title") {`:

```tsx
// The training dojo, from the title. The camera is asked for while the player picks a style; refused, it is keyboard training.
const openTraining = (): void => {
  setCameraProblem("");
  setTraining(true);
  if (!tracker) camera.start().then(setTracker, (error: unknown) => { log("warn", "tracker_failed", error); });
};

if (training) {
  return <Dojo tracker={tracker} style={flow.style} onDone={() => { setTraining(false); }} onQuit={() => { setTraining(false); }} />;
}
```

4. On `<TitleScreen ... />` add `onTraining={openTraining}`.

Nothing in `src/screens/flow.ts` changes: training is not a stop on the quest, so it is a flag beside the flow
and both ways out of it land back on the title. To tune the monsters from training, the `onDone` above can
become `onDone={(summary) => { setTraining(false); /* keep assessmentFrom(summary) for enemyFor */ }}`; today
`flow.assessment` is only set by the `warmed` action on the intro screen, so that needs one more action in
`flow.ts`.

## Not tested

- No real body and no real camera: every frame in the tests and on the demo page is made up.
- The camera being granted from the title screen (the trial build ran in a browser with no camera, so it
  trained on the keyboard).
- The thresholds above (0.6, 0.58, 0.82) and the timings are first guesses.
