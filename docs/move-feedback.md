# Move feedback in a fight

After a move counts in a fight, the player can be shown a grade, bonus points and one short tip, for example
`GREAT · Guard hand by your chin · +100`. It is a pop-up on the screen only: nothing is spoken and no sound is played.

The code is `strikeFeedback(moveId, history, quality?)` in `src/coach/extra/strikeFeedback.ts`. It is pure, runs once
per counted move, and never throws.

## How a move is graded

1. The move is looked for in the last 600 ms of pose frames, and the frame where it was at its fullest is picked
   (the straightest arm of a punch, the deepest point of a duck, the highest knee). For a move either hand or leg
   can make, the side that made it is picked the same way. So it does not matter whether the function is called
   as the move counts or a moment later.
2. Each move has its own short list of checks, in order of importance. Each check measures one thing on that frame
   with the same helpers the detectors use (shoulder widths of the picture, degrees) and says how far off it was,
   from 0 to 1. Some checks weigh less than others: a dropped guard hand can cost a grade or two, never all of them.
3. The largest miss decides the tip and the grade. A check whose joints the camera cannot see is skipped.

| Largest miss | Grade | Points | Tip |
| --- | --- | --- | --- |
| under 0.25, and the strike's quality is 0.7 or more (or it is a defend) | EXCELLENT | 150 | none |
| under 0.25, quality under 0.7 | GREAT | 100 | none |
| 0.25 to 0.5 | GREAT | 100 | yes |
| 0.5 to 0.8 | GOOD | 50 | yes |
| 0.8 or more | NEEDS IMPROVEMENT | 25 | yes |

With no body to read (keyboard play, the shoulders out of view, a move with no checks) the grade comes from the
strike's quality alone, on the lines the fight already uses for PERFECT, GREAT and GOOD (0.92, 0.8, 0.55), and
there is no tip. A defend with no body to read is GOOD.

The points are the Training Dojo's own for the top and bottom grade (150 and 25, `POINTS` in `src/coach/grade.ts`),
the Dojo's "good" for GREAT (100), and what a fight gives for a defend that counted for GOOD (50). They are shown
with the grade. The module does not change the fight's score.

## The tips

Every tip is at most 24 characters. The first row of a move is its most important check. Heights are measured
against the line between the shoulders.

| Move | What is measured | The tip said |
| --- | --- | --- |
| Jab (`jab`, strike) | elbow angle of the punching arm at its straightest | "Extend your arm fully" |
|  | height of the other wrist against the shoulder line as the strike lands | "Guard hand by your chin" |
|  | height of the striking wrist against the shoulder line (aim: level with it) | "Aim higher, at the chin" / "Aim lower, at the chin" |
|  | the strike's quality score (mostly speed), when the shape was right | "Snap it out faster" |
| Cross (`cross`, strike) | elbow angle of the punching arm at its straightest | "Extend your arm fully" |
|  | height of the other wrist against the shoulder line as the strike lands | "Guard hand by your chin" |
|  | how far the striking shoulder has turned in front of the other (the shoulders follow the hips) | "Turn your hips into it" |
|  | height of the striking wrist against the shoulder line (aim: level with it) | "Aim higher, at the chin" / "Aim lower, at the chin" |
|  | the strike's quality score (mostly speed), when the shape was right | "Snap it out faster" |
| Reverse punch (`reverse_punch`, strike) | elbow angle of the punching arm at its straightest | "Extend your arm fully" |
|  | how far the striking shoulder has turned in front of the other (the shoulders follow the hips) | "Turn your hips into it" |
|  | height of the striking wrist against the shoulder line (aim: just below it) | "Punch at chest height" |
|  | the strike's quality score (mostly speed), when the shape was right | "Snap it out faster" |
| Chain punch (`chain_punch`, strike) | elbow angle of the punching arm at its straightest | "Extend your arm fully" |
|  | how far the punching fist ends from the centre line | "Punch down the middle" |
|  | height of the other wrist against the shoulder line as the strike lands | "Guard hand by your chin" |
|  | the strike's quality score (mostly speed), when the shape was right | "Punch faster, one-two" |
| Spear thrust (`spear_thrust`, strike) | the less straight elbow at the end of the push | "Extend both arms fully" |
|  | gap between the two wrists | "Hands closer together" |
|  | height of the two wrists against the shoulder line | "Push at chest height" |
|  | the strike's quality score (mostly speed), when the shape was right | "Thrust faster" |
| Double palm (`double_palm`, strike) | the less straight elbow at the end of the push | "Extend both arms fully" |
|  | gap between the two wrists | "Palms side by side" |
|  | height of the two wrists against the shoulder line | "Push at chest height" |
|  | the strike's quality score (mostly speed), when the shape was right | "Push faster" |
| Hook (`hook`, strike) | the upper arm's lift from hanging (level is 90 degrees) | "Lift your elbow higher" |
|  | elbow angle of the striking arm (a bent arm, not a straight one) | "Keep your elbow bent" |
|  | height of the other wrist against the shoulder line as the strike lands | "Guard hand by your chin" |
|  | how far the striking shoulder has turned in front of the other (the shoulders follow the hips) | "Turn your hips into it" |
|  | the strike's quality score (mostly speed), when the shape was right | "Swing it faster" |
| Uppercut (`uppercut`, strike) | how high the wrist rises above the shoulder line | "Drive the fist higher" |
|  | elbow angle of the striking arm (a bent arm, not a straight one) | "Keep your elbow bent" |
|  | height of the other wrist against the shoulder line as the strike lands | "Guard hand by your chin" |
|  | the strike's quality score (mostly speed), when the shape was right | "Drive it up faster" |
| Rising palm (`rising_palm`, strike) | how high the wrist rises above the shoulder line | "Drive the palm higher" |
|  | elbow angle of the striking arm (a bent arm, not a straight one) | "Keep your elbow bent" |
|  | height of the other wrist against the shoulder line as the strike lands | "Guard hand by your chin" |
|  | the strike's quality score (mostly speed), when the shape was right | "Drive it up faster" |
| Hammer fist (`hammer_fist`, strike) | the highest the striking wrist got above the shoulder line before coming down | "Raise your fist higher" |
|  | how far below the shoulder line the wrist ends | "Bring it right down" |
|  | height of the other wrist against the shoulder line as the strike lands | "Guard hand by your chin" |
|  | the strike's quality score (mostly speed), when the shape was right | "Swing it down faster" |
| Overhead strike (`overhead_strike`, strike) | the highest the striking wrist got above the shoulder line before coming down | "Raise your hand higher" |
|  | how far below the shoulder line the wrist ends | "Bring it right down" |
|  | height of the other wrist against the shoulder line as the strike lands | "Guard hand by your chin" |
|  | the strike's quality score (mostly speed), when the shape was right | "Swing it down faster" |
| Knife hand (`knife_hand`, strike) | elbow angle at the end of the chop | "Open your arm out more" |
|  | height of the striking wrist against the shoulder line (aim: level with it) | "Chop higher: neck height" / "Chop lower: neck height" |
|  | height of the other wrist against the shoulder line as the strike lands | "Guard hand by your chin" |
|  | the strike's quality score (mostly speed), when the shape was right | "Chop faster" |
| Stake thrust (`stake_thrust`, strike) | how far below the shoulders the hands are driven | "Drive it down further" |
|  | the less straight elbow at the finish | "Straighten your arms" |
|  | gap between the two wrists | "Hands closer together" |
| Front kick (`front_kick`, strike) | how far the kicking foot is above the standing foot | "Kick higher" |
|  | knee angle of the kicking leg at full reach | "Straighten your leg" |
|  | height of the lower wrist against the shoulder line | "Keep your hands up" |
|  | the strike's quality score (mostly speed), when the shape was right | "Snap the kick out faster" |
| Knee strike (`knee`, strike) | how far the knee is above the other knee | "Knee higher" |
|  | knee angle of the lifted leg (folded is small) | "Tuck your foot under" |
|  | height of the lower wrist against the shoulder line | "Keep your hands up" |
|  | the strike's quality score (mostly speed), when the shape was right | "Drive the knee up faster" |
| Block (`block`, defend) | height of the lower wrist against the shoulder line (and which hand it is) | "Hands too low" / "Raise your left hand" / "Raise your right hand" |
|  | distance of the further fist from the nose | "Fists closer to face" |
|  | how far each elbow sits below its wrist (an upright forearm) | "Elbows in, forearms up" |
| Duck (`duck`, defend) | the head folding down onto the shoulders while the shoulders barely drop | "Bend knees, not waist" |
|  | how far the shoulders drop below where they were at calibration | "Bend your knees deeper" |
|  | height of the lower wrist against the shoulder line | "Keep your hands up" |
| Dodge left (`dodge_left`, defend) | how far the head leans off the shoulders against how far the shoulders moved | "Step, don't just lean" |
|  | how far the shoulders and head moved off the line since calibration | "Step further left" |
|  | height of the lower wrist against the shoulder line | "Keep your hands up" |
| Dodge right (`dodge_right`, defend) | how far the head leans off the shoulders against how far the shoulders moved | "Step, don't just lean" |
|  | how far the shoulders and head moved off the line since calibration | "Step further right" |
|  | height of the lower wrist against the shoulder line | "Keep your hands up" |
| Jump (`jump`, defend) | how far the shoulders rise above where they were at calibration | "Jump higher" |
|  | height of the lower wrist against the shoulder line | "Keep your hands up" |

"Left" and "right" are the player's own. "Turn your hips into it" is read from the shoulders, which turn with
the hips, because a desk camera often cannot see the hips. The speed tips come from the strike's quality score,
so they are only given when the fight passes that score in.

## Defends that failed, and late ones

A defend is settled when the attack lands. The body rules above only grade a defend that counted, from its
shape. `src/coach/extra/defendMissFeedback.ts` adds what the timing tells. It calls `strikeFeedback` for the
body tips (no second set of pose rules), returns the same `{ grade, points, tip }`, is pure and never throws.

```ts
defendMissFeedback(defendId, history, windowStartMs, windowEndMs): StrikeFeedback   // after `playerHit`
defendTimingFeedback(defendId, history, windowStartMs, windowEndMs): StrikeFeedback // after `defended`
// defendId: the attack's `counter`. history: PoseHistory, or null on the keyboard.
// windowStartMs: when `telegraph` came; windowEndMs: when the attack landed. Both on the PoseFrame.t clock.
```

The fight's pose history keeps one second and a warning can be longer, so the caller keeps the frames from the
telegraph on (and a moment after the hit, for "A beat sooner") and passes `{ frames, baseline }`. Which defend
was made is read by running the game's own detectors over the frames, one after another, at the level a defend
comes on in the fight (0.5), with the loose reading for the asked defend as the fight does.

A defend that failed is always NEEDS IMPROVEMENT. The tip, first that applies:

| What the frames show | Tip |
| --- | --- |
| the asked defend was on in the warning but let go more than 350 ms before the hit | "Hold it till it lands" |
| the asked defend was on in the warning, close to the hit | "A beat sooner" |
| another defend was made | "Duck, don't block" and so on (table below) |
| the asked defend was made only after the hit | "A beat sooner" |
| no point of the upper body moved 0.12 shoulder widths | "React sooner" |
| it moved, short of the defend | the body tip above for that defend; if none, "Hands too low", "Bend your knees deeper", "Step further left/right" or "Jump higher" |

| Asked for | Made in its place | Tip |
| --- | --- | --- |
| Block (`block`) | duck / dodge / jump | "Block, don't duck" / "Block, don't dodge" / "Block, don't jump" |
| Duck (`duck`) | block / dodge / jump | "Duck, don't block" / "Duck, don't dodge" / "Duck, don't jump" |
| Dodge left (`dodge_left`) | dodge right | "Other way: dodge left" |
| Dodge right (`dodge_right`) | dodge left | "Other way: dodge right" |
| Dodge left or right | block / duck / jump | "Dodge, don't block" / "Dodge, don't duck" / "Dodge, don't jump" |
| Jump (`jump`) | block / duck / dodge | "Jump, don't block" / "Jump, don't duck" / "Jump, don't dodge" |

A defend that counted gets strikeFeedback's grade and tip, read on its frames up to 300 ms after it was first
made. When that has no tip and the defend was first made in the last quarter of the warning, the grade is one
step lower and the tip is "React sooner".

A player whose legs are out of the picture (knees and a foot seen on half the frames or fewer) is never given a
leg tip: "Step further left/right" becomes "Lean further left/right", "Bend your knees deeper" becomes "Duck
lower", and "Bend knees, not waist" and "Step, don't just lean" are dropped. With no body to read (keyboard,
shoulders not seen, a window that ends before it starts) there is the grade and no tip.

## A strike that never came

`strikeMissTip(moveId, history)` in `src/coach/extra/strikeMissTip.ts` is for a strike prompt that ran out with
no strike counted. `history` is the fight's pose history as the prompt ends. It returns a tip of at most 24
characters, or null with no body to read (keyboard, shoulders not seen, a move with no checks, a kick with the
legs out of view). First that applies:

| What the frames show | Tip |
| --- | --- |
| no point of the upper body moved 0.12 shoulder widths | "Strike when it flashes" |
| the same strike with the other hand (jab and cross, hammer fist and overhead strike, uppercut and rising palm) | "Other hand: left jab", "Other hand: right cross"; "Use your right hand" when that is too long |
| another strike reached the fight's level (0.7) | "Jab, not hook" and so on, when it fits |
| anything else | the body tip above for that strike, or its first tip ("Extend your arm fully") |

## Not yet done

- The thresholds are set from the detectors' own numbers and from made-up bodies in `tests/strikeFeedback.test.ts`.
  They have not been tuned on a real camera.
- `defendMissFeedback`, `defendTimingFeedback` and `strikeMissTip` are checked on made-up bodies in
  `tests/defendMissFeedback.test.ts` and `tests/strikeMissTip.test.ts`, not on a real camera.
- Showing the pop-up in the fight is a change to the fight screen and the HUD, which the lead owns.
