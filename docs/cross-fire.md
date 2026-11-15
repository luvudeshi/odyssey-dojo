# Cross-fire: which moves set off which

Issue #191. Each detector has its own test, but the biggest risk on a real camera is one move setting off another.
This is every move in `src/moves/defs/` against every other. `tests/moves/crossFire.test.ts` builds the table,
prints it, and fails if the copy below is out of date.

## How it is measured

- **The performance.** Each move done right once, from standing with the arms down: the made-up sequences the
  detector tests already use (`PERFORMANCES` in `tests/helpers/crossFire.ts`).
- **Three body sizes** (`tests/helpers/anyBody.ts`): a child (0.6x, smaller in the picture and shorter in
  metres), the fixture's adult, and a tall adult (1.4x) standing back far enough to keep the feet in the picture.
- **Read the way the game reads.** The baseline comes from the standing frames, as at calibration, and the frames
  go through `tools/recorder/replay.ts`: the real pose input, a strike thrown or a defend held at 0.7.
- **The window** is the performance itself, from the first standing frame to the last frame of the move.

Nothing here has been done by a real body. The table says what the detectors do with clean, made-up frames.

## The table

Rows are the move done, columns the move read, numbered like the rows. A cell holds the sizes it fired at:
`c` child, `a` adult, `t` tall; a dot is none. The diagonal is the move itself. Rows 1 to 12 are the styles'
strikes (Boxer 1 to 4, Jiu-jitsu 5 to 7, Karate 8 and 9 with 7, Kung Fu 10 with 5 and 6, Taekwondo 11 and 12
with 9 and 4), 13 to 16 the four defends, 17 to 22 the six god gestures, then the jump and the three strikes
that are only finishers (overhead strike, spear thrust, stake thrust).

| done \ read | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 jab | cat | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . |
| 2 cross | . | cat | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . |
| 3 hook | . | . | cat | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . |
| 4 uppercut | . | . | . | cat | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . |
| 5 double_palm | . | . | . | . | cat | . | . | . | . | . | . | . | . | . | . | . | . | . | cat | . | . | . | . | . | cat | . |
| 6 rising_palm | . | . | . | . | . | cat | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . |
| 7 knife_hand | . | cat | . | cat | . | . | cat | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . |
| 8 reverse_punch | . | cat | . | . | . | . | . | cat | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . |
| 9 hammer_fist | . | . | . | . | . | cat | . | . | cat | . | . | . | . | . | . | . | cat | . | . | . | . | . | . | . | . | . |
| 10 chain_punch | cat | cat | . | . | . | . | . | . | . | cat | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . |
| 11 front_kick | . | . | . | . | . | . | . | . | . | . | cat | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . |
| 12 knee | . | . | . | . | . | . | . | . | . | . | . | cat | . | . | . | . | . | . | . | . | . | . | . | . | . | . |
| 13 block | . | . | . | . | . | . | . | . | . | . | . | . | cat | . | . | . | . | . | . | . | . | . | . | . | . | . |
| 14 duck | . | . | . | . | . | . | . | . | . | . | . | . | . | cat | . | . | . | . | . | . | . | . | . | . | . | . |
| 15 dodge_left | . | . | . | . | . | . | . | . | . | . | . | . | . | . | cat | . | . | . | . | . | . | . | . | . | . | . |
| 16 dodge_right | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | cat | . | . | . | . | . | . | . | . | . | . |
| 17 thunderbolt | . | . | . | cat | . | . | . | . | . | . | . | . | . | . | . | . | cat | . | . | . | . | . | . | cat | . | . |
| 18 trident_sweep | . | . | cat | . | cat | . | cat | . | . | cat | . | . | . | . | . | . | . | cat | . | . | . | . | . | . | cat | . |
| 19 aegis_push | . | . | . | . | cat | . | . | . | . | . | . | . | . | . | . | . | . | . | cat | . | . | . | . | . | cat | . |
| 20 swift_dash | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | cat | . | . | . | cat | . | . | . | . | . | . |
| 21 moon_arrow | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | cat | . | . | . | . | . |
| 22 sun_burst | . | . | . | . | . | . | cat | . | . | . | . | . | . | . | . | . | . | . | . | . | . | cat | . | . | . | . |
| 23 jump | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | cat | . | . | . |
| 24 overhead_strike | . | . | . | cat | . | . | . | . | . | . | . | . | . | . | . | . | cat | . | . | . | . | . | . | cat | . | . |
| 25 spear_thrust | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | cat | . |
| 26 stake_thrust | . | . | . | . | cat | . | . | cat | . | . | . | . | . | . | . | . | . | . | cat | . | . | . | . | . | cat | cat |

Every cell is the same at all three sizes: the detectors measure in shoulder widths and torso lengths, and
body size does not move any of these pairs.

## What must be clean

A player is only ever asked for the strikes of their own style, the four defends and the six god gestures. So
the pairs that matter are the ones inside one style's strikes plus those ten moves. Two strikes from different
styles (a karate reverse punch reading as a boxer's cross) are never asked of the same player in the same
fight, and the fight only counts the strike it asked for.

Before this issue 15 such pairs fired. Seven were fixed then, and an eighth (thunderbolt read as uppercut) by the
lenient-strikes PR; seven are left and pinned. The moon arrow's cross and chain punch reads went away when a punch had to
be in front of the shoulder.

Four of the pinned pairs, and one of the fixed ones, had the overhead strike or the spear thrust in them. Those
two were Hoplite's strikes. Since Jiu-jitsu took Hoplite's place no style has them, a fight asks for them only as
a finisher, and their pairs are listed under Pairs across styles.

Jab and cross are distinct again, by the owner's later ruling: the jab is the left hand and the cross the right, so a
right-hand punch reads as a cross only. The karate reverse punch, knife hand and the chain punch still read as a cross
(and the chain punch as a jab); those are two styles' strikes and never asked of one player.

The loosened gates (the lenient-moves PR) let the god gestures read as ordinary strikes too: the trident sweep as a
hook, knife hand, double palm and chain punch (and as a spear thrust, which no style has now); the sun burst
as a knife hand; the thunderbolt as an uppercut again. A god gesture is done on purpose with the power ring full, the
fight spends the power on it, and the extra reads only count if one of them is also the prompted strike, so they are
pinned in `LEFT` rather than guarded. The MISS flash ignores a frame in which a power move was thrown.

## Fixed

| Done | Also read as | Styles | The change |
|---|---|---|---|
| cross | uppercut | Boxer | `risingHand`: a hand whose elbow is snapping open is a punch, not a rising hand |
| chain punch | rising palm | Kung Fu | the same |
| block | uppercut | Boxer, Taekwondo | `risingHand`: both hands coming up together are not a one-handed rising strike |
| block | rising palm | Jiu-jitsu, Kung Fu | the same |
| double palm | rising palm | Jiu-jitsu, Kung Fu | the same |
| moon arrow | uppercut | Boxer, Taekwondo | the same: the bow arm and the string hand come up together |
| sun burst | spear thrust | none now (a finisher) | `spear_thrust`: both wrists flung out past their own sides are not a thrust at the camera |
| thunderbolt | uppercut | Boxer, Taekwondo | lenient-strikes PR: `risingHand` reads the elbow's height, and the hand must end at chin height or above (0.2 shoulder widths over the shoulder line) |

The two `risingHand` rules (`src/moves/handSignals.ts`) are shared by the uppercut and the rising palm:

- **Not while the elbow is opening.** A cross thrown from the waist passes chin height with its elbow part
  bent, inside 400 ms of the hand being down: that was an uppercut. `armOpening` (20 degrees in 100 ms) is the
  measure the jab and the cross already use for an arm on its way out. An uppercut's elbow closes or holds.
- **Not when the other hand has come up too.** If the other wrist rose from under the chest (0.4 shoulder widths
  below the shoulder line) by half the rising hand's own minimum (0.375 shoulder widths) in the same 450 ms, at any
  stage of the way, it is a guard going up or the start of a two-handed push. The other hand lifted from a guard
  at the chest to the face is a boxer covering up, and the uppercut still counts. (Before the lenient-strikes PR this was "below the waist inside 400 ms and now above chest
  height", which a looser uppercut fired ahead of.)
- **The elbow stays low.** Since the lenient-strikes PR an upper arm lifted more than 55 degrees from hanging
  is a punch, not a rising hand: how high the elbow comes is the one feature between the cross and the uppercut.

The spear thrust rule uses `flungWide`, which the jab and the cross used before the lenient-strikes PR, but needs BOTH wrists out, so
a thrust by a player turned 30 degrees (one wrist out, the other in) still counts.

The `risingHand` rules also remove the pair found in #178: a jab or cross aimed 20 to 40 degrees upward, 300 ms
after the hands come up, used to read as a rising palm or an uppercut as well. The same test file checks it on
the fixture's build, on 0.30 m shoulders with 0.60 m arms and on 0.28 m shoulders with 0.55 m arms.

What this costs, and has not been tried on a real body: an uppercut thrown while the other hand is also on its
way up does not count. From a guard, or with the other arm hanging or on a desk, it counts.

The jab and the cross no longer use `flungWide`: since the lenient-strikes PR they are `strike` in
`src/moves/handSignals.ts`, which lets a fist land up to 1.6 shoulder widths out and rules out an upper arm
pointing out to its own side. That is what keeps the moon arrow's bow arm, raised sideways, from reading as a jab.

## Left, and why

Each of these is asserted as firing in `tests/moves/crossFire.test.ts` (`LEFT`), so the test fails the day one
stops. That is good news when it happens: take the pair out of `LEFT` and out of this list.

| Done | Also read as | Styles | Why it is left |
|---|---|---|---|
| hammer fist | thunderbolt | Karate, Taekwondo | The same motion by design. The thunderbolt is "raise either hand over your head, then throw it down"; with the left hand that is the hammer fist. |
| double palm | aegis push | Jiu-jitsu, Kung Fu | The same motion by design: both palms pushed straight out from the chest. |
| aegis push | double palm | Jiu-jitsu, Kung Fu | The same. |
| swift dash | dodge right | every style | By design: a dash is one fast step to the side, and a step to the side is a dodge. A dodge is held, not thrown, and does nothing while the fight waits for a strike. |
| jab | cross | Boxer | By the owner's ruling: both read a straight punch on either hand, so a reasonable attempt counts every time. |
| cross | jab | Boxer | The same. |

The first three and the dash need a design change, not a threshold: one of each pair would have to become a
different gesture. The fight counts only the move it asked for, so the cost today is that either gesture
answers either prompt.

## Pairs across styles

These fire too, and are in the table, but both moves are never asked of one player in one fight. They are
pinned in the same test (`OUTSIDE`) so a change shows up.

| Done | Also read as | Why |
|---|---|---|
| reverse punch, knife hand | cross | The right arm is punched out fast. The cross does not look at the left hand's hip, or at where the right hand started, and the jab reads either hand too. |
| chain punch | jab, cross | A chain punch is a jab and then a cross. |
| double palm | spear thrust | Both arms snapped straight; see aegis push below. |
| overhead strike | thunderbolt | The same motion by design: with the right hand the thunderbolt is the overhead strike. The overhead strike is only asked for as Circe's finisher. |
| thunderbolt | overhead strike | The same. |
| trident sweep | spear thrust | A god gesture read as a strike, like the trident sweep's other reads. The spear thrust is only asked for as the suitors' finisher. |
| aegis push | spear thrust | A thrust is both arms snapped straight at shoulder height, and so is a push. Only the hand spacing could split them, and the existing spear thrust tests thrust with the wrists 0.72 shoulder widths apart, inside the push's 0.9. Where a real player's hands end up in the picture needs a real trace. The spear thrust is only asked for as the suitors' finisher. |
| stake thrust | aegis push | The stake's grip at the chest is the push's start, and the arms end straight. The stake is only asked for as the Polyphemus finisher. |

Since the lenient-strikes PR, hook, hammer fist, overhead strike and knife hand no longer also read as the rising
strike of the same hand: the rising hand must end at chin height or above with the elbow kept low.

## Not tested

- No real body and no webcam. A real trace of each move, replayed by `tests/moves/replay.test.ts`, is what
  would settle the pairs above.
- One clean performance per move. A sloppy one, a turned player or a noisy camera can cross-fire where this
  table is clean; `tests/moves/anyBody.test.ts` and `tests/moves/defendNoise.test.ts` cover some of that.
- Moves in a row. Each performance starts from standing with the arms down, not from the end of another move.
