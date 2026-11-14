# Devpost draft: Odyssey Fighter

First draft of the submission page. The table pitch and judge answers are in [pitch.md](pitch.md).

**How to read this draft.** It was checked against `main` at commit `de77074` (Saturday afternoon). A sentence tagged `[pending #N]` describes something that is not on `main` yet, or not yet proven; N is the issue that will settle it. Each one sits in its own sentence or bullet. Before submitting, go through every tag: if the issue is done, delete the tag; if it is not, publish the "Today" version next to it, or delete the sentence if it has none. Nothing tagged may reach the published page.

The webcam claims are tagged `[pending #7]` on purpose. The tracking and every detector are built and unit-tested, but nobody has yet won a fight with their body on the demo laptop.

## Tagline

`[pending #7]` Fight your way home to Ithaca with your own body: a browser game that tracks you through a laptop webcam and teaches you to block, dodge and strike the monsters Odysseus met.
**Today:** Fight your way home to Ithaca: a browser fight-training game that teaches you to block, dodge and strike the monsters Odysseus met.

## Inspiration

The Odyssey is a training story as much as a travel story. Odysseus does not beat Polyphemus by being stronger. He waits, reads him, and uses one prepared move: the sharpened olive stake. And when he finally fights for his own house, Athena is beside him, telling him what to do next. That is what a coach does, and it is the shape of a real fight drill: defend first, then take the opening.

We wanted a judge to stand up and do that with their own body, not press a button, and to leave knowing how to hold a guard and throw a jab.

`[pending: one line from the team on why this idea, in our own words]`

## What it does

Odyssey Fighter is a 3D fight training game that runs in a browser tab. You follow Odysseus's route home and fight the monsters he met, in the order he met them.

- `[pending #7]` **Your body is the controller.** A laptop webcam tracks you, and every block, dodge and strike is your own movement. **Today:** A laptop webcam tracks your body with a pose model that runs in the browser, and each move has a detector that is tested on made-up pose sequences. Every move also has a key.
- **Pick a fighting style.** Boxer (jab, cross, hook, uppercut), Hoplite (spear thrust, overhead strike), Karate (reverse punch, knife hand, hammer fist) or Kung Fu (double palm, chain punch, rising palm).
- **Fight in two beats.** The monster winds up and a red card names what stops it: BLOCK, DUCK, DODGE LEFT or DODGE RIGHT. Hold it until the blow lands. Then a weak spot lights up and a gold card names a strike. Hits in a row do more damage, up to 50 percent more; a missed opening resets the run.
- **Learn as you play.** The card starts as a drawing of the pose, the word and a hint. After two clean reps of a move it is only the word. After five it is only a timer.
- `[pending #11, #24]` By the end of a fight you are reading the monster, not the card: each attack has its own tell, and a faint ghost figure shows the pose to hit.
- `[pending #7]` **See yourself.** A bronze figure in the arena copies your body in 3D as you move. **Today:** the figure is drawn from the camera's 3D body points; it has not been checked against a real player yet.
- **Fight Polyphemus in his cave.** The Cyclops swings a club, grabs, and throws boulders. His weak spots are his one eye and his gut.
- **Three phases.** His fight changes at two thirds and at 30 percent health: he adds boulders in the second phase and swings with half the warning in the third.
- **End it with the stake.** At zero health he is still standing. The fight ends on one taught move: both hands together at the chest, driven forward and down.
- **Feel the hits.** The cave is lit by torches. A hit on him throws sparks; a hit on you shakes the camera and flashes the edge of the screen red. Every fight event has its own sound.
- `[pending #23]` Each strike is rated GOOD, GREAT or PERFECT on how well it was thrown, and a better strike does more damage. **Today:** the rules already scale damage by how well a strike is thrown, but only the stake thrust is measured.
- `[pending #36]` Each move says in one line what it is for in real self-defense.
- `[pending #15 wiring]` Athena coaches you by voice: she calls each defense and strike as it is needed. **Today:** her 22 lines are recorded and the playback is built and tested, but she is not yet heard in a fight (two lines in the fight screen are still to add).
- `[pending #26]` A quest map shows the route in the poem's order: the Cyclops, Circe, the Sirens, Scylla, Charybdis, then the suitors in Ithaca.
- `[pending #27]` Scylla is the second fight. (Today she exists as data and is drawn as a placeholder block.)
- `[pending #20]` Before the fight, the camera looks at you and names the Olympian you take after.
- `[pending #30]` That god grants one power: defending fills a meter and the god's gesture spends it.
- `[pending #28]` A second player can step into the frame; striking together does double damage.
- **Play with no camera.** Every move has a key. The camera and the keyboard feed the same fight at the same time, and if the camera cannot start the game says so and carries on with keys.
- **Play with no network.** Pose tracking runs in the browser from files stored with the game, and the sounds are local files.

## How we built it

- **Vite, React and TypeScript** for the app, with **three.js through @react-three/fiber** for the 3D scene, plus @react-three/drei and @react-three/postprocessing for textures, bloom and ambient occlusion. Polyphemus, his cave and the player figure are built in code from simple shapes, one file per monster and per arena behind a fixed interface. The cave's rock textures and lighting map are CC0 files from Poly Haven.
- **MediaPipe Tasks Vision** runs the pose model in the browser on each webcam frame and returns 33 body points, as positions in the picture and as 3D positions in metres from the hips. The runtime is copied and the pose model is downloaded once at setup; after that tracking needs no network.
- **Move detectors.** We mirror the points so the player's left is the screen's left and keep the last second of frames. Each move is one small file with a function over that second that returns how sure it is, from 0 to 1. A jab is the left elbow going from bent to straight at shoulder height; a dodge is the shoulders shifting sideways from the stance measured at the start of the fight. Distances are in the player's own shoulder widths.
- **A pure combat engine.** The fight rules are one function: the state, what the player is doing and the time passed go in; the new state and a list of events come out. It has no camera, graphics, clock or network in it. The keyboard and the webcam both produce the same input, which is why one can stand in for the other. Phases, the finishing move and damage that scales with strike quality are all rules in that one function.
- **Everything visible only reads.** The scene, the HUD, the hit effects and the sound take the state and the events and never change the fight.
- **Content registers itself.** Moves, styles, monsters, monster models and arenas are one file each in a folder that is scanned at build time. Adding one never means editing a shared list.
- **Tests in plain Node.** Because the engine is pure, vitest runs whole fights without a browser. One test plays 30 simulated fights against Polyphemus and fails unless they average 90 to 150 seconds. Another plays 1,000 random fights and fails if one never ends. Another fails if a monster or a style names a move that does not exist. Detectors are tested with made-up pose sequences.
- **Sound** is one clip file per fight event, generated ahead of time with the **ElevenLabs** Sound Effects API and played offline through the Web Audio API. If a clip fails to load, a sound synthesised in code plays instead. Athena's 22 lines are clips made the same way with one ElevenLabs voice, and only the clips listed in an index file are ever requested.
- `[pending #2]` An optional **Node and Express** server holds the API keys and talks to **Google Gemini** (the god scan and fights built from a sentence) and **ElevenLabs** (speech made on demand). The game starts and plays a full fight with the server off.
- **Three people, three coding agents.** Each of us ran a coding agent. We agreed the shared contracts first and wrote one issue per task listing the files it may touch. Every change, from anyone, goes through a branch and a pull request that must sit on the latest `main` and pass lint, typecheck, tests and a build. No code is copied from earlier projects.

## Challenges we ran into

- **Left and right.** The webcam picture has to be mirrored so the game feels like a mirror, and the 3D points have to be mirrored the same way, or "jab with your left" lights up the wrong arm.
- **Telling similar moves apart.** A jab, a cross, a spear thrust and the stake thrust all end with straight arms. Each detector also checks what the other arm is doing and where the hands were a moment before, and a test checks that the stake thrust is not read as a jab or the reverse.
- **Different bodies and distances.** Pixel distances change with height and with how far back the player stands, so detectors measure in shoulder widths and against the player's own resting stance.
- **Fitting one fight into a judge's three minutes.** Too short and nothing is learned; too long and the judge never sees the end. We made the length a test: 30 simulated fights must average 90 to 150 seconds, and the fastest warning in the fight must still leave a full second to react. Single fights still vary: the simulated player's wins run from 75 to 160 seconds.
- **Prompts that step back too far.** After five clean reps the card is only a timer, and our first playtest showed a player who was winning start to take hits because nothing said which move was wanted. `[pending #11, #24]` We fixed it by giving each attack its own tell and adding a ghost outline of the pose.
- **A webcam demo can fail in a bright room.** So every move has a key, and the keys stay live during a webcam fight.
- **Three agents in one repository.** Without rules they edit the same files. Folder owners, one issue per task, self-registering content and a branch for every change kept merges small.
- `[pending #7, #17: what went wrong when we first tried it on real bodies and in the judging room's light, and what we changed]`

## Accomplishments that we're proud of

- `[pending #7]` A fight you can play start to finish with only your body, in a browser tab, on a laptop webcam, with no network. **Today:** A fight whose rules are tested from the first card to the stake in every style, playable from the keyboard in a browser tab with no network; the webcam detectors for every move exist and are unit-tested on made-up pose sequences.
- The same fight, under the same rules, from the keyboard when the camera is not available.
- Rules that are tested without a browser, including the average length of the whole fight.
- Prompts that step back as the player learns, so the game is teaching and not just scoring.
- A structure where a new move, monster, style or arena is one new file.
- A fight that ends the way Book 9 does: he does not fall until the stake is driven in. `[pending #7]` Done with both hands, in front of the camera.
- `[pending #15 wiring]` Athena's voice working with the network off.

## What we learned

- Agreeing the shared contracts before anything else let three people build in parallel. Later features were added to those contracts without rewriting what was there.
- Keeping the rules pure paid for itself twice: the keyboard fallback cost almost nothing, and the fight could be tested as a whole.
- One deep fight is safer in front of a judge than six shallow ones. The route keeps the journey; the polish goes into Polyphemus.
- Test the thing the judge will feel, such as how long the fight lasts, and not only whether single rules are correct.
- A playtest finds what unit tests do not: ours found the vanishing prompt card and a Caps Lock bug in the keyboard fallback.
- `[pending #7, #17: what tuning detectors on three different bodies taught us]`

## What's next

- The rest of the route: Circe, the Sirens, Scylla, Charybdis and the suitors in Ithaca, each with its own finishing move.
- Kicks and knees, and a Pankration style.
- Two players on one camera, and rooms so a friend can join from another laptop.
- Fights built from a sentence: describe how you fight and Gemini builds the fight.
- A replay and a god card to take away.
- Difficulty that adapts to the player, and rigged 3D models in place of the ones built in code.

## Built with

- TypeScript
- React
- Vite
- three.js
- @react-three/fiber
- @react-three/drei
- @react-three/postprocessing
- MediaPipe Tasks Vision (pose landmarker)
- Web Audio API
- ElevenLabs (sound effects and Athena's voice clips)
- Poly Haven (CC0 textures and lighting map)
- Vitest
- ESLint with typescript-eslint
- `[pending #2]` Node.js
- `[pending #2]` Express
- `[pending #20]` Google Gemini API

## Still to add before submitting

All `[pending #21]`:

- Demo video and the backup recording of a full fight.
- Screenshots: title, style select, a defend card, a strike card, the stake card, the win screen.
- Repository link and the three team members.
- Play one keyboard fight to the stake and the win screen in the browser and log it in [playtest.md](playtest.md). The logged run predates the stake and did not reach a win.
- Re-verify every webcam claim after `#7` and `#17` close: the tagline, "Your body is the controller", "See yourself", and the first and sixth accomplishments.
- Re-read the two test numbers (30 simulated fights, 1,000 random fights) and the list of styles against `main`.
- `[pending #15 wiring]` is not an ordinary issue tag: issue `#15` is closed, and the tag clears when Athena is heard in a fight.
- One pass to remove every `[pending]` tag as described at the top.
