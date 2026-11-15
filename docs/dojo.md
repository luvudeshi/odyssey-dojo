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
| Great! | 100 | The move counted. |
| Needs improvement | 25 | The move was not recognised in the 3 seconds. |

Training is lenient on purpose:

- **Anything that counts is at least Great.** There is no way to make the move and be marked down.
- **A near miss counts.** The fight counts a move when its detector is 0.7 sure. Training counts from 0.6
  (`COUNT_FROM`). A near miss is Great, never Excellent, and still gets the tip for what was short.
- **Excellent is easier than in the fight.** A strike is Excellent from a quality of 0.58
  (`STRIKE_FOR_EXCELLENT`), not 0.7: copying the outline exactly scores a jab 0.69 on the fight's scale, and
  that should be Excellent. A defend has no quality score, so it is graded on how sure its detector got:
  Excellent from 0.82 (`SURE_FOR_EXCELLENT`), Great below that.
- **What the screen counted stays counted.** The try is judged again from its frames for the tip
  (`judgeRep` in `src/coach/practice.ts`); that second look can add a tip but cannot take the grade away.
- A key press is Excellent, as the fight gives a key press its full quality.

The tip under **Needs improvement** is always there: the weakest measured part of the try, or what stopped it
being seen (nobody in the picture, feet out of view, no move made). Under **Great** the tip is the part to
sharpen, when one was weak. The next section lists every line for every move.

The three words are **Excellent!**, **Great!** and **Needs improvement** (`src/coach/grade.ts`). The middle grade
was "Good" before; its id in the code is still `good`, so the colours and the tests that read the tier did not
change. The points follow the grade and nothing else.

## What the coach says

Every move the dojo can train (26: every style's strikes, the kicks, the defends and the dojo's own eight) has its
words written by hand. `tests/dojoCoaching.test.ts` walks the real list and fails when a move lacks any of them, or
when a line has detector wording in it ("on this frame", "Not:", a unit, a number, an id) or is too long for the
screen (28 characters for a checklist row, 90 for a tip, 60 for praise).

- **The checklist** under the outline, at most four rows: `LABELS` in `src/coach/guide.ts`, one line for each
  condition of the move's detector. The rows in the second column show first; the ones in the third take a row only
  while they fail, since a player seldom causes them.
- **The tip** under Needs improvement or Great names what was measured as wrong, then what to do. Eighteen moves
  are measured part by part (`PRACTICE_TIPS` and the tables in `src/coach/practice.ts`, see `docs/practice.md`). The
  dojo's own eight are judged condition by condition (`faultOf` in `src/coach/coaching.ts`): the try is read at its
  best moment while the player was moving, and the tip is for a condition that failed there, the first in the order
  the tips are written. When nothing measured stands out, the tip is how to make that move ("whole ..." below).
- **With Excellent**: one line on what was done well (`well` in `src/coach/coaching.ts`). The screen shows it only
  once the session hands it over, which waits on the next change to `src/coach/dojo.ts`.

Nothing here is spoken: every line is text on the screen.

| Move | Checklist (shown first) | Also shown while it fails | What can be wrong, and the tip | With Excellent |
| --- | --- | --- | --- | --- |
| Jab | Left arm out<br>Snap left arm out fast<br>Keep right arm back<br>Lift elbow, don't scoop up | Straight, not a hook<br>Not straight after a hook<br>Not a chop from overhead<br>Punch forward, not sideways<br>Fist going out, not back | **reach**: Arm not straight. Punch all the way out, then pull your hand back to your chin.<br>**height**: Fist off target. Finish with it level with your shoulder, not above or below.<br>**aim**: Punch went wide. Send it straight ahead from your chin, not out to the side.<br>**speed**: Too slow. Snap it out fast from a bent arm, then straight back to your guard.<br>**whole jab** (nothing measured stood out): Snap your left fist straight out from your chin to shoulder height, then straight back. | Straight, fast, and back to your guard. |
| Cross | Right arm out<br>Snap right arm out fast<br>Keep left arm back<br>Lift elbow, don't scoop up | Straight, not a hook<br>Not straight after a hook<br>Not a chop from overhead<br>Punch forward, not sideways<br>Fist going out, not back | **reach**: Arm not straight. Punch all the way out, then pull your hand back to your chin.<br>**height**: Fist off target. Finish with it level with your shoulder, not above or below.<br>**aim**: Punch went wide. Send it straight ahead from your chin, not out to the side.<br>**speed**: Too slow. Snap it out fast from a bent arm, then straight back to your guard.<br>**whole cross** (nothing measured stood out): Drive your right fist straight out from your chin to shoulder height, then back. | Straight down the middle with a full reach. |
| Hook | Keep left elbow bent<br>Swing fist across fast<br>Fist between head and chest<br>Left elbow up and out | Don't fold arm too tight<br>Not a chop from overhead<br>Arm bent the whole way<br>Swing flat, not upward<br>Not right after a punch | **elbow bend**: Arm too straight or too tight. Keep your elbow bent like a hook the whole way.<br>**height**: Hook too high or too low. Swing at shoulder height, fist level with your elbow.<br>**swing**: Swing too short. Turn your hips and shoulders and whip the fist across fast.<br>**whole hook** (nothing measured stood out): Lift your elbow to shoulder height, keep it bent, and swing the fist across. | Elbow bent, and a fast swing across. |
| Uppercut | Right fist up to chin<br>Start from your waist<br>Keep right elbow bent<br>Keep right elbow low | Not above your head<br>Hand close to your body<br>Drive up, don't punch out<br>Straight up, not across<br>Keep left hand down | **drive**: Started too high. Drop your hand to your waist first, then drive it up fast.<br>**finish**: Wrong finish. End with your hand at chin height, close in front of you.<br>**elbow bend**: Arm straightened. Keep your elbow bent and close: the hand goes up, not out.<br>**whole uppercut** (nothing measured stood out): Drop your right fist to your waist, then drive it up to chin height, elbow bent. | Up from the waist with your elbow bent. |
| Front kick | Lift right foot high<br>Snap right leg straight<br>Lift your knee first<br>Whole body in view | - | **knee lift**: No knee lift. Bring your knee up first, then snap your foot straight out.<br>**height**: Kick too low. Lift your knee to hip height and send your foot out from there.<br>**leg**: Leg still bent. Push your foot out until the leg is straight, then pull it back.<br>**whole kick** (nothing measured stood out): Lift your knee to hip height, snap your foot straight out, then pull it back. | Knee up first, then a straight leg. |
| Knee strike | Right knee up high<br>Foot tucked under knee<br>Hold it up a moment<br>Whole body in view | Start with foot on floor | **height**: Knee too low. Drive it up to hip height, toward your hands.<br>**tuck**: Foot swung out. Keep it tucked under your knee as the knee comes up.<br>**hold**: Down too fast. Hold your knee up for a beat before you set your foot down.<br>**whole knee strike** (nothing measured stood out): Drive one knee up to hip height, foot tucked under it, and hold it a beat. | Knee high, with your foot tucked under it. |
| Roundhouse kick | Knee up and out first<br>Lift left foot hip high<br>Snap left leg straight<br>Whole body in view | Bring foot round to front | **feet in view**: I cannot see your feet. Step back until your whole body is in the picture.<br>**knee out first**: No wind-up. Lift your knee up and out to the side first, then swing the foot round.<br>**height**: Kick too low. Lift your knee to hip height so the foot swings round at hip height.<br>**leg**: Leg still bent. Snap your foot out until the leg is straight, then pull it back.<br>**swing**: Foot stayed out wide. Swing it round until it is in front of your body.<br>**whole kick** (nothing measured stood out): Lift your knee out to the side, swing your foot round to the front, then snap it back. | Knee out first, then the foot swung round. |
| Side kick | Lift your knee first<br>Push left foot out sideways<br>Push left leg straight<br>Whole body in view | Lift left foot higher | **feet in view**: I cannot see your feet. Step back until your whole body is in the picture.<br>**knee lift**: No knee lift. Bring your knee up first, then push your foot out to the side.<br>**reach**: Kick too short. Push your foot further out to the side, away from your hip.<br>**height**: Foot too low. Keep it up at knee height as you push it out.<br>**leg**: Leg still bent. Push out until your leg is straight, then pull it back.<br>**whole kick** (nothing measured stood out): Lift your knee, then push your foot straight out to the side until the leg is straight. | Knee up, then a straight push to the side. |
| Low kick | Keep left leg straight<br>Flick left foot forward<br>Keep it at shin height<br>Whole body in view | Lift left foot off floor<br>Make it one quick flick<br>Don't lift your knee high | **feet in view**: I cannot see your feet. Step back until your whole body is in the picture.<br>**low**: Knee came up too high. Keep this one low: no knee lift, a flick from the floor.<br>**lift**: Foot stayed down. Lift it off the floor and flick it forward at shin height.<br>**low**: Kick too high. Keep your foot at shin height: this one is aimed at the leg.<br>**leg**: Knee bent. Keep your leg straight and swing it forward from the hip.<br>**reach**: Kick too short. Flick your foot further forward, out in front of your hip.<br>**speed**: Too slow. Make it one quick flick from the floor and straight back.<br>**whole kick** (nothing measured stood out): Keep your leg straight and flick your foot forward at shin height, then straight back. | Low, quick, and your leg stayed straight. |
| Block | Both fists up by your face | - | **guard**: Hands too low. Bring both fists right up to your cheeks to cover your head.<br>**hold**: Guard dropped too soon. Keep your fists up by your face for a beat.<br>**whole block** (nothing measured stood out): Bring both fists up beside your cheeks, elbows in, and hold them there a beat. | Both fists high, and you held them there. |
| Duck | Drop your shoulders lower | - | **depth**: Not low enough. Bend your knees until your head would clear a swing.<br>**knees**: You bent at the waist. Bend your knees instead, and keep your eyes up.<br>**whole duck** (nothing measured stood out): Bend your knees and drop straight down until your head would clear a swing. | Low enough, with your knees doing the work. |
| Dodge left | Move your body left | - | **distance**: Step too small. Move your whole body off the line, not only your head.<br>**staying off**: Back too soon. Stay off the line for a moment before you come back.<br>**direction**: Wrong way. Step to your left, off the line of the rush.<br>**whole dodge** (nothing measured stood out): Take one clear step to your left with your whole body, and stay there a moment. | Your whole body moved off the line. |
| Dodge right | Move your body right | - | **distance**: Step too small. Move your whole body off the line, not only your head.<br>**staying off**: Back too soon. Stay off the line for a moment before you come back.<br>**direction**: Wrong way. Step to your right, out of the attack's path.<br>**whole dodge** (nothing measured stood out): Take one clear step to your right with your whole body, and stay there a moment. | Your whole body moved off the line. |
| High block | Left hand up to forehead<br>Left elbow up and out<br>Forearm across, not upright<br>Keep forearm level | Keep right hand down<br>Hold it up a beat | **height**: Arm too low. Lift your forearm until your hand is above your forehead.<br>**elbow**: Elbow too low. Lift your elbow up and out to the side, as high as your shoulder.<br>**forearm**: Forearm upright. Lay it across above your head like a roof, elbow out to the side.<br>**forearm**: Forearm tilted. Keep it level from elbow to hand so a blow slides off it.<br>**other hand**: Both hands came up. Block with one forearm and keep the other hand down.<br>**hold**: Down too soon. Hold the block above your head for a beat.<br>**whole block** (nothing measured stood out): Lift one forearm level above your forehead, elbow out to the side, and hold it a beat. | Forearm level above your head, and held. |
| Low block | Start at other shoulder<br>Sweep left hand down low<br>Finish past your left hip<br>End with left arm straight | - | **start**: No wind-up. Start with your hand up at your other shoulder, then sweep it down.<br>**depth**: Sweep too high. Bring your hand all the way down to hip height.<br>**sweep**: Sweep too short. Finish with your hand out past your own hip, clear of your body.<br>**arm**: Arm still bent. Straighten your arm as the sweep finishes.<br>**whole block** (nothing measured stood out): Bring one hand up to your other shoulder, then sweep it down and out past your hip. | From the far shoulder, down and out past your hip. |
| Spear thrust | Left arm out<br>Right arm out<br>Snap left arm out fast<br>Snap right arm out fast | Thrust forward, not wide<br>No left chop from overhead<br>Left hand forward, not wide<br>Left hand out, not back<br>No right chop from overhead<br>Right hand forward, not wide<br>Right hand out, not back | **reach**: Arm not straight. Punch all the way out, then pull your hand back to your chin.<br>**height**: Fist off target. Finish with it level with your shoulder, not above or below.<br>**speed**: Too slow. Snap it out fast from a bent arm, then straight back to your guard.<br>**whole thrust** (nothing measured stood out): Drive both hands straight forward together to shoulder height, then back. | Both hands out together, straight and fast. |
| Overhead strike | Chop right hand down<br>Right hand over head first | - | **raise**: Not raised enough. Lift your hand right over your head, then strike down fast.<br>**finish**: Stopped short. Follow it all the way down, below your shoulder.<br>**whole strike** (nothing measured stood out): Lift your right hand over your head, then chop it down below your shoulder. | Right over your head, then all the way down. |
| Reverse punch | Right arm out<br>Left fist back at hip<br>Snap right arm out fast<br>No right chop from overhead | Right hand forward, not wide<br>Right hand out, not back<br>Left elbow bent back | **reach**: Arm not straight. Punch all the way out, then pull your hand back to your chin.<br>**height**: Fist off target. Finish with it level with your shoulder, not above or below.<br>**pulling hand**: Left hand stayed up. Pull your left fist back to your hip as the right goes out.<br>**speed**: Too slow. Snap it out fast from a bent arm, then straight back to your guard.<br>**whole punch** (nothing measured stood out): Punch your right fist straight out as you pull your left fist back to your hip. | Right fist out as the left pulled back. |
| Knife hand | Right hand out to the side<br>Start across your chest<br>Hand at neck height<br>Right arm opened out | - | **start**: No wind-up. Start with your hand across at the other shoulder, then sweep it out.<br>**sweep**: Sweep too short. Carry it out past your own side to knock a reaching arm away.<br>**height**: Sweep off height. Keep it level with your shoulders, at neck height.<br>**arm**: Arm still bent. Open it out nearly straight as the sweep finishes.<br>**whole sweep** (nothing measured stood out): Bring your right hand to your left shoulder, then sweep it out at neck height. | From the far shoulder, out wide at neck height. |
| Hammer fist | Bring left fist down<br>Left fist over head first | - | **raise**: Not raised enough. Lift your hand right over your head, then strike down fast.<br>**finish**: Stopped short. Follow it all the way down, below your shoulder.<br>**whole strike** (nothing measured stood out): Lift your left fist above your head, then bring it straight down past your shoulder. | Raised high, then straight down. |
| Double palm | Left arm out<br>Right arm out<br>Hands close together<br>Snap left arm out fast | No left chop from overhead<br>Left hand forward, not wide<br>Left hand out, not back<br>Snap right arm out fast<br>No right chop from overhead<br>Right hand forward, not wide<br>Right hand out, not back | **reach**: Arm not straight. Punch all the way out, then pull your hand back to your chin.<br>**height**: Fist off target. Finish with it level with your shoulder, not above or below.<br>**hands together**: Hands too far apart. Keep both palms side by side so the push lands as one.<br>**speed**: Too slow. Snap it out fast from a bent arm, then straight back to your guard.<br>**whole push** (nothing measured stood out): Push both open palms straight forward, side by side, at shoulder height. | Both palms out side by side. |
| Chain punch | Right arm out<br>Left punch goes first<br>Snap right arm out fast<br>Pull left fist back | No right chop from overhead<br>Right hand forward, not wide<br>Right hand out, not back | **reach**: Arm not straight. Punch all the way out, then pull your hand back to your chin.<br>**height**: Fist off target. Finish with it level with your shoulder, not above or below.<br>**second punch**: Second punch missing. Send the other fist right behind the first, first one back.<br>**speed**: Too slow. Snap it out fast from a bent arm, then straight back to your guard.<br>**whole chain** (nothing measured stood out): Punch straight with your left, then your right straight after as the left comes back. | Two straight punches, one right behind the other. |
| Rising palm | Left palm up to chin<br>Start from your waist<br>Keep left elbow bent<br>Keep left elbow low | Not above your head<br>Hand close to your body<br>Drive up, don't punch out<br>Straight up, not across<br>Keep right hand down | **drive**: Started too high. Drop your hand to your waist first, then drive it up fast.<br>**finish**: Wrong finish. End with your hand at chin height, close in front of you.<br>**elbow bend**: Arm straightened. Keep your elbow bent and close: the hand goes up, not out.<br>**whole strike** (nothing measured stood out): Drop your left hand to your waist, then drive the palm up to chin height. | Up from the waist to the chin, elbow bent. |
| Palm heel strike | Push left palm out<br>Left palm at face height<br>Snap left palm out fast<br>Not above your head | Straight ahead, not wide<br>Lift your elbow as you push<br>Keep right hand back<br>Not a chop from overhead | **path**: That was a chop from above. Push the palm straight out from your chest.<br>**reach**: Arm not straight. Push your palm all the way out, then bring it back.<br>**height**: Palm too low. Aim higher: finish with your hand at face height.<br>**height**: Palm too high. Finish at face height, not above your head.<br>**aim**: Palm went wide. Push it straight ahead, in front of your own shoulder.<br>**elbow**: Elbow stayed low. Lift your elbow as you push so the palm goes forward, not up.<br>**speed**: Too slow. Snap your palm out fast from a bent arm, then straight back.<br>**other hand**: Both hands went out. Push with one palm and keep the other hand by your chin.<br>**whole strike** (nothing measured stood out): Push the heel of one open hand straight out to face height, then bring it back. | Straight out to face height, and fast. |
| Elbow strike | Fold left arm tight<br>Left elbow shoulder high<br>Swing left elbow across<br>Finish in front of chest | - | **fold**: Arm too open. Fold it tight, hand by your chest, so the elbow leads.<br>**height**: Elbow too low. Lift it to shoulder height before you swing.<br>**swing**: Swing too short. Turn your shoulders and whip the elbow across fast.<br>**finish**: Stopped short. Carry your elbow across until it is in front of your chest.<br>**whole strike** (nothing measured stood out): Fold your arm tight, lift the elbow to shoulder height and swing it across your chest. | Arm folded tight, elbow swung across at shoulder height. |
| Wrist release | Hold left arm out first<br>Fold left elbow tight<br>Left hand to your shoulder<br>Point elbow forward | Then fold in quickly | **start**: No start. Hold your arm out in front for a moment first, as if it were grabbed.<br>**fold**: Arm not folded. Bend your elbow all the way so your forearm comes right back.<br>**finish**: Hand stopped short. Bring it all the way in to your own shoulder.<br>**elbow**: Elbow went out to the side. Drive it forward, in front of your shoulder.<br>**speed**: Too slow. Fold in with one quick move straight from the held-out arm.<br>**whole release** (nothing measured stood out): Hold your arm out, then fold the elbow forward so your hand comes to your shoulder. | Arm out, then a fast fold with the elbow forward. |

The self-defense wording follows the `teaches` lines in `docs/moves.md` and `docs/dojo-moves.md`; no new source was
added. A try that cannot be judged at all gets one of four lines instead: nobody in the picture, no standing start
to measure from, feet out of view, or no move seen (`docs/practice.md`).

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

Damage, health, phases, weak spots and attack ids stay as they are. A session where every try was Great and none
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

`skillFrom({ reps })` gives a number from 0 to 1 (Excellent 1, Great 0.6, Needs improvement 0, averaged) and the
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
