# Two players on one camera

Two people stand side by side in front of one computer. The game follows both bodies, each gets a hero of their own, and they fight one monster together. Issue #28.

The code is in `src/duo/`. It is **mounted**: the Multiplayer screen has the card "Two players, one camera", and five files outside `src/duo/` turn it on (see "Where it is mounted").

## How it works

1. **The camera finds two bodies.** With the choice on, the pose model is asked for two bodies in each picture (`numPoses: 2`). When it gives fewer than two, two more models each read one half of the picture (see "Finding two bodies"). With it off the model is asked for one, exactly as today.
2. **Seats** (`src/duo/assign.ts`). Every body found goes to `createSeating()`. Which body is which is decided by `assignPlayers` from `src/pose/players.ts` (PR #99): of a fresh pair, the one on the left of the picture is player one; after that each body goes to the player it moved least from, so walking past each other or the model swapping its order does not swap the players. On top of that:
   - a body with hidden shoulders, a body with shoulders under 6% of the picture (someone in the background), and one person the model found twice are dropped;
   - the second player **joins** after standing in the picture for 1 second without a break, and only with shoulders at least 0.6 of player one's (`BEHIND`). Someone smaller than that stands well behind player one, more than one and a half times as far from the camera: a spectator. They are not let in, because a defend counts only when both make it and they would cost the player every one. The widths compared are each seat's widest of the last second or so, so shoulders that go narrow in a punch change nothing. It is asked only at the join: a player who is in stays in;
   - the second player has **left** after not being seen for 0.7 seconds in pictures that keep coming; fewer lost frames change nothing. A hitch in the pictures themselves (none at all for up to 1.5 seconds) is not a leave;
   - if **player one** walks out and the other stays, after 0.4 seconds the one who stayed becomes player one. Their picture is moved and sized to where the first hero stood, so the stance measured at calibration still fits and the fight does not stop to ask anyone to step back in.
3. **Each body is read on its own** (`src/duo/split.ts`). Player two gets their own history, their own neutral stance (taken from their first 8 frames, and again at the moment they join) and their own `createPoseInput`, the same reader a single player gets. Standing to one side does not matter: every detector measures against the body's own stance.
4. **The link** (`src/duo/duoLink.ts`). The fight screen already takes a `HostLink` for online rooms, and the FaceTime call uses the same one. `createDuoLink` builds that same link on a transport that never leaves the page, and feeds player two's strikes in as the guest's. So the fight, the "Together! x2" flash and the scoring are the room fight's, unchanged.
5. **The second hero** (`src/duo/SecondFigure.tsx`): the same spartan in blue, to the hero's right, moved by player two's body. Drawn only while two are playing.
6. **The choice** (`src/duo/ui/DuoCard.tsx`): a card on the Multiplayer screen, "Two players, one camera".

"Left" means left in the mirrored picture the game shows, which is also the left of the room as the players see it. The person on the left is player one.

## The rules of a duo fight

- Both strike. The prompt asks both for the same strike.
- **Together:** if both land the prompted strike within 0.4 seconds of each other, it does double damage. This is the room rule (`TOGETHER_MS` in `src/net/host.ts`): the first strike is held up to 0.4 seconds for the other.
- **Each defends for themself:** the defend the attack asks for counts only when both players have made it. If either misses it, the attack lands. The two share one health bar (the engine has one). `createDuoLink(..., { defend: "first" })` gives the room rule instead, where only player one defends.
- **One leaves:** if player two leaves, the fight goes on with one player with no pause: strikes land at once and player one defends alone. If player one leaves, player two takes over as said above. When the other comes back and stands for a second, they are in again.

## How to stand

- Side by side, about an arm's length apart, so a punch to the side does not cross the other body.
- Both from the head to the waist in the picture. Legs are not needed, except for kicks.
- About 2 to 2.5 metres from a laptop camera. Player one must be inside the middle half of the picture (the game's presence check); the shoulders of each should be wider than a tenth of the picture.
- Level with each other. A second player well behind the first (shoulders under 0.6 of theirs) is taken for someone watching and is not let in until they step forward.
- Do not stand one behind the other. When two bodies overlap fully for more than a moment the model sees one person, and the two can come out swapped.
- Player two: walk in, stand still with arms down for a second. That is when the game takes your neutral stance.

## Finding two bodies

Measured on 15 November with drawn figures (Chrome's fake camera, the real game, an Apple M4 GPU): asked for two bodies in the whole picture, the model gives **one** when the two touch or nearly touch (a gap under 5 to 15% of a body height, more for close-ups), and one for small figures. That is the likely reason a try with two real people showed one player. The switch from one body to two on a running model (`setOptions`) was checked and works: two bodies on the same picture, every picture.

So while the choice is on, the tracker has two more models, each asked for one body in one half of the picture (55% of the width each, so they share a strip in the middle). `src/duo/halves.ts` picks the reader, picture by picture:

- the whole picture is the first reader. While it shows two bodies the halves are not read at all;
- while it shows fewer than two, one half is tried on every sixth picture. When the two halves together show more bodies than the whole picture, both are read once to be sure, and then the halves are the reader;
- the halves hand back when the whole picture shows more than they do, or after three pictures in a row in which they found no more than it;
- one person standing on the middle line is seen by both halves: two readings nearer than one shoulder width are one person, handed over once;
- if a half model cannot be made or throws, both are closed and the whole picture is read as before.

The same game on the same pictures, before and after (pictures with one body / with two, and when player two joined):

| Picture | Before | After |
|---|---|---|
| 60% high, an arm's length apart | 0 / 287, joined at 1.0 s | 0 / 287, 1.0 s (whole picture) |
| 60% high, touching | 274 / 0, never joined | 12 / 274, 1.4 s (halves) |
| 80% high, centres 0.4 body heights apart | 270 / 0, never | 12 / 259, 1.4 s (halves) |
| close-ups cut at the hips | 269 / 0, never | 12 / 259, 1.4 s (halves) |
| moving for 21 s: 80% high, staying close, arms going up | 179 / 452, player two left twice | 12 / 619, never left (halves) |
| one figure alone (on the middle line, close up, to one side) | one body | one body, never a second |

Time for one picture in the game (median): 22 to 26 ms with two bodies either way, the same as before. With one body in the picture the median is unchanged and one picture in six takes about 15 ms longer (the half that is tried).

With `?debug`, `window.__trackerStats` has `bodies` (found in the newest picture), `bodyFrames` (pictures with none, one, two), `reader` (`one`, `whole` or `halves`) and `halfReads`. If two people play and `bodyFrames` shows mostly one, the model is not finding the second: stand further apart.

Not known: all of this with real people. Drawn figures stand square to the camera in even light; the gap at which real bodies merge, and how the halves do with a real arm reaching across the middle, were not measured. Two small figures (shoulders under 6% of the picture) are found by the halves but still not let in by the seats. Someone half outside the picture is still one body. With the camera already running when the card is pressed, the half models are made during the first pictures and player two joins about 0.7 s later than before (1.6 s). The CPU model (`?pose=cpu`) gave the same bodies in three of these pictures. Not tried: a half model failing on a real machine, three people, and any machine but this one.

## Where it is mounted

Five files outside `src/duo/`. The card uses the Multiplayer screen's own card classes, so it takes the look of the other cards.

- `src/pose/tracker.ts`: ask the model for `duoCamera.wanted()` bodies (it changes on the running model with `setOptions`), and while duo is on hand every body to `duoCamera.take`, which gives back player one's frame. The two half models are made when the choice is first on and closed when it goes off.
- `src/screens/Multiplayer.tsx`: `<DuoCard onStart={(link) => { props.onOpen(); props.onStart(link); }} />` in the row of cards.
- `src/render/Scene.tsx`: `<SecondFigure />` next to `<Hero>`.
- `src/App.tsx`: one effect that turns duo off when the player leaves that way of playing. And when the camera does not start after "Play side by side", the player lands on the main menu, where the camera problem card is: not back on the Multiplayer screen with nothing said, and not in a keyboard fight as a room's host does (two players on one camera have no room to keep and cannot play without the camera).
- `src/hud/CameraView.tsx`: the skeleton is drawn from `duoCamera.seen(frame)`. After player two takes over as the hero, the fight's frame is moved to where the first hero stood; this draws the skeleton on the player in the picture instead. Without this line the game plays the same, and only the skeleton is in the wrong place after a take-over. While duo is on, the panel's tag reads "One seen" or "Both seen" instead of "Your body", so the players can tell whether the second one is in.

With the choice off nothing changes: the model is built with one body, the old code path returns the frame, and `duoCamera.seen` gives back the frame it was given.

## The smoke script

```
node scripts/duo-smoke.mjs
node scripts/duo-smoke.mjs --shots=shots/duo
```

It starts the dev server on a free port, opens the game in headless Chrome and prints one PASS or FAIL line per check; the exit code is 1 when a check fails. `--shots=<folder>` saves six pictures (the Multiplayer screen at both sizes, and the fight with two heroes, at the doubled hit, after player two left and after the take-over). It needs Chrome and Playwright, found the same way as in `scripts/smoke.mjs` (`FPS_PLAYWRIGHT`, `FPS_CHANNEL`, `FPS_GL`). One run takes about 45 seconds.

When the Multiplayer screen has no two-player card, it prints `SKIP: the Multiplayer screen has no two-player card yet` and exits 0.

With the card mounted, it plays a fight with the pose path on. Chrome's fake camera runs the real tracker; the bodies the tracker hands to `duoCamera.take` are swapped for two made-up ones, built from the same frames the unit tests use. Player one calibrates and fights from a made-up body too, so the "step back" pause is live and a pause would be seen. It checks:

- the card is on the Multiplayer screen, and fits at 1280x720 and 1600x900 (inside the window once scrolled to, nothing spilling out, not over another card);
- pressing it starts a fight, with two bodies asked for;
- the second body gets a figure of its own;
- the second body alone lands the prompted strike, with no "Together" flash;
- both bodies striking 200 ms apart give the doubled hit, with the flash;
- a defend made by only the first body, and one made by only the second, both cost health; one made by both costs nothing;
- the second body leaves: one hero, the fight never stands still, the first body's next strike lands;
- the camera panel's tag reads "Both seen" with two bodies and "One seen" after the second left;
- the second body comes back, then the first leaves: the one who stayed is the hero, drawn where the first hero stood, the fight never stands still, and their next strike lands;
- the camera panel's skeleton is on the promoted player (skipped with a line when `CameraView.tsx` was left out of the mount);
- no console error. Requests to `/api` are left out of this: the dev server has no game server behind it.

"Never stands still" is measured: the longest time the fight's state did not change must stay under half a second (the pause for a lost body lasts at least a second). On a busy machine the tracker itself can stop handing over pictures for a while; the fight then pauses whoever is in the picture, the check fails, and the line says so. Run it again.

## What was tested

- `npx vitest run tests/duoAssign.test.ts tests/duoLink.test.ts`: 30 tests with made-up landmark frames. Seats through a crossing and through lost frames; joining and leaving; someone well behind the player who is never let in, also while the player's shoulders are narrow in a punch; player one leaving; where the promoted player is drawn in the camera panel; bodies that are dropped; two bodies giving two inputs; player two's strike reaching the real engine through the link; both striking for double damage; each defending for themself; the fight carrying on at once when player two leaves.
- `node scripts/duo-smoke.mjs` with the diff applied: the last two full runs passed every check (one with all five files, one without `CameraView.tsx`). Two earlier runs, made while the script was being written, went wrong in ways that are not the two-player code as far as could be told: in one the fight stood still for 23 seconds after the first body left, on a laptop that was running other browsers at the time (that run is why the script now measures the gap between the tracker's pictures; it did not happen again in four more runs); in one the dev server reloaded the page and the card could not be pressed (the script now loads everything once before it starts). A single-body strike took 14 to 18 health and a doubled one 30 to 40.

## What was not tested

- **No real camera with two real people.** Everything above uses made-up frames. How well MediaPipe's lite model holds two real bodies side by side, at what distance, and in what light is not known. The made-up bodies never overlap, never turn sideways, and are always fully in the picture.
- **The cost of two bodies was not measured.** In the smoke run the model is asked for two bodies but the fake camera shows nobody, so its time says nothing about two real people. Expect the body model to run once per person, so roughly twice the time of one player; measure with `?debug` (`window.__trackerStats.detectMs`) on the demo laptop, with two people, before showing it.
- Calibration with two real people in the picture. In the smoke run the made-up player one stands at 0.38 of the picture and player two at 0.70.
- A second player who is moving while they walk in. Their place in the picture is the average of their first 15 frames, so someone who dodges in those frames would be drawn a little off after a take-over.
- Edge, and software GL. The runs were in Chrome on the laptop's own GPU.

## Two faults the smoke script found

The check "a defend counts only when both make it" failed about one run in three on a busy laptop. Both causes were in `src/duo`, not in the script, and both have unit tests now.

- **Player two's stance was taken at a chance moment.** The shared pose history takes a stance once 20 frames fit inside one second. Player one never relies on that (calibration gives theirs), but player two did. At about 20 pictures a second that moment came late and at random, sometimes in the middle of a dodge. Standing still then read as the opposite dodge for the rest of the fight: a dodge made by player one alone counted for both, and a dodge made by both in the other direction did not count. Under 20 pictures a second player two would have had no stance at all, so no dodge or duck of theirs would ever have been read. Now the stance comes from player two's first 8 frames (`STANCE_FRAMES` in `src/duo/split.ts`).
- **A hitch in the pictures counted as player two leaving.** With no picture for 0.7 seconds the count fell to one player and came straight back. For that moment player one defended for both, and player two's stance was taken again from whatever they were doing. Now only pictures that keep coming without player two count them out; pictures stopping altogether does so after 1.5 seconds (`STOPPED_MS` in `src/duo/assign.ts`).

After the two fixes the script passed six runs out of six with the diff applied.

## Known rough edges

- **Duo stays on until "Main menu".** Every fight picked from the map after a duo fight is still a duo fight: the model looks for two bodies (about twice the time per picture) and anyone who stands level with the player for a second is player two, whose defends are then needed. Before someone plays alone, go to the main menu; that turns duo off.
- **People watching.** Someone well behind the players is not let in (see Seats), but someone standing level with them is a player as far as the game can tell. The model is asked for two bodies, so with three people in the picture it may follow one who is watching and not the second player. And of two bodies seen in the very first picture, the left one is player one whatever their size, so someone watching on the left at that moment is the hero: go to the main menu and start again. Keep people who watch out of the picture.
- The "You + Friend" tag stays up for the rest of a fight after player two leaves, and after a take-over. It is drawn by the HUD (`src/hud/TogetherFlash.tsx`) from the fight's own state, which was started for two; nothing in `src/duo` can change it. The link knows the truth: `link.guestHere()` is false once player two has left. The smoke script prints a NOTE line while this is so. The camera panel's own tag ("One seen", "Both seen") does follow who is there.
- With the FaceTime card shown there are four cards in the Multiplayer row. They fit in one row with no scrolling from 1280x720 up; the row is then wider and its buttons are set in smaller type (`.mp-cards:has(.ft-card)` in `src/ui/set/screens-mp.css`).
