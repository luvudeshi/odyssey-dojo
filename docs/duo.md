# Two players on one camera

Two people stand side by side in front of one computer. The game follows both bodies, each gets a hero of their own, and they fight one monster together. Issue #28.

The code is in `src/duo/`. It is merged but **not mounted**: four small changes in lead-owned files turn it on (see "What the lead applies").

## How it works

1. **The camera finds two bodies.** With the choice on, the pose model is asked for two bodies in each picture (`numPoses: 2`). With it off the model is asked for one, exactly as today.
2. **Seats** (`src/duo/assign.ts`). Every body found goes to `createSeating()`. Which body is which is decided by `assignPlayers` from `src/pose/players.ts` (PR #99): of a fresh pair, the one on the left of the picture is player one; after that each body goes to the player it moved least from, so walking past each other or the model swapping its order does not swap the players. On top of that:
   - a body with hidden shoulders, a body with shoulders under 6% of the picture (someone in the background), and one person the model found twice are dropped;
   - the second player **joins** after standing in the picture for 1 second without a break;
   - the second player has **left** after not being seen for 0.7 seconds; fewer lost frames change nothing;
   - if **player one** walks out and the other stays, after 0.4 seconds the one who stayed becomes player one. Their picture is moved and sized to where the first hero stood, so the stance measured at calibration still fits and the fight does not stop to ask anyone to step back in.
3. **Each body is read on its own** (`src/duo/split.ts`). Player two gets their own history, their own neutral stance (taken at the moment they join) and their own `createPoseInput`, the same reader a single player gets. Standing to one side does not matter: every detector measures against the body's own stance.
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
- Do not stand one behind the other. When two bodies overlap fully for more than a moment the model sees one person, and the two can come out swapped.
- Player two: walk in, stand still with arms down for a second. That is when the game takes your neutral stance.

## What the lead applies

One diff (posted on issue #179), four files:

- `src/pose/tracker.ts`: ask the model for `duoCamera.wanted()` bodies (it changes on the running model with `setOptions`), and while duo is on hand every body to `duoCamera.take`, which gives back player one's frame.
- `src/screens/Multiplayer.tsx`: `<DuoCard onStart={(link) => { props.onOpen(); props.onStart(link); }} />` in the row of cards.
- `src/render/Scene.tsx`: `<SecondFigure />` next to `<Hero>`.
- `src/App.tsx`: one effect that turns duo off when the player leaves that way of playing.

With the choice off nothing changes: the model is built with one body and the old code path returns the frame.

## What was tested

- `npx vitest run tests/duoAssign.test.ts tests/duoLink.test.ts`: 19 tests with made-up landmark frames. Seats through a crossing and through lost frames; joining and leaving; player one leaving; bodies that are dropped; two bodies giving two inputs; player two's strike reaching the real engine through the link; both striking for double damage; each defending for themself; the fight carrying on at once when player two leaves.
- With the diff applied, in a headless browser on the dev server: the Multiplayer screen shows the new card; pressing it starts the real tracker with two bodies asked for (on Chrome's fake camera, which shows nobody) with no errors; then, in a fight against Polyphemus with two made-up bodies fed to `duoCamera`, the body on the right threw the prompted strike and the monster lost 16 health; the next strike was thrown by both and took 37 with the "Together! x2" flash; the blue hero was drawn beside the bronze one; with the second body gone the blue hero went away, the fight did not pause, and player one's next strike landed.

## What was not tested

- **No real camera with two real people.** Everything above uses made-up frames. How well MediaPipe's lite model holds two real bodies side by side, at what distance, and in what light is not known.
- **The cost of two bodies was not measured.** With two bodies asked for and nobody in the picture a detect took about 11 ms in the headless browser, which says nothing about two real people. Expect the body model to run once per person, so roughly twice the time of one player; measure on the demo laptop before showing it.
- Player one's fight was played on the keyboard in the browser run (the fake camera shows no body), so calibration with two people in the picture, and the camera panel's skeleton after player two takes over as the hero (it is drawn where the first hero stood), were not seen.
- The "YOU + FRIEND" tag stays up for the rest of a fight after player two leaves: the fight was started for two.
- At a 1280 px wide window the Multiplayer row fits two cards, so the new card is on the second row; at 1600 px all three are in one row.
