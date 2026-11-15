# Features: what is real

Issue #163. Every feature, one line each, with its status on `main` as of Saturday 9:30 PM. Each status was checked against the code (is the file imported, directly or through others, by `src/App.tsx`?) and against the PR and issue lists, not copied from other docs.

- **in the game**: a player reaches it in the game on `main`. It means the code is connected to a screen. It does not mean it was tried on a real body or on the demo laptop; see "Not done" at the end.
- **built, not mounted**: the code and its tests are merged, but no screen uses it. The line says what is missing.
- **open PR**: not merged.
- **planned**: an open issue, no finished code.
- **dev tool**: a script or page for us, not part of the game.

## The fight

- **in the game** Two-beat fight: the monster winds up and you defend, then a weak spot opens and you strike. Combo and score.
- **in the game** Damage scales with how well the strike is thrown, shown as GOOD, GREAT or PERFECT.
- **in the game** Monster phases, with a 3 second pause after each change so the coach's line is heard.
- **in the game** A finishing move ends each fight (Polyphemus: the stake, key T).
- **in the game** Divine power: defends fill a meter, a god gesture spends it. The game has no god scan now, so the power in every fight is Athena's.
- **in the game** Every move has a key, so a whole fight plays with no camera, no network and no server.
- **in the game** Pause menu in the fight.
- **in the game** Balance: tuned so a first-time player wins the first fight and has a chance at the later ones. Checked with a simulated player, not with people.
- **built, not mounted** Difficulty that adapts during the quest (`src/ai/director.ts`). Nothing in the game calls it. The only tuning a player gets is from the optional warm-up.
- **open PR** Lenient defends: rough or waist-up blocks, ducks and dodges count (PR #242).

## Moves and styles

- **in the game** 26 moves, one file each: block, duck, two dodges, punches and palm strikes, spear and overhead strikes, front kick and knee, jump, six god gestures, the stake thrust.
- **in the game** Five fighting styles to pick from: Boxer, Jiu-jitsu, Karate, Kung Fu, Taekwondo.
- **in the game** One prompt card that names the move and its key, and shrinks as you learn the move.
- **in the game** Each move says what it is for in real self-defense.
- **in the game** Gold ghost figure of the move to make, off by default (the lead chose off). `?ghost=1` turns it on.
- **open PR** Ghost check: copying the ghost exactly would count for only 9 of 26 moves today (PR #227, tests and a doc).
- **open PR** Move guide: an animated figure of the move on the prompt card with a live checklist of what the detector sees (PR #246).
- **built, not mounted** The figure from myth for each style (`src/styles/heroes.ts`, PR #77). The style menu does not show it.
- **built, not mounted** Five characters to choose from: Odysseus, Poseidon, Zeus, Athena, Achilles (`src/characters/`, PR #241). Seen only on a demo page (`tools/characters/`); no screen offers the picker and the fight always shows the spartan.
- **planned** Player figure dressed for the chosen style (#18).

## Tracking and camera

- **in the game** Webcam pose tracking in the browser (MediaPipe, model shipped with the game). One camera for the whole session.
- **in the game** Calibration before a fight, and a "step back" pause when you leave the frame. A camera failure is shown; the game never drops to the keyboard without saying so.
- **in the game** A player seen only from the waist up can calibrate and fight (shoulders are enough).
- **built, not mounted** Waist-up move swapping: never ask for a kick the camera cannot see (`src/moves/waistUp.ts`, PR #243, issue #239). The fight does not call it yet, so a waist-up player is still asked for kicks.
- **in the game** Live camera panel on the fight screen with your tracked skeleton drawn on it.
- **in the game** The spartan hero follows your body in real time, seen from behind in a third-person battle view.
- **in the game** Detectors written to hold for any body size, distance and a 30 degree turn. Tested on made-up poses only: no trace recorded from a real body is in the repo yet.
- **in the game** Graphics drop to low quality when frames run slow with the camera on.
- **built, not mounted** Two players on one camera (issue #28): telling which body is which (`src/pose/players.ts`, PR #99), and the rest of it in `src/duo/`: seats, a move reader for each body, the link that makes the second body the fight's second player, the second hero and the Multiplayer card. Four small changes in lead files mount it ([docs/duo.md](duo.md)). Never tried with two real people on a real camera.
- **planned** Detector tuning on real bodies, and one full webcam fight on the demo laptop (#17, #7).

## Enemies and stops

- **in the game** Six quest stops in Odyssey order, each with its own monster, arena and sound: Polyphemus, Circe, the Sirens, Scylla, Charybdis, the Suitors.
- **in the game** Quest map: each fight you win opens the next. `?stop=<id>` jumps to a stop.
- **in the game** An intro line, a win line and a loss line per enemy, and a story ending per stop on the result screen.
- **in the game** The real situation each monster attack stands for, shown with the defend prompt.
- **in the game** Alternate looks behind URL flags: `?model=` for Polyphemus, `?look=` for Charybdis.

## Coaching, warm-up and practice

- **in the game** Optional 15 second warm-up before a fight (camera only). It scores the moves you make and tunes that monster to you.
- **in the game** "What you practised" on the result screen: the moves you got right and what each teaches.
- **built, not mounted** A fuller lesson list from the fight's events: defences held, longest clean run (`src/lessons/lessons.ts`, PR #173). The result screen uses the shorter list above.
- **built, not mounted** Practice mode, the pure parts: one move ten times, a tip for the weakest part, a summary (`src/coach/practice.ts`, PR #189). There is no practice screen and no menu entry.
- **planned** Training mode as a screen (#172, from #161), after the freeze.

## God scan and AI

- **built, not mounted** God scan: a webcam snapshot goes to Gemini through our server and comes back as your Olympian with one power. It was taken out of the game (PR #392). The server route (`POST /api/reveal`) and the screen (`src/ai/ui/RevealScreen.tsx`) remain; only the developer page (`src/ai/lab/`) opens it.
- **in the game** The AI server is optional. Every route has a fallback and a time limit, so the game plays with it off.
- **built, not on the menu** AI-made fights: `?ai=1` opens "How do you fight?" (the main menu's "Ask the Muse" button was taken out on 15 November). Type or say a sentence and Gemini writes a fight the engine runs (`POST /api/level`, `src/ai/adapt.ts`, `src/ai/ui/museDoor.tsx`, `src/ai/ui/StyleScreen.tsx`; PR #43, #78, #92, #307, #409). With no key or a slow answer it is one of five bundled fights. Not checked: camera play inside it, and a Muse fight played through to its ending.

## Voice and sound

- **in the game** Athena as voice coach: a call for every move and a line for each phase.
- **in the game** Homer's narration before a stop and on the result screen, and each monster's taunts.
- **in the game** Music, hit and move effects, and ambience for each stop.
- **in the game** All clips were made ahead of time (ElevenLabs) and ship with the game, so sound works offline.
- **in the game** Music, effects and voice volume in settings.
- **planned** One audio context for the session and nothing left playing after a fight (#238).

## Rooms and replay

- **in the game** Online rooms: host a fight, a friend joins by code or QR code and plays with a camera, keys or touch buttons on a phone. Strikes thrown together do double damage. Needs our server running as the relay.
- **dev tool** Rooms over the internet: an https tunnel (`make tunnel`), relay limits, and polling when the stream does not get through (PR #199, #201, #209).
- **planned** Rooms fixes still open: a guest who drops and rejoins mid-fight (#222, the network half is merged in PR #233) and time limits on every room request (#226, part merged in PR #244).
- **built, not mounted** Replay recorder and god card image (`src/replay/`, PR #62), with the upload, phone page and QR code on the server (PR #65). No screen records or shows them.
- **open PR** God card and share panel for the result screen (PR #109, draft).

## Look and interface

- **in the game** Pebble mosaic interface on every menu screen: title, style select, quest map, intro, calibration, rooms, pause, settings, result.
- **in the game** Star-chart HUD on the fight screen: health bars, score, power, phase line, prompt card.
- **in the game** Stylized low-poly 3D arenas and monsters, with hit shake, flashes and sparks.
- **in the game** Settings kept between visits: graphics quality, three volumes, mirror the camera, show key hints.

## Tools and tests

- **dev tool** `make check`: lint and the test suite, with no server and no keys.
- **dev tool** Engine rule tests on random fights, a detector test and a close miss for each move, and a balance simulation of every stop.
- **dev tool** Tables that guard the detectors: cross-fire between all 26 moves, which moves count waist up, and how close each trace was.
- **dev tool** Pose recorder page (`tools/recorder/`): record a real body, replay it in tests.
- **dev tool** Headless browser runs: every stop by keyboard, a room with a host and a phone-sized guest, a fake-camera fight, and the built game with the network blocked.
- **dev tool** Frame rate check for every stop and quality level (`make fps`), measured headless, not yet on the demo laptop.
- **dev tool** Licence report (`make credits`) and a `CREDITS.md` row for every shipped asset.
- **dev tool** Key scan of the built game, demo preflight (`npm run preflight`) and a failure drill for the AI server.
- **dev tool** Voice clip checks: loudness of every clip, and speech to text on what each clip says.
- **planned** Smoke run for all five styles in Chrome and Edge on Windows (#193); licence check of the assets added tonight (#195).
- **planned** Devpost page, demo video and backup recording (#130, #21, on hold by the lead).

## Not done

- No full webcam fight on a real body on the demo laptop yet (#7). Tracking and the body-following hero have only run on made-up frames and a fake camera in our tests.
- Detectors are not tuned on the three of us (#17). The numbers are first guesses backed by tests.
- A waist-up player is still asked for kicks: the swap code is merged but the fight does not call it (#239).
- Nine things are merged but unreachable by a player: adaptive difficulty, the style figures, the character picker, waist-up swapping, two players on one camera, the fuller lesson list, practice mode, the god scan, and the replay and god card. Each needs a line in a screen that only the lead's agent edits.
- Frame rate is measured headless only, not on the demo laptop.
- Rooms have not been shown to work between two real machines over the internet in anything this doc could check.
- No Devpost page, demo video or backup recording yet.
