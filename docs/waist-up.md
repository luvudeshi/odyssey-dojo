# Waist up: which moves still count when the camera sees no hips or legs

Issue #220. PR #217 lets a player seen only from the waist up calibrate and fight. At a desk the hips, knees and
ankles are out of the picture, and MediaPipe reports them with low visibility and guessed positions. This is
every move in `src/moves/defs/` read that way. `tests/moves/waistUp.test.ts` builds both tables, prints them, and
fails if the copies below are out of date.

## For the lead

- **Cannot count waist up: `front_kick` and `knee`.** Nothing else. Both read 0.00 because of one check,
  `legsVisible` in `src/moves/legSignals.ts`: both knees and both ankles at visibility 0.5 or more and inside
  the picture.
- **They are still asked for.** Taekwondo's strikes are `front_kick`, `knee`, `hammer_fist`, `uppercut`
  (`src/styles/defs/taekwondo.ts`), and every monster has a weak spot that takes `front_kick` or `knee`.
  `styleForLegs` in `src/moves/legSignals.ts` returns the style without its kicks when the legs are out of view.
  It is tested in `tests/kicks.test.ts`, and at the time of writing nothing under `src/` calls it. Calling it
  where the fight is given its style is what hides the leg moves from a waist-up player.
- **No defend needs a hip.** `block` reads the wrists (or the elbows when a wrist is unsure), the nose and the
  shoulders. `duck`, `dodge_left` and `dodge_right` read the shoulders against the calibrated baseline, and the
  head against the shoulders. All four count with the hips unseen.
- **What fails for the defends is the picture, not a measure.** Seated, with the shoulders 0.6 of the picture
  wide:
  - `dodge_left` and `dodge_right`: a dodge counts from a shift of 0.25 baseline shoulder widths, half the
    head's lean added (`sideStep` in `src/moves/defs/dodgeLeft.ts`, held from 0.5). Before that change it
    needed 0.42, and at this width that moved the middle of the shoulders 0.25 of the picture, past the range
    the presence check in `src/pose/presence.ts` allows (0.25 to 0.75), so the fight paused after 700 ms. A
    dodge just big enough now moves the middle 0.15 of the picture and keeps both shoulders in it up to
    shoulders 0.67 wide. The 0.45 and 0.75 dodges below are bigger than needed and still trip both.
  - `duck`: it counts from a drop of 0.3 shoulder widths, or the nose down to 0.2 above the shoulder line
    (`src/moves/defs/duck.ts`). A duck just big enough stays in the picture. The suite's own duck, 0.75
    widths, takes the shoulders out of the bottom, where the tracker is guessing them and presence stops
    seeing the player.
  - `block`: trips nothing.

## How it is measured

- **The performance.** Each move done right once, from standing with the arms down: `PERFORMANCES` in
  `tests/helpers/crossFire.ts`, the same made-up sequences as the cross-fire table (`docs/cross-fire.md`).
- **Full body.** The performance as it is. The kicks are drawn with the legs in the picture.
- **Waist up, unseen.** Landmarks 23 to 32 (hips, knees, ankles, heels, toes) at visibility 0.1, in the picture
  and on the 3D body. They stay where the performance drew them.
- **Waist up, unseen and frozen.** The same, with those points also held where they were on the first standing
  frame, in the picture and on the 3D body: a guess that never moves.
- **Read the way the game reads.** The baseline comes from the standing frames, as at calibration, and the frames
  go through `tools/recorder/replay.ts`: the real pose input, a strike thrown at 0.7 or a defend held at 0.5.
- **Seated.** The picture is scaled so the shoulders are 0.6 of its width and sit 0.65 of the way down, about
  the highest that keeps the head in the picture. The hips end up below the picture and are unseen. The duck and
  the dodges are done at two sizes: 0.45 shoulder widths, which was just over the 0.42 that counted before the
  lenient defends, and the suite's 0.75.
  The last column says what the final frame breaks: a shoulder outside the picture, or one of the presence
  limits from PR #217 (shoulders at most 0.7 wide, their middle between 0.25 and 0.75 across), which are written
  out in `tests/helpers/waistUp.ts` so this table does not depend on which PR merges first.

Nothing here has been done by a real body. The tables say what the detectors do with clean, made-up frames.

## Every move

A cell is yes or no, and in brackets the highest confidence the move's own detector reached (0.7 counts).

| move | full body | waist up: hips and legs unseen | waist up: unseen and frozen | what fails |
|---|---|---|---|---|
| jab | yes (1.00) | yes (1.00) | yes (1.00) | - |
| cross | yes (1.00) | yes (1.00) | yes (1.00) | - |
| hook | yes (1.00) | yes (1.00) | yes (1.00) | - |
| uppercut | yes (1.00) | yes (1.00) | yes (1.00) | - |
| double_palm | yes (1.00) | yes (1.00) | yes (1.00) | - |
| rising_palm | yes (1.00) | yes (1.00) | yes (1.00) | - |
| knife_hand | yes (1.00) | yes (1.00) | yes (1.00) | - |
| reverse_punch | yes (1.00) | yes (1.00) | yes (1.00) | - |
| hammer_fist | yes (1.00) | yes (1.00) | yes (1.00) | - |
| chain_punch | yes (1.00) | yes (1.00) | yes (1.00) | - |
| front_kick | yes (1.00) | no (0.00) | no (0.00) | legs in view: `legsVisible` in `src/moves/legSignals.ts` wants both knees and both ankles at visibility 0.5 or more, inside the picture |
| knee | yes (1.00) | no (0.00) | no (0.00) | legs in view: `legsVisible` in `src/moves/legSignals.ts` wants both knees and both ankles at visibility 0.5 or more, inside the picture |
| block | yes (1.00) | yes (1.00) | yes (1.00) | - |
| duck | yes (1.00) | yes (1.00) | yes (1.00) | - |
| dodge_left | yes (1.00) | yes (1.00) | yes (1.00) | - |
| dodge_right | yes (1.00) | yes (1.00) | yes (1.00) | - |
| thunderbolt | yes (1.00) | yes (1.00) | yes (1.00) | - |
| trident_sweep | yes (1.00) | yes (1.00) | yes (1.00) | - |
| aegis_push | yes (1.00) | yes (1.00) | yes (1.00) | - |
| swift_dash | yes (0.88) | yes (0.88) | yes (0.88) | - |
| moon_arrow | yes (1.00) | yes (1.00) | yes (1.00) | - |
| sun_burst | yes (1.00) | yes (1.00) | yes (1.00) | - |
| jump | yes (0.86) | yes (0.86) | yes (0.86) | - |
| overhead_strike | yes (1.00) | yes (1.00) | yes (1.00) | - |
| spear_thrust | yes (1.00) | yes (1.00) | yes (1.00) | - |
| stake_thrust | yes (1.00) | yes (1.00) | yes (1.00) | - |

The 24 that count read exactly as they do with the whole body: the hand moves, the defends and the jump look
only at the nose, shoulders, elbows and wrists. The one hand move that reads a hip is `trident_sweep` (the wrists
must be above the hips in the picture), and it counts in both variants.

## What the fight can do with it

Issue #239. `src/moves/waistUp.ts` turns the table into three functions the engine can call. None of them reads a
detector, and `tests/waistUp.test.ts` checks them.

- **`NEEDS_LEGS`** is the list `front_kick`, `knee`: the rows above that say no. The test builds the table again and
  also reads the copy on this page, and fails if either has a different set of rows that say no.
- **`legsInView(history, was)`**: true when both knees and at least one ankle were seen (visibility 0.5 or more,
  inside the picture) in more than half of the frames in the history, which holds the last second. With fewer
  than 5 frames it is false. `was` is the answer it gave last time: legs that were in view stay in view until they
  are seen in under 3 frames in 10. With that, a knee that comes and goes every other frame changes the answer at
  most once; without it, on every frame. Legs that leave are out after about 0.7 s and back about half a second
  after they return.
- **`askable(moveId, legsInView)`**: false for a move in `NEEDS_LEGS` when the legs are out of view, true for
  everything else.
- **`swapFor(moveId, style, fitting)`**: the move to ask for in its place. A move that counts waist up comes back
  as it is. A kick becomes the nearest hand strike of the same style: for `front_kick` the first the style has of
  `spear_thrust`, `cross`, `reverse_punch`, `double_palm`, `jab`, `chain_punch`, `uppercut`; for `knee` the first of
  `uppercut`, `rising_palm`, `hook`, `hammer_fist`, `cross`, `spear_thrust`, `reverse_punch`, `double_palm`. `fitting`
  is optional, the open weak spot's `moves`: a hand strike from that list is taken first, so the swap still fits
  the spot. A defend would become `block`; no defend needs it today.

| style | `front_kick` becomes | `knee` becomes |
|---|---|---|
| boxer | cross | uppercut |
| jiu_jitsu | double_palm | rising_palm |
| karate | reverse_punch | hammer_fist |
| kung_fu | double_palm | rising_palm |
| taekwondo | uppercut | uppercut |

With the legs out of view, all five styles keep a hand strike, every weak spot of all six monsters gets an askable
strike from the player's style (one that fits the spot whenever the style has one that does), every attack's
counter is askable, and so are the six finishers (one per stop since issue #33).

Two things to know before wiring it in:

- `legsInView` asks for one ankle; the kicks' own `legsVisible` asks for both. A player with one ankle hidden can
  be asked for a kick that then reads nothing. The kick detectors are being loosened in another change; if they
  keep wanting both ankles, `legsInFrame` in `src/moves/waistUp.ts` is the one line to tighten.
- `duck` and `jump` stay askable, because the table says both count without the hips. The seated table below
  says where a duck goes wrong close to the camera: a big one takes the shoulders out of the bottom of the picture.

## The four defends, seated

Shoulders 0.6 of the picture wide, hips below the picture and unseen.

| defend | size of the move | counts | shoulders end at (across, down) | what it trips |
|---|---|---|---|---|
| block | as performed | yes (1.00) | 0.50, 0.65 | - |
| duck | just enough to count (0.45 widths) | yes (0.82) | 0.50, 0.92 | - |
| duck | as performed (0.75 widths) | yes (1.00) | 0.50, 1.10 | a shoulder is out of the bottom of the picture |
| dodge_left | just enough to count (0.45 widths) | yes (1.00) | 0.23, 0.65 | a shoulder is out of the side of the picture; presence: move into view (middle of the shoulders outside 0.25 to 0.75) |
| dodge_left | as performed (0.75 widths) | yes (1.00) | 0.05, 0.65 | a shoulder is out of the side of the picture; presence: move into view (middle of the shoulders outside 0.25 to 0.75) |
| dodge_right | just enough to count (0.45 widths) | yes (1.00) | 0.77, 0.65 | a shoulder is out of the side of the picture; presence: move into view (middle of the shoulders outside 0.25 to 0.75) |
| dodge_right | as performed (0.75 widths) | yes (1.00) | 0.95, 0.65 | a shoulder is out of the side of the picture; presence: move into view (middle of the shoulders outside 0.25 to 0.75) |

"Counts" here is the detector alone, fed the made-up position of a shoulder that has left the picture. On a
camera that shoulder is a guess, so a row that trips something is a defend that cannot be relied on.

## Not in the tables

- **The torso ruler.** Since #168 the punches measure fist height in torso lengths, and the torso length is
  taken once, at calibration, from the shoulders and the hips of the 3D body (`torsoLength3d` in
  `src/pose/signals.ts`). Waist up, those hips are guessed. The frames here keep the 3D hips where the fixture
  has them, so the ruler is right and the punches count. The review of PR #217 tried wrong rulers: a punch 0.2 m
  under the shoulder stopped counting below 0.6 of the real torso, and jab and cross stopped above about 1.85
  times it. Hips that shake during the fight change nothing, because the ruler is not measured again.
- **Hands outside the picture.** Seated, the arms-down start of every hand move is below the picture, and the
  hands of the overhead and wide moves leave the top and the sides. No hand detector looks at wrist visibility,
  so on a camera those moves depend on where the tracker guesses the hand.

## Not tested

- No real body and no webcam. What MediaPipe returns for hips and legs it cannot see is modelled here as low
  visibility, with the points either left in place or frozen. A real waist-up trace of each move, replayed by
  `tests/moves/replay.test.ts`, is what would settle it.
- One clean performance per move, on the fixture's adult.
- The presence check itself is not run: its limits are written out in the helper.
