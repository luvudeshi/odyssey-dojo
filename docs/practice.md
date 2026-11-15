# Practice mode: the pure parts

Issue #172. A practice is one move, ten times. After each repetition the player hears whether it counted, how
good it was, and one plain tip for the part that was weakest. After the tenth there is a short summary. The code
is in `src/coach/practice.ts`; the screen and the title entry are not built yet (they are the lead's).

Every number that is not a detector's own threshold is a first guess. Nothing here has been tried on a real body.

## How a repetition is judged

`judgeRep(move, frames, baseline?)` feeds the frames of one attempt, oldest first, through the same one-second
history the fight keeps, and runs the move's own detector on every frame.

- `counted`: the detector reached 0.7, the line the fight uses.
- `quality`: for a strike, its own quality score at the frame it first counted. For a defense, the surest the
  detector got. 0 when it did not count.
- `peak`: the surest the detector got, so a near miss can be told from nothing.
- `tip` and `part`: one line of at most 90 characters and the plain name of the part it is about. Both are null
  when the move counted and no part was weak. `PRAISE` is a line the screen can show then.

Each move has two to four **parts**. A part is measured with the helpers and thresholds its detector uses and
scored 0 to 1: 0.5 exactly at the detector's threshold, 1 comfortably past it. A part under 0.75 is weak, so a
move that only just counted still gets a tip.

Parts are of two kinds. The **shape** the move ends in (reach, height) is read where the body stopped or turned
back, at the stop where the shape parts add up highest, so a half-raised arm on the way is not judged as the
punch. **How the player got there** (fast enough, from the right start, held long enough) is read at its best
over every moment the shape met the detector's thresholds, and is not judged when the shape never did. The
lowest part gets the tip; on a tie, the one listed first below.

Before any of that, when the move did not count, these are said instead of blaming the player:

| When | Part | Tip |
| --- | --- | --- |
| No frames, or the shoulders are unseen in half of them | camera | I cannot see you. Stand where your head and shoulders are in the picture. |
| Duck, dodge, jump or swift dash with no standing start to measure from | standing start | Stand still facing the camera for a second first, so I can measure the move. |
| Front kick or knee with the knees and ankles out of the picture for the last second | feet in view | I cannot see your feet. Step back until your whole body is in the picture. |
| No joint moved a quarter of a shoulder width from where it started | no move seen | I did not see a move. Take your time, then do it once, clearly. |

## The tips

Shape parts are plain; parts in *italics* are how the player got there.

| Moves | Part | What is measured | Tip |
| --- | --- | --- | --- |
| jab, cross, reverse punch, spear thrust, double palm, chain punch | reach | elbow angle: 145 degrees is straight | Arm not straight. Punch all the way out, then pull your hand back to your chin. |
| | height | fist against its shoulder in 3D: within 0.6 torso lengths | Fist off target. Finish with it level with your shoulder, not above or below. |
| jab, cross | aim | wrist no more than 1.2 shoulder widths out to its side | Punch went wide. Send it straight ahead from your chin, not out to the side. |
| the six above | *speed* | elbow bent under 115 degrees no more than 200 ms earlier | Too slow. Snap it out fast from a bent arm, then straight back to your guard. |
| double palm | hands together | wrists under 0.8 shoulder widths apart | Hands too far apart. Keep both palms side by side so the push lands as one. |
| reverse punch | pulling hand | left wrist 0.9 widths under the shoulder line, elbow under 130 degrees | Left hand stayed up. Pull your left fist back to your hip as the right goes out. |
| chain punch | *second punch* | the other arm was out within 700 ms and has come back | Second punch missing. Send the other fist right behind the first, first one back. |
| hook | elbow bend | 60 to 130 degrees | Arm too straight or too tight. Keep your elbow bent like a hook the whole way. |
| | height | wrist within 0.6 widths of shoulder height | Hook too high or too low. Swing at shoulder height, fist level with your elbow. |
| | *swing* | how far the fist crossed the picture in 150 ms | Swing too short. Turn your hips and shoulders and whip the fist across fast. |
| uppercut, rising palm | *drive* | the hand was a shoulder width under the shoulder line within 400 ms | Started too high. Drop your hand to your waist first, then drive it up fast. |
| | finish | wrist between the shoulders and the top of the head, in front | Wrong finish. End with your hand at chin height, close in front of you. |
| | elbow bend | under 135 degrees (uppercut) or 150 (rising palm) | Arm straightened. Keep your elbow bent and close: the hand goes up, not out. |
| hammer fist, overhead strike, thunderbolt | *raise* | the hand was over the head within 500 ms (200 for the overhead strike) | Not raised enough. Lift your hand right over your head, then strike down fast. |
| | finish | the hand is under the shoulder | Stopped short. Follow it all the way down, below your shoulder. |
| knife hand | *start* | the hand was across the body within 550 ms | No wind-up. Start with your hand across at the other shoulder, then sweep it out. |
| | sweep | wrist more than 1.2 widths out to its side | Sweep too short. Carry it out past your own side to knock a reaching arm away. |
| | height | wrist within 0.7 widths of the shoulder line | Sweep off height. Keep it level with your shoulders, at neck height. |
| | arm | elbow over 125 degrees | Arm still bent. Open it out nearly straight as the sweep finishes. |
| block | guard | both wrists near the nose (the detector's own reading) | Hands too low. Bring both fists right up to your cheeks to cover your head. |
| | *hold* | the guard stayed up for the detector's 200 ms | Guard dropped too soon. Keep your fists up by your face for a beat. |
| duck | depth | shoulders 0.6 widths under where they stood | Not low enough. Bend your knees until your head would clear a swing. |
| | knees | hips dropped at least half as far as the shoulders (not in the detector) | You bent at the waist. Bend your knees instead, and keep your eyes up. |
| dodge left, dodge right | distance | shoulders 0.6 widths to the side (the detector's own reading) | Step too small. Move your whole body off the line, not only your head. |
| | *staying off* | stayed there for the detector's 200 ms | Back too soon. Stay off the line for a moment before you come back. |
| | direction | the other dodge fired | Wrong way. Step to your left, off the line of the rush. (or: Step to your right, out of the attack's path.) |
| front kick | *knee lift* | knee up 0.4 widths and folded under 110 degrees within 500 ms | No knee lift. Bring your knee up first, then snap your foot straight out. |
| | height | foot 0.8 widths over the other foot | Kick too low. Lift your knee to hip height and send your foot out from there. |
| | leg | knee over 140 degrees | Leg still bent. Push your foot out until the leg is straight, then pull it back. |
| knee | height | knee 0.6 widths over the other knee | Knee too low. Drive it up to hip height, toward your hands. |
| | tuck | knee under 115 degrees | Foot swung out. Keep it tucked under your knee as the knee comes up. |
| | *hold* | stayed up for 120 ms | Down too fast. Hold your knee up for a beat before you set your foot down. |

Seven moves have no table of their own: stake thrust, aegis push, trident sweep, swift dash, moon arrow, sun
burst and jump. They are judged by how sure the detector got and get the one tip for their kind:

- a strike: "Do it as one sharp move from your guard, then come straight back to guard."
- a defense: "Make the move bigger and do it once, clearly, while the attack is coming."

The same two lines are used for a tabled move that did not count although every measured part was strong (the
detector refused it for something that is not measured, such as the other arm being out too). In the Training Dojo the move's own line takes their place: how to make that move, or for the dojo's own eight moves the tip for the condition that failed (`src/coach/coaching.ts`, `docs/dojo.md`, "What the coach says").

The tips agree with the sourced `teaches` lines in `docs/moves.md`: hand back to the face after a punch, straight
is quicker than a swing, knees and not waist, the whole body off the line, hands high to cover the head.

## The summary

`summarise(reps)` gives the count, the mean and best quality (a repetition that did not count is 0), which
repetition was best, a trend, the part that was weakest most often with its tip, and `lines`: two or three
sentences of at most 120 characters each.

- Trend: mean quality of the second half against the first. More than 0.1 better is `improving`, more than 0.1
  worse is `tiring`, anything else (or fewer than four repetitions) is `steady`.
- Lines: "7 of 10 counted. Your best was your 8th.", then a trend line unless steady, then
  "Work on reach: Reach all the way out, ..." or the praise line when nothing was weak.

## What a screen calls

```ts
import { KEYBOARD_REP, MOVES, PRAISE, REPS, judgeRep, nextRep, startPractice, summarise } from "...";

let practice = startPractice(move.id);
// For each repetition: collect the tracker's frames from the prompt until the move counts or time runs out.
const result = judgeRep(move, frames, baseline); // baseline: the one from calibration
// By keyboard there are no frames: use KEYBOARD_REP when the move's key is pressed.
show(result.counted, result.quality, result.tip ?? PRAISE);
practice = nextRep(practice, result);
if (practice.done) show(summarise(practice.reps).lines); // after REPS (10)
```

`frames` should start a little before the player moves, because "no move seen" and the best moment are both
measured against where the attempt started. With no `baseline` passed, the first 20 frames set it, so they must
be the player standing still.
