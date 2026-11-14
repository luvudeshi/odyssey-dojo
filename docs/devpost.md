# Devpost draft: Odyssey Fighter

First draft of the submission page. The table pitch and judge answers are in [pitch.md](pitch.md).

**How to read this draft.** It was checked against `main` at commit `9e95d61` (Saturday afternoon). A sentence tagged `[pending #N]` describes something that is not on `main` yet; N is the issue that will add it. Each pending feature sits in its own sentence or bullet. Before submitting, go through every tag: if the feature landed, delete the tag; if it did not, delete the sentence. Nothing tagged may reach the published page.

## Tagline

Fight your way home to Ithaca with your own body: a browser game that tracks you through a laptop webcam and teaches you to block, dodge and strike the monsters Odysseus met.

## Inspiration

The Odyssey is a training story as much as a travel story. Odysseus does not beat Polyphemus by being stronger. He waits, reads him, and uses one prepared move: the sharpened olive stake. Athena is beside him the whole way, telling him what to do next. That is what a coach does, and it is the shape of a real fight drill: defend first, then take the opening.

We wanted a judge to stand up and do that with their own body, not press a button, and to leave knowing how to hold a guard and throw a jab.

`[pending: one line from the team on why this idea, in our own words]`

## What it does

Odyssey Fighter is a full-body 3D fight training game that runs in a browser tab. A laptop webcam tracks your body. You follow Odysseus's route home and fight the monsters he met, in the order he met them.

- **Pick a fighting style.** Boxer (jab, cross, hook) or Hoplite (spear thrust, overhead strike).
- **Fight in two beats.** The monster winds up and a red card names what stops it: BLOCK, DUCK, DODGE LEFT or DODGE RIGHT. Hold it until the blow lands. Then a weak spot lights up and a gold card names a strike. Hits in a row do more damage, up to 50 percent more; a missed opening resets the run.
- **Learn as you play.** The card starts as a drawing of the pose, the word and a hint. After two clean reps of a move it is only the word. After five it is only a timer. By the end of a fight you are reading the monster, not the card.
- **See yourself.** A bronze figure in the arena copies your body in 3D as you move.
- **Fight Polyphemus.** The Cyclops swings a club, grabs, and throws boulders. His weak spots are his one eye and his gut.
- `[pending #5]` His fight has three phases: The Cave, The Club and Blinded. He adds boulders in the second and swings faster in the third.
- `[pending #6]` His fight ends on one taught move: both hands together at the chest, driven forward and down. That is the stake.
- `[pending #23]` Each strike is rated GOOD, GREAT or PERFECT on how well it was thrown, and a better strike does more damage.
- `[pending #24]` A faint ghost figure shows the pose to hit.
- `[pending #36]` Each move says in one line what it is for in real self-defense.
- `[pending #14, #15]` Athena coaches you by voice and names the move you missed.
- `[pending #26]` A quest map shows the route in the poem's order: the Cyclops, Circe, the Sirens, Scylla, Charybdis, then the suitors in Ithaca.
- `[pending #27]` Scylla is the second fight. (Today she exists as data and is drawn as a placeholder block.)
- `[pending #20]` Before the fight, the camera looks at you and names the Olympian you take after.
- `[pending #30]` That god grants one power: defending fills a meter and the god's gesture spends it.
- `[pending #28]` A second player can step into the frame; striking together does double damage.
- **Play with no camera.** Every move has a key. The camera and the keyboard feed the same fight at the same time, and if the camera cannot start the game says so and carries on with keys.
- **Play with no network.** Pose tracking runs in the browser from files stored with the game.

## How we built it

- **Vite, React and TypeScript** for the app, with **three.js through @react-three/fiber** for the 3D scene. Polyphemus and the player figure are built in code from simple shapes, one file per monster behind a fixed interface.
- **MediaPipe Tasks Vision** runs the pose model in the browser on each webcam frame and returns 33 body points, as positions in the picture and as 3D positions in metres from the hips. The model files are copied into the project at setup, so tracking needs no network.
- **Move detectors.** We mirror the points so the player's left is the screen's left and keep the last second of frames. Each move is one small file with a function over that second that returns how sure it is, from 0 to 1. A jab is the left elbow going from bent to straight at shoulder height; a dodge is the shoulders shifting sideways from the stance measured at the start of the fight. Distances are in the player's own shoulder widths.
- **A pure combat engine.** The fight rules are one function: the state, what the player is doing and the time passed go in; the new state and a list of events come out. It has no camera, graphics, clock or network in it. The keyboard and the webcam both produce the same input, which is why one can stand in for the other.
- **Everything visible only reads.** The scene, the HUD and the sound take the state and the events and never change the fight.
- **Content registers itself.** Moves, styles, monsters and monster models are one file each in a folder that is scanned at build time. Adding one never means editing a shared list.
- **Tests in plain Node.** Because the engine is pure, vitest runs whole fights without a browser. One test plays 30 simulated fights against Polyphemus and fails unless they average 90 to 150 seconds. Another fails if a monster or a style names a move that does not exist. Detectors are tested with made-up pose sequences.
- **Sound** today is one synthesized tone per fight event through the Web Audio API, so there is feedback with no audio files.
- `[pending #2]` An optional **Node and Express** server holds the API keys and talks to **Google Gemini** (the god scan and fights built from a sentence) and **ElevenLabs** (Athena's voice, narration and sound). The game starts and plays a full fight with the server off.
- **Three people, three coding agents.** Each of us ran a coding agent. We agreed the shared contracts first, wrote one issue per task listing the files it may touch, and let small changes inside a person's own folders land directly while anything shared went through a pull request. No code is copied from earlier projects.

## Challenges we ran into

- **Left and right.** The webcam picture has to be mirrored so the game feels like a mirror, and the 3D points have to be mirrored the same way, or "jab with your left" lights up the wrong arm.
- **Telling similar moves apart.** A jab, a cross, a spear thrust and the stake thrust all end with straight arms. Each detector also checks what the other arm is doing and where the hands were a moment before, and a test checks that the stake thrust is not read as a jab or the reverse.
- **Different bodies and distances.** Pixel distances change with height and with how far back the player stands, so detectors measure in shoulder widths and against the player's own resting stance.
- **Fitting one fight into a judge's three minutes.** Too short and nothing is learned; too long and the judge never sees the end. We made the length a test: 30 simulated fights must average 90 to 150 seconds, and the fastest warning in the fight must still leave a full second to react.
- **A webcam demo can fail in a bright room.** So every move has a key, and the keys stay live during a webcam fight.
- **Three agents in one repository.** Without rules they edit the same files. Folder owners, one issue per task and self-registering content kept merges small.
- `[pending #7, #17: what went wrong when we first tried it on real bodies and in the judging room's light, and what we changed]`

## Accomplishments that we're proud of

- A fight you can play start to finish with only your body, in a browser tab, on a laptop webcam, with no network.
- The same fight, under the same rules, from the keyboard when the camera is not available.
- Rules that are tested without a browser, including the length of the whole fight.
- Prompts that step back as the player learns, so the game is teaching and not just scoring.
- A structure where a new move, monster or style is one new file.
- `[pending #6]` A finishing move that is the scene from Book 9, done with both hands.
- `[pending #14, #15]` Athena's voice working with the network off.

## What we learned

- Agreeing the shared contracts before anything else let three people build in parallel. Later features were added to those contracts without rewriting what was there.
- Keeping the rules pure paid for itself twice: the keyboard fallback cost almost nothing, and the fight could be tested as a whole.
- One deep fight is safer in front of a judge than six shallow ones. The route keeps the journey; the polish goes into Polyphemus.
- Test the thing the judge will feel, such as how long the fight lasts, and not only whether single rules are correct.
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
- MediaPipe Tasks Vision (pose landmarker)
- Web Audio API
- Vitest
- ESLint with typescript-eslint
- `[pending #2]` Node.js
- `[pending #2]` Express
- `[pending #20]` Google Gemini API
- `[pending #14]` ElevenLabs

## Still to add before submitting

All `[pending #21]`:

- Demo video and the backup recording of a full fight.
- Screenshots: title, style select, a defend card, a strike card, the win screen.
- Repository link and the three team members.
- One pass to remove every `[pending]` tag as described at the top.
