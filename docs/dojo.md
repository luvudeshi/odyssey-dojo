# The training dojo

Issue #172. A place to practise one move at a time, apart from the quest. An outline of somebody doing the move
plays, the player copies it, and every try gets a grade, points and one tip. At the end the screen says which
moves to work on and how.

The whole screen is one component, `src/coach/ui/Dojo.tsx`, with its rules in `src/coach/dojo.ts` (pure, tested
in `tests/coachDojo.test.ts`) and the grade in `src/coach/grade.ts`. In the game it is the Training Dojo card on
the main menu. It also runs on a page of its own (below).

Every number here that is not a detector's own is a first guess. Nothing has been tried on a real body yet.

## What the player sees

1. **The setup step**, before every session: the style, the moves and the tries at each. See "Choosing what to
   practise" below.
2. **For each move**, three tries (`reps`, default 3). A full style is its strikes, then block, duck and both
   dodges: 6 to 8 moves, about two minutes.
   - **Watch the outline** (2 s before the first try of a move, 1 s before the others): on the left a large
     figure does the move on a loop (`MoveGuide`, 440 px tall), with the live checklist of what the camera
     sees. On the right the move's name, one line on how, a dot for each try, and the points so far.
   - **Your turn!** (up to 3 s): the outline keeps looping, the checklist ticks as the player moves, a bar
     runs down. It ends early, 0.3 s after the move is counted.
   - **The grade** (1.2 s): the word in large letters, the points earned, and one tip.
3. **Training done**: the total out of the most possible, the highlights (best move, how many of each grade,
   the level) and a **Work on** list, then **Train again**, **Change moves** and **Done**.

Keys: on your turn the move's own key (the one the fight uses, shown on screen with no camera) or Space makes
the move; Space or Enter leaves a grade early; Escape quits. Reduced motion: the outline is shown as numbered
still poses and the grade does not animate.

## Choosing what to practise

Before every session a setup step asks what to train. It is its own component, `src/coach/ui/DojoSetup.tsx`, and
the lists behind it are in `src/coach/catalog.ts` (pure, tested in `tests/dojoCatalog.test.ts`).

- **Fighting style**: one button per style. The game's five come first, then the styles only the dojo has
  (`src/coach/extra`, see `docs/dojo-moves.md`). The style can be changed here; it does not have to be chosen in
  Story mode first. A style passed to the screen is the one selected at the start.
- **Moves**: a list of checkboxes in four groups (`dojoMenu`). Each move is in one group only.
  - *The style's strikes*, ticked at the start.
  - *Kicks and knees*: front kick, knee, and the dojo's roundhouse, side and low kick. They need the whole body in
    view, and the list says so. A style's own kicks stay in its own group, with the same note.
  - *Defends*: block, duck, both dodges (ticked at the start), high block and low block.
  - *More moves*: every strike of every other style. A god's power move is never on the list.
- **Select all** and **Clear**, and a line that says how many moves are ticked.
- **Tries at each move**: 1, 3 or 5.
- **Start training** is off until at least one move is ticked. The session trains exactly the ticked moves, in
  the order the list shows them.

**Change moves** (beside Quit during a session, and on the end screen) goes back to this step with the same
ticks. The last choice is kept in this browser under `odyssey-dojo.training` and comes back the next time; a
browser that will not store it just starts from the style's usual list.

All of it works from the keyboard: Tab moves between the buttons and boxes, Space ticks, Enter presses a button,
the arrow keys change the number of tries, Escape leaves.

A move only the dojo knows is trained like any other. The move lookup is `dojoMoveOf`, the outline is
`dojoGuideFor`, the live checklist reads `DOJO_MEASURES`, and a missed try gets the move's own tip
(`dojoJudgeRep`, `dojoTipFor`). None of these are used by the fights.

## The strip of moves

Along the bottom of a session a strip shows every move of the session in order (`src/coach/ui/DojoTrack.tsx`,
from `trackOf` in `src/coach/dojo.ts`). A finished move has a tick with its best grade and its points, the
current move is marked **Now**, the rest are **Next**. At the left it says how many are done ("2 of 6 done").
It is one row: with many moves it scrolls sideways and keeps the current move in view. It stops short of the
player's picture in the corner.

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
- **One line on what the session changes in the fights**, above the buttons. See the next section.

## What a session changes in the fights

Pressing **Done** hands the summary to the game. `src/App.tsx` keeps `assessmentFrom(summary)` (the `warmed`
action in `src/screens/flow.ts`), and from then on every fight uses `enemyFor(enemy, assessment)`, which is
`tuneFor` (`src/coach/warmup.ts`). It stays until another session is finished or the page is loaded again.

`tuneFor` changes two things and nothing else:

- **The warning before every attack**, by the level: a beginner gets 1.25 times as long, an average player the
  same, a good player 0.85 times (`TELEGRAPH_SCALE`).
- **How often an attack comes up.** Attacks stopped by a defend on the work-on list (the first two moves on it)
  get a heavier weight, at most 2.5 times (`MAX_LEAN`). A punch on the list changes no weights.

Damage, health, phases, weak spots and attack ids stay as they are. A session where every try was Good and none
was missed changes nothing at all.

The end screen says this in one line, `tuningLine(assessment, enemies)` in `src/coach/dojo.ts`. It runs `tuneFor`
on every monster and reads the answer off the result (`tuningOf`): all the tuned warning times over all the plain
ones, and which defends had an attack get heavier. So the line cannot say something the tuning did not do.

| Session | The line |
| --- | --- |
| Beginner, block and duck missed | Monsters will swing slower for you: 25% more warning before every attack. Expect more attacks you have to block or duck. |
| Average, nothing missed | Monsters will fight at the usual pace. |
| Good | Monsters will swing faster for you: 15% less warning before every attack. |

`tests/coachDojoTuning.test.ts` steps the real combat engine to the first attack for each of the three and pins
the lines. Leaving the end screen with Escape is quitting: the game is not told, so nothing is tuned.

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
- `?player=strong`: every try done well. `?player=weak`: sloppy punches and no defend seen. For the two ends of
  the line on what the session changes in the fights.
- `?camera=1`: the real camera. `?keyboard=1`: nobody plays; press the key shown.
- `?reps=2`, and `?slow=1` for the game's own timings (the page's are a little shorter).

## The component

```tsx
<Dojo
  tracker={tracker}        // the game's PoseTracker, or null for keyboard training
  style={style}            // optional: the style the setup step starts on
  moves={["jab", "block"]} // optional: the moves ticked at the start
  reps={3}                 // optional: the tries at each move at the start
  onDone={(summary) => {}} // the player pressed Done; summary.points, .workOn, .level, .reps
  onQuit={() => {}}        // optional: Quit / Back button and Escape
  keyboard={false}         // optional: show the key for each move; default true exactly when tracker is null
/>
```

It fills the window, brings its own stylesheet (`dojo.css`, theme variables with fallbacks) and leaves the camera
running when it goes away. If the tracker arrives while a session is running, the session starts again from the
first move.

## Not tested

- The setup step and the strip of moves were looked at in headless Chrome at 1280 x 720 on the keyboard only.
  No screen reader was tried, and no real camera.
- No real body and no real camera: every frame in the tests and on the demo page is made up.
- The line on what the session changes was looked at on the demo page only, not inside the game.
- The thresholds above (0.6, 0.58, 0.82) and the timings are first guesses.
