# Ghost check: would copying the move ghost count?

The move ghost is the gold stick figure that shows the pose a prompt asks for. The idea is a dance game: the ghost shows the move, the player copies it, it counts. This page checks that for all 26 moves, by playing a made-up player who copies the ghost through the real detectors.

**Short answer: no, not today.** A player who copies the ghost exactly gets the move counted for 9 of 26 moves, and for only 4 of the 21 strikes. For 13 moves no way of stepping into the ghost's pose counts at all. And when the player does a strike correctly, the ghost does not light up: no strike done right scores 0.7 closeness or more, and 13 of 21 score under 0.2 at the moment the strike lands.

Everything here is from made-up frames in `tests/ghostVsDetectors.test.ts` and `tests/helpers/ghostCopy.ts`. Nobody stood in front of a camera and the ghost was not looked at in a browser.

## What the ghost is today

Read from `src/render/GhostFigure.tsx` and `src/render/ghost/ghostPose.ts`:

- **Off by default.** `MOVE_GHOST_DEFAULT` is false; `?ghost=1` turns it on.
- **A still pose.** The joints are set once when the prompted move changes. Nothing moves until the next prompt.
- **Shown only during a prompt:** a defend, strike or finisher phase. Hidden otherwise.
- **Seen from behind.** The figure turns its back to the lens, so its left arm is on screen left and stands for the player's own left arm. A kick goes away from the viewer, toward the monster.
- **Flat.** The arms are drawn in the plane of the screen, exactly where the prompt card's 2D `diagram` has them. Only a raised leg has depth: the diagram's sideways reach of a knee or foot is turned into forward reach.
- **Brightness is the feedback.** `ghostCloseness` compares the live elbows and wrists (and, for a dodge or duck, how far the shoulders moved) with the diagram, and the ghost brightens as that goes to 1.

## How the check works

The made-up player stands still with arms hanging for 20 frames (the baseline), then moves straight into the ghost's pose, holds it for half a second, and drops back.

- **Literal copy:** every joint ends up exactly where the ghost draws it, flat, with the arm out to the side where the diagram draws it so. Fast is 250 ms into the pose, slow is 600 ms.
- **Two starts:** from arms hanging, and from fists waiting at the chest (elbows bent).
- **Other arm:** the same copy mirrored, for a player who takes the stick figure for somebody facing them and uses the other arm.
- **Real-length limbs:** the ghost draws arms long (0.7 m straight, 0.8 m hanging). The copy was run again on a 0.55 m arm. It changed no answer for any move, so the table has one set of columns.
- **Done right:** the clean performance the detector tests already use (`tests/moves/detectors.test.ts`). All 26 are counted, so a miss in the table is the copy's, not the fixture's.

"Counted" means what the game means: a strike thrown, or a defend held, through `createPoseInput` (0.7 to fire).

## The table

- **arms down / from the chest:** is the literal copy counted, fast/slow.
- **other arm:** the mirrored copy, fast, from arms down / from the chest.
- **only on letting go:** not counted in the pose, but counted as the player drops out of it.
- **peak:** the move's highest confidence over the four literal copies.
- **others fired:** every other move the literal copies set off.
- **closeness done right:** `ghostCloseness` of the clean performance at the frame its detector peaks. In brackets: the same with any arm the performance never lifts put exactly on the ghost's (the clean performances leave the idle hand hanging, the ghost draws it in a guard).
- **best closeness at any moment:** the highest the bracketed number gets at any frame of the clean performance.
- **closeness in the ghost's pose:** `ghostCloseness` of a body held exactly on the ghost's joints, in the test fixture's picture.

| move | style | arms down, fast/slow | from the chest, fast/slow | other arm, down/chest | only on letting go, down/chest | peak | others fired | closeness done right (idle arm as drawn) | best closeness at any moment | closeness in the ghost's pose |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| aegis_push | god power | no/no | no/no | no/no | no/no | 0.00 | none | 0.57 (0.57) | 0.76 | 0.72 |
| block | defend | yes/yes | yes/yes | yes/yes | no/no | 1.00 | rising_palm, uppercut | 0.70 (0.70) | 0.74 | 0.69 |
| chain_punch | Kung Fu | no/no | no/no | no/no | no/no | 0.00 | none | 0.00 (0.00) | 0.06 | 0.79 |
| cross | Boxer | no/no | no/no | no/no | no/no | 0.00 | rising_palm | 0.00 (0.42) | 0.47 | 0.79 |
| dodge_left | defend | yes/yes | yes/yes | no/no | no/no | 1.00 | swift_dash | 0.81 (0.94) | 0.98 | 0.36 |
| dodge_right | defend | yes/yes | yes/yes | no/no | no/no | 1.00 | swift_dash | 0.81 (0.94) | 0.98 | 0.36 |
| double_palm | Kung Fu | no/no | no/no | no/no | no/no | 0.00 | block, rising_palm, uppercut | 0.56 (0.56) | 0.61 | 0.81 |
| duck | defend | yes/yes | yes/yes | yes/yes | no/no | 1.00 | none | 0.85 (0.97) | 0.97 | 0.00 |
| front_kick | Pankration | no/no | no/no | no/no | no/no | 0.00 | block, rising_palm, uppercut | 0.00 (1.00) | 1.00 | 0.72 |
| hammer_fist | Karate, Pankration | no/no | no/no | no/no | yes/yes | 0.00 | block, rising_palm, uppercut | 0.00 (0.26) | 0.87 | 0.53 |
| hook | Boxer | no/no | no/no | no/no | no/no | 0.00 | block, rising_palm, uppercut | 0.25 (0.85) | 0.88 | 0.82 |
| jab | Boxer | no/no | no/no | no/no | no/no | 0.00 | uppercut | 0.00 (0.42) | 0.47 | 0.79 |
| jump | defend | yes/yes | yes/yes | yes/yes | no/no | 1.00 | none | 0.62 (0.96) | 0.96 | 0.31 |
| knee | Pankration | yes/yes | yes/yes | yes/yes | no/no | 1.00 | stake_thrust | 0.47 (1.00) | 1.00 | 0.40 |
| knife_hand | Karate | no/no | no/no | no/no | no/no | 0.00 | rising_palm | 0.00 (0.49) | 0.69 | 0.85 |
| moon_arrow | god power | no/no | no/no | no/no | yes/no | 0.00 | uppercut | 0.43 (0.43) | 0.62 | 0.92 |
| overhead_strike | Hoplite | no/no | no/no | no/no | yes/yes | 0.00 | block, rising_palm, uppercut | 0.00 (0.26) | 0.87 | 0.53 |
| reverse_punch | Karate | no/no | yes/yes | no/no | no/no | 1.00 | none | 0.34 (0.34) | 0.39 | 0.60 |
| rising_palm | Kung Fu | yes/yes | no/no | yes/no | no/no | 1.00 | block, uppercut | 0.00 (0.59) | 0.78 | 0.64 |
| spear_thrust | Hoplite | no/no | yes/yes | no/yes | no/no | 1.00 | sun_burst | 0.00 (0.00) | 0.00 | 0.86 |
| stake_thrust | finisher | no/no | yes/yes | no/yes | no/no | 1.00 | none | 0.45 (0.45) | 0.59 | 0.46 |
| sun_burst | god power | no/no | yes/yes | no/yes | no/no | 1.00 | spear_thrust | 0.13 (0.13) | 0.31 | 0.79 |
| swift_dash | god power | yes/no | yes/no | yes/yes | no/no | 1.00 | dodge_right | 0.60 (0.98) | 0.98 | 0.34 |
| thunderbolt | god power | no/no | no/no | no/no | yes/yes | 0.00 | uppercut | 0.03 (0.16) | 0.73 | 0.26 |
| trident_sweep | god power | no/no | no/no | no/no | no/no | 0.00 | none | 0.00 (0.00) | 0.37 | 0.70 |
| uppercut | Boxer, Pankration | yes/yes | no/no | yes/no | no/no | 1.00 | block, rising_palm | 0.00 (0.59) | 0.78 | 0.64 |

Counts:

| | of 26 moves | of 21 strikes |
| --- | --- | --- |
| literal copy counts, fast, from arms down | 9 | 4 |
| literal copy counts from either start at either speed | 13 | 8 |
| never counts while in the pose | 13 | 13 |
| ...of those, counts only as the player lets go | 4 | 4 |
| literal copy sets off some other move | 19 | 16 |

All five defends count, at both speeds, from both starts.

## The mismatches, worst first

Owners: a `diagram` in `src/moves/defs/<move>.ts` and a detector are ours. `src/render/ghost` and `src/core/types.ts` are the lead's.

### 1. Jab and cross: the ghost teaches the one thing the detector rejects

- **What the ghost shows:** the punching arm straight out to the side at shoulder height.
- **What the detector wants:** the fist at shoulder height coming at the camera, the elbow snapping from under 115 to over 145 degrees inside 200 ms, and the wrist no more than 1.2 shoulder widths out from the centre line.
- **Why the copy misses:** copied from the chest in 250 ms, the arm is a full punch by the elbow (`punch` returns 1). But the wrist ends 2.18 shoulder widths out (1.84 on a real-length arm) and `flungWide` throws it away. The test pins exactly this. From arms hanging the arm never bends, so there is no snap either.
- **Side effect:** the idle hand is drawn in a guard, so lifting it from the waist fires uppercut (jab) or rising palm (cross).
- **Done right:** closeness is 0.00, and 0.42 even with the idle hand on the ghost's. The ghost stays dim for a correct punch.
- **Fix (lead, `src/render/ghost`):** draw the punching arm toward the lens. `ghostJoints` already does this for legs (`raised` turns sideways reach into forward reach); do the same for the punching arm of jab, cross, chain punch, reverse punch and spear thrust, keyed by move id. Give it a depth cue: a bigger fist sphere, or a thicker forearm.
- **Fix (lead, `ghostCloseness`):** score against that foreshortened target, so a fist near the shoulder in the picture reads as on the ghost.
- No `diagram` change helps: a flat straight arm at shoulder height is always more than 1.2 widths out.

### 2. Spear thrust and reverse punch: the copy counts, for the wrong movement

- **What the ghost shows:** spear thrust is both arms straight out to the sides. Reverse punch is the right arm out to the side, left fist at the hip.
- **What happens:** from the chest both count, fast and slow. Neither detector checks that the fist went forward (`punch` and `armThrust` do not; only jab and cross add `flungWide`). So the game rewards flinging the arms sideways.
- **Side effect:** the spear thrust ghost is the sun burst pose. Copying one fires the other, both ways.
- **Done right:** closeness is 0.00 for a correct spear thrust at every frame, and 0.34 for a reverse punch.
- **Fix (ours, detector):** add the `flungWide` check to `spear_thrust` and to the punching arm of `reverse_punch`. PR #215 is open on these files, so this waits for it.
- **Fix (lead):** the forward arm from item 1. Both fixes together, or the copy stops counting and nothing replaces it.

### 3. Hammer fist, overhead strike, thunderbolt: the ghost shows the wind-up and stops

- **What the ghost shows:** the hand above the head.
- **What the detector wants:** the hand up at head height, then below the shoulder line: inside 200 ms for overhead strike, 500 ms for the other two.
- **Why the copy misses:** holding the pose is the wind-up. All three count only as the player lets go and the hand falls. A player who waits in the pose for the ghost to react waits forever.
- **Done right:** closeness is 0.00 to 0.03 when the strike lands, because the hand is down by then. The best moment (hand up) reaches 0.73 to 0.87.
- **Fix (lead):** animate the ghost: hand up, then down, on a loop of about 0.8 s. That needs a second pose per move. Smallest version: an optional `diagramFrom` on `MoveDef` (one line in `src/core/types.ts`, the lead's), which we fill in for these moves, and the ghost blends from it to `diagram`.
- No `diagram` change helps: no single still pose is both up and down.

### 4. Double palm, aegis push, chain punch: a push forward drawn as hands at the chest

- **What the ghost shows:** both hands in front of the chest with the elbows folded to about 20 degrees (double palm 21, aegis push 18). Chain punch shows one arm out to the side and the other hand at the chest.
- **What the detector wants:** arms straight (over 145 degrees for double palm, over 140 for aegis push) with the hands pushed out toward the camera, after being bent at the chest. Chain punch wants two straight punches, one after the other.
- **Why the copy misses:** the copy is the start of the move, not the end. Double palm also lifts both hands to the face on the way, which fires block, uppercut and rising palm.
- **Fix (lead):** the forward arms from item 1, plus the animation from item 3 (chest, then out; for chain punch, one fist then the other).

### 5. Hook: an elbow folded to 14 degrees

- **What the ghost shows:** the left elbow out, the fist folded back past the shoulder. Flat, that is a 14 degree elbow.
- **What the detector wants:** the elbow held between 60 and 130 degrees while the fist travels 0.7 shoulder widths across the picture in 150 ms.
- **Fix (lead):** forward depth for the forearm (a hook's forearm points at the camera) and the animation: fist out to the side, then across.

### 6. Knife hand, trident sweep, moon arrow, sun burst, stake thrust: two-part moves, one part shown

- **Knife hand:** the ghost shows the finish (arm out to the right). The detector also wants the hand across the body within the last 550 ms. Never counts.
- **Trident sweep:** the ghost shows both hands on the left. The detector wants them to start on one side and end on the other. Never counts.
- **Moon arrow:** the ghost shows the draw. The detector wants the draw held 150 ms and then the string hand dropped. Counts only on letting go, and only from arms down.
- **Sun burst and stake thrust:** the ghost shows the finish. The detector wants hands together at the chest first. Both count from the chest and not from arms down, so it depends on where the hands happened to be.
- **Fix (lead + ours):** the animation from item 3, with `diagramFrom` as the first part.

### 7. Front kick: no chamber

- **What the ghost shows:** the leg straight out.
- **What the detector wants:** the knee up with the lower leg folded (under 110 degrees) inside the last 500 ms, then the leg straight.
- **Why the copy misses:** lifting a straight leg into the pose never folds the knee.
- **Side effect:** the hands are drawn in a guard, so raising them fires block, uppercut and rising palm.
- **Fix:** the animation from item 3 (knee up, then out).

### 8. Knee: counts, and fires the stake thrust

- The copy counts every time. But the diagram draws both hands together low in front of the belly, with nearly straight arms, and coming from the chest that is the stake thrust's finish.
- **Fix (ours, `diagram` in `src/moves/defs/knee.ts`):** draw the hands apart: `leftElbow: [36, 44], leftWrist: [38, 54], rightElbow: [64, 44], rightWrist: [62, 54]`. Tried through the same check: the knee still counts from both starts at both speeds and nothing else fires. Not made here because PR #215 is open on those files.

### 9. Uppercut and rising palm: count from the waist only

- Both count from arms hanging, because the hand rises from the waist to the chin on the way to the pose. From the chest they never count: the detector wants the hand down by the waist in the last 400 ms, and the still ghost does not show that.
- Each fires the other, and block, because the ghost's other hand is drawn in a guard and rises too.
- **Fix:** the animation from item 3 (drop the fist, then drive it up).

### 10. The defends count, but the ghost goes dim when the player matches it

- Duck, dodge and jump all count at both speeds. This part already works like a dance game.
- A dodge copied with the other-arm reading goes the wrong way and never counts. That is a real risk with a figure that has no face: nothing says it has its back to you.
- **Closeness is wrong in the pose.** A body exactly on the ghost's duck scores 0.00, a dodge 0.36, a jump 0.31. The figure is drawn leaning 0.35 m and crouching 0.4 m, but `ghostCloseness` calls 0.6 shoulder widths (0.24 m) the full move. A player who goes as deep as the drawing is told they are far off.
- **Fix (lead, `ghostPose.ts`):** make `LEAN` and `CROUCH` agree with `FULL_SHIFT`, so the drawn depth is the scored depth: about 0.017 m per diagram unit in place of 0.025.

## Three more things `ghostCloseness` gets wrong

All in `src/render/ghost/ghostPose.ts` (the lead's).

1. **It ignores the legs.** For front kick and knee, standing still with the arms as drawn scores 1.00. The brightness says nothing about the leg, which is the whole move.
2. **It measures down the picture in the same unit as across.** Webcam landmarks are shares of the picture's width and of its height, and the picture is wider than tall, so the same distance reads bigger downward: 1.33 times on a 640x480 camera (from how the tracker reports landmarks, not measured on a camera), 1.5 times in the test fixture. A body exactly on the ghost's joints scores 1.00 in a square picture (the test checks this) but 0.26 to 0.92 in the fixture's. The higher or lower the hand, the bigger the error (thunderbolt 0.26, overhead strike 0.53). Fix: scale the vertical target by the picture's width-to-height ratio, or measure heights against the shoulder-to-hip distance.
3. **It scores the idle hand as hard as the striking hand.** A player who throws a perfect jab with the other hand down loses half the score to the guard hand. Weight the joints the move is about.

## Does following the ghost work like a dance game today?

No.

- For the five defends: yes. Copy the figure and it counts.
- For the strikes: no. 4 of 21 count from a natural start, and two of those (uppercut, rising palm) only because the hand happens to pass through the right place on the way up.
- 13 moves can never be counted by stepping into the pose. The ghost is a still picture of one instant, and those detectors want a motion (wind-up then strike) or a fist coming at the camera, which a flat figure cannot show.
- For jab and cross it is worse than no help: the ghost shows an arm out to the side, and that is the exact thing the detector was built to reject.
- The brightness does not rescue it. Doing a strike correctly leaves the ghost dim, so the player has no sign they did it right.

## The three changes that would help most

1. **Animate the ghost (lead, with a second pose per move from us).** Loop from a start pose to the finish in about 0.8 s. Nothing else can fix the moves that are a motion: hammer fist, overhead strike, thunderbolt, knife hand, trident sweep, moon arrow, front kick and chain punch never count without it, and sun burst, stake thrust, uppercut and rising palm count from one start only.
2. **Draw forward arms forward (lead).** Turn the punching arm toward the lens with a depth cue, as legs already are. This fixes what the ghost teaches for jab, cross, spear thrust, reverse punch, chain punch, double palm, aegis push and hook. Then we add the missing `flungWide` check to spear thrust and reverse punch (ours).
3. **Make brightness mean "the detector would count this" (lead).** Score against the forward target, include the legs, fix the vertical scale and the lean and crouch depth, and weight the striking arm. Simplest version: brighten the ghost from the move's own `detect` confidence, and use closeness only as the hint on the way there.

Small and ours, after PR #215 lands: the knee diagram's hands (item 8).

## How to run

```
npx vitest run tests/ghostVsDetectors.test.ts
```

It prints the table above. Every row is pinned in the test and must also appear on this page, so a change to a diagram, to the ghost's maths or to a detector that moves a row fails until both are updated.

## Not tested

- No real body. The player is made of straight-line moves between poses, on the test fixture's body and picture scale.
- The ghost was not seen in a browser. How readable the figure is on screen (its size, that it has its back to the player) is read from the code only.
- The fixes for the ghost's drawing and for `ghostCloseness` are proposals: none was built or tried, apart from the knee diagram.
- Other ways of getting into a pose (a wind-up the player adds on their own, a bent path) were not tried. A player who already knows the move will do better than the copy; the check is about what the ghost alone teaches.
