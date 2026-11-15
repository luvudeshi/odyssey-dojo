# The warm-up skill check

Before the first fight the player can make six moves in front of the camera. Each one is shown by a large
figure doing it, and each attempt gets a grade and points. From that the game knows the player's level,
which moves to work on, and how hard to make the fights. Issues #50 and #172.

- `src/coach/warmup.ts`: the steps, the score and grade of a step, the level, `tuneFor`, the lines.
- `src/coach/grade.ts`: the three grades and their points (shared with training).
- `src/coach/warmupGrades.ts`: the grade and tip for one step, and the end-of-warm-up highlights.
- `src/coach/ui/gradedRun.ts`: the run as a state machine. `src/coach/ui/WarmUp.tsx`: the screen.
- `src/coach/contract.ts`: the types the screen and the check share.

Every number below is a first guess. Nothing here has been tried on a real body yet.

## What the player sees

1. Two seconds of "Stand where the camera sees you". These standing frames are the measure the dodges and
   the duck are read against. If the camera saw nobody, the screen says so and offers to try again.
2. For each of the six steps: the move guide at its large size (a figure at least 320 px tall on a
   1280x720 screen, looping the move, with the move's name, one line on how, the time left and a live
   checklist that ticks as the camera sees each part). The step ends 0.35 seconds after the move is seen,
   or after 2.5 seconds if it never is.
3. Then, for 1.2 seconds, the grade over the figure: **Excellent!** +150, **Good** +100 or
   **Needs improvement** +25, and under "Needs improvement" one line on how to fix it. A running points
   total is at the top the whole time.
4. At the end: the total, each move's grade, the best move, and a "Work on" list of up to three moves
   graded lowest, each with one line on how to improve it. If every move was Good or better it says so and
   still names the weakest as the one to sharpen. The last line says what the fights will do about it,
   for example "Polyphemus will swing slower for you: 25% more warning before every attack."

A player who makes each move at once is through in about 15 seconds; one who makes none takes about 24.

| Step | The screen says |
| --- | --- |
| jab | Jab: left fist straight out |
| cross | Cross: right fist straight out |
| block | Block: both fists up to your face |
| dodge_left | Dodge left: step to your left |
| dodge_right | Dodge right: step to your right |
| duck | Duck: bend your knees, drop low |

## How a step is read

The frames go through the same move detectors the fight uses. A move counts as seen when its detector
reaches 0.7, the line the fight uses. For each step:

- `done`: the move was seen inside the step's time. The same move made in another step's time, or while a
  grade is on screen (`restMs`), does not count.
- `reactMs`: the time from the start of the step to the first frame the move was seen.
- `quality`: for a punch, how well it was thrown (the move's own quality score: speed, a straight arm, aim).
  For a defense, the surest the detector got.

The screen reads the steps live (`advance` in `gradedRun.ts`). At the end `assessWarmup(frames,
startedAtMs, steps)` is handed the same frames and the steps as they were really timed, and reads them
the same way.

## The grade rule

Lenient on purpose: anything the detector counted is at least Good.

| What happened | Grade | Points |
| --- | --- | --- |
| The move was not seen | Needs improvement | 25 |
| Seen | Good | 100 |
| Seen, and speed and quality together reach 0.7 | Excellent! | 150 |

Speed and quality each count for half. Speed is full at 1000 ms or sooner and nothing at 2200 ms or
later, a straight line in between (it was 700 and 2000). So a move made within a second is Excellent
with a quality of 0.4 or more, and a perfect move may come as late as about 1.7 seconds.

The step's score, 0 to 1, is 0 when not seen and otherwise 0.4 plus 0.6 times that speed-and-quality
number. Excellent is the same thing as a score of 0.82 or over.

The tip under "Needs improvement" and in the work-on list comes from practice mode's `judgeRep`: the
weakest part it measured, or what stopped the move being read (not in the picture, no standing start).
When nothing about the move could be measured, it is the move's own one-line instruction.

## The level rule

The level follows the grades: it comes from the share of full points (900 for six steps).

| Share of full points | Level |
| --- | --- |
| under 45%, or no move seen at all | beginner |
| 45% to under 80% | average |
| 80% and over | good |

So three Excellent and three Good is good, six Good is average, three Excellent and three missed is
average, three Good and three missed is a beginner. (Before, the level came from the mean score, with
beginner under 0.4 and good from 0.75.)

**Focus** (which attacks the fights lean toward): the moves scoring under 0.5, weakest first, at most two
(it was 0.6). In practice that is the moves not seen. On a tie a defense comes before a punch. If both
side steps are weak they are one focus ("Dodge"), not two.

**Strong**: the moves graded Excellent (it was a score of 0.8 or over).

**Habits**: the same frames also go through `scoreWarmup` (hands dropping after a punch, a low guard, a
weaker side, short punches).

## What `tuneFor` changes, and its bounds

`tuneFor(enemy, assessment)` returns the enemy for this player. `src/screens/flow.ts` calls it once per
fight (`enemyFor`), and the engine reads both things it changes: the warning time is how long an attack
is shown before it lands, and the weights decide which attack comes next.

1. Warning time before every attack (`telegraphMs`, rounded to whole milliseconds): times 1.25 for a
   beginner, times 0.85 for a good player, unchanged for an average one. Those are the bounds: never
   more than a quarter slower, never more than 15% faster.
2. Attack weights lean toward the attacks stopped by the focus moves, and toward what the habits train.
   A move never seen multiplies the weight by 2.5 (`MAX_LEAN` in `src/coach/train.ts`); a move seen but
   weak leans less. Nothing goes under 1 or over 2.5. A weak punch changes no weights, because the engine
   picks strikes without them.

It never changes attack ids, names, counters, damage, health, phases or weak spots, and it does not
change the enemy it was given. With nothing to change it returns the very same object: that is the case
for `SKIPPED` (keyboard-only play) and for an average player with no weak move and no habit.

`tuneLine(assessment, who)` is the one line the end of the warm-up shows about this. `summary(assessment)`
gives two or three lines for other screens, for example "Level: beginner. Fights will give you more
warning." and "Work on: Block, Dodge."

## Wiring

`src/screens/IntroScreen.tsx` shows `<WarmUp tracker steps assess lines onDone onSkip />` and
`src/screens/flow.ts` keeps the assessment and tunes each fight with it. Two props are new and optional:

- `enemyName`: the monster about to be fought, so the last line names it ("Polyphemus will ..."). Left
  out, the line says "Your enemies will ...".
- `tuned`: a function for that last line, for a caller whose tuning is not `tuneFor`.

## Trying it without a camera

    npm run dev

then open `/tools/warmup/index.html` on the dev server. A made-up player (`tools/warmup/player.ts`) stands
in for the pose tracker and copies the figure at once, late, or not at all. `?play=good`, `late` or `none`
plays every step that way; left out, there are two of each, so every grade and a work-on list show.
`?enemy=Polyphemus` names the monster in the last line. The page is not part of the game or its build.

## Not tested

- A real body. Every warm-up in the tests is made up, and the made-up player copies the guide's figure exactly.
- Whether 2.5 seconds is enough to read the figure and make the move, and whether 1000 ms and 2200 ms are
  the right speed marks.
- The warm-up inside the game with a real camera: the screenshots are of the page above.
- Whether the tuned fight is easier or harder to win in practice. The balance simulator defends a fixed
  share of attacks whatever the warning time, so it cannot show what the warning does.
