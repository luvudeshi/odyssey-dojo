# The warm-up skill check

At the very start of the game the player makes six moves in 15 seconds. From that the game knows the
player's level, which moves to work on, and how hard to make the fights. The code is in
`src/coach/warmup.ts`; the types the screen and the check share are in `src/coach/contract.ts`.
Issue #50.

Every number below is a first guess. Nothing here has been tried on a real body yet.

## What it asks

`WARMUP_STEPS`, 2.5 seconds each, 15 seconds in all:

| Step | The screen says |
| --- | --- |
| jab | Jab: left fist out to keep space |
| cross | Cross: right fist, your power hand |
| block | Block: fists up to cover your head |
| dodge_left | Dodge left: step off the line |
| dodge_right | Dodge right: step off the line |
| duck | Duck: drop low under a swing |

The player must stand still for about a second before the first step. The dodges and the duck are
measured against that stance, so those frames go into `assessWarmup` too, with times before `startedAtMs`.

## How a step is read

`assessWarmup(frames, startedAtMs, steps)` plays the frames through the same move detectors the fight
uses. A move counts as seen when its detector reaches 0.7, the line the fight uses. For each step it keeps:

- `done`: the move was seen inside the step's 2.5 seconds. The same move made in another step's time does not count.
- `reactMs`: the time from the start of the step to the first frame the move was seen.
- `quality`: for a punch, how well it was thrown (the move's own quality score: speed, a straight arm, aim).
  For a defense, the surest the detector got.

## The level rule

Each step gets a score from 0 to 1:

- not seen: 0;
- seen: 0.4, plus up to 0.3 for speed, plus 0.3 times the quality.
- Speed: full marks at 700 ms or sooner, none at 2000 ms or later, a straight line in between.

The level comes from the mean of the six scores:

| Mean score | Level |
| --- | --- |
| under 0.4, or no move seen at all | beginner |
| 0.4 to under 0.75 | average |
| 0.75 and over | good |

So a player who makes every move but only near the end of each window is average, a player who misses
about half the moves is a beginner, and a player who makes them all quickly is good.

**Focus** (what to work on): the moves scoring under 0.6, weakest first, at most two, each with one tip.
On a tie a defense comes before a punch, because staying safe is learned first. If both side steps are
weak they are one focus ("Dodge"), not two. A player with no move under 0.6 has an empty list.

**Strong**: the moves scoring 0.8 or over.

**Habits**: the same frames also go through `scoreWarmup` (hands dropping after a punch, a low guard, a
weaker side, short punches).

## What `tuneFor` changes

`tuneFor(enemy, assessment)` returns the enemy for this player.

1. Warning time before every attack (`telegraphMs`, rounded to whole milliseconds): times 1.25 for a
   beginner, times 0.85 for a good player, unchanged for an average one.
2. Attack weights lean toward the attacks stopped by the focus moves, and toward what the habits train.
   A move never seen multiplies the weight by 2.5 (`MAX_LEAN` in `src/coach/train.ts`); a move seen but
   weak leans less. Nothing goes over 2.5. A weak punch changes no weights, because the engine picks
   strikes without them.

It never changes attack ids, names, counters, damage, health, phases or weak spots, and it does not
change the enemy it was given. With nothing to change it returns the very same object: that is the case
for `SKIPPED` (keyboard-only play) and for an average player with no weak move and no habit.

`summary(assessment)` gives two or three lines for the screen, for example
"Level: beginner. Fights will give you more warning." and "Work on: Block, Dodge."

## Wiring (for the lead)

All imports are from `src/coach`, except the screen, which is in `src/coach/ui/WarmUp` (branch `50-warmup-screen`).

1. After the camera starts and before the style screen, show
   `<WarmUp tracker={tracker} steps={WARMUP_STEPS} assess={assessWarmup} onDone={(a) => setAssessment(a)} onSkip={() => setAssessment(SKIPPED)} />`.
2. Keep the assessment in App state, starting as `SKIPPED`. Keyboard-only play never shows the warm-up and stays on `SKIPPED`.
3. Where the enemy goes into the fight (`startFight` and `step`), pass `tuneFor(enemy, assessment)` in place of `enemy`. Make it once per fight, not every frame.
4. Optional: show `summary(assessment)` after the warm-up or before the first fight.

## Not tested

- A real body. Every warm-up in `tests/coachWarmup.test.ts` is made up.
- Whether 2.5 seconds is enough to read a line and make the move, and whether 700 ms and 2000 ms are the right speed marks.
- The simulated beginner wins Polyphemus as often against the tuned enemy as against the plain one (175 of 200 both ways).
  The simulator defends a fixed share of attacks whatever the warning time, so it cannot show the help the longer warning gives.
