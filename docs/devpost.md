# Devpost draft: Odyssey Fighter

First draft of the submission page. The table pitch and judge answers are in [pitch.md](pitch.md).

**How to read this draft.** It was checked against `main` at commit `de77074` (Saturday afternoon). A sentence tagged `[pending #N]` describes something that is not on `main` yet, or not yet proven; N is the issue that will settle it. Each one sits in its own sentence or bullet. Before submitting, go through every tag: if the issue is done, delete the tag; if it is not, publish the "Today" version next to it, or delete the sentence if it has none. Nothing tagged may reach the published page.

The ElevenLabs and Gemini parts were checked again against `main` at commit `fd14780` and use two more tags. `[if wired]` means the code is on `main` but no game screen calls it yet, so a player does not see or hear it. `[if built]` means it is not on `main` at all. Treat both like `[pending]`: publish the sentence only once it is true.

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
- **Athena coaches you by voice.** She calls each defense and each strike as it is needed, praises a hit, warns after one, and announces the phases and the result. Her lines are clips stored with the game.
- `[pending #26]` A quest map shows the route in the poem's order: the Cyclops, Circe, the Sirens, Scylla, Charybdis, then the suitors in Ithaca.
- `[pending #27]` Scylla is the second fight. (Today she exists as data and is drawn as a placeholder block.)
- `[if wired]` Before the fight, the camera looks at you and names the Olympian you take after. **Today:** the god scan is on `main` and runs on a test page, but the game does not open it.
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
- **Sound** is one clip file per fight event, 11 in all, generated ahead of time with the **ElevenLabs** sound generation API and played offline through the Web Audio API. Eight of the 11 events also have a sound synthesised in code, which plays if the clip fails to load. Athena's 37 lines are clips made ahead of time with ElevenLabs text to speech, and only the clips listed in an index file are ever requested. See "How we used ElevenLabs".
- An optional **Node and Express** server in `server/` holds the API keys and talks to **Google Gemini** (the god scan and a fight described from a sentence) and **ElevenLabs** (speech made on demand). The game starts and plays a full fight with the server off. No game screen calls the server yet. See "How we used Gemini".
- **Three people, three coding agents.** Each of us ran a coding agent. We agreed the shared contracts first and wrote one issue per task listing the files it may touch. Every change, from anyone, goes through a branch and a pull request that must sit on the latest `main` and pass lint, typecheck, tests and a build. No code is copied from earlier projects.

## How we used ElevenLabs

Checked against `main` at `fd14780`. Every count below was read from the file named beside it.

**What it does in the game**

- **Sound effects, heard in every fight.** One clip for each of the engine's 11 fight events: `telegraph`, `defended`, `playerHit`, `opening`, `enemyHit`, `whiffed`, `phaseChanged`, `finished`, `powerUnleashed`, `won` and `lost`. The clips are `public/audio/sfx/<event>.mp3`, listed in `public/audio/sfx/index.json`. `src/audio/sfx.ts` plays them, and `src/screens/FightScreen.tsx` calls it for every event.
- **Athena the coach, heard in every fight.** 37 lines in `src/audio/athenaLines.ts`, one clip each in `public/audio/athena/`: 26 move calls, 3 lines of praise, 3 warnings, 2 phase lines, a fight start, a win and a loss. `src/audio/voice.ts` picks the line from the fight's events and plays one line at a time; `src/screens/FightScreen.tsx` calls it every frame. On `main` she calls the defense when an attack winds up, calls the strike when a weak spot opens, calls the stake, praises a hit, warns after one, and announces a phase change, the win and the loss.
- The front kick and the knee have no line of their own, so for those she says "Strike now!".
- Eight of the 37 lines are recorded but nothing on `main` asks for them: `fight_start`, `call_jump` and the six god-power calls.
- **Homer and Polyphemus, in the repo, `[if wired]`.** Eight more clips sit in the same folder and index: four lines for Homer as narrator (title, before Polyphemus, win, loss) and Polyphemus's four taunts. The script is `src/audio/storyLines.ts`. `speakLine` and `speakTaunt` in `src/audio/voice.ts` play them, but no screen calls either, so a player does not hear them.
- **Speech made live, in the repo, `[if wired]`.** `POST /api/speech` in `server/routes/speech.ts` turns a line of text into speech in an Athena, Homer or monster voice, and saves each line under `server/data/speech/` so it is made once. `src/audio/narration.ts` is the browser side. It is for lines that cannot be recorded ahead of time, such as the narration of a fight Gemini wrote. Nothing on `main` calls it.
- `[if built]` Music and ambience (issue `#85`), and narration for each stop with taunts for the other monsters (issue `#86`), are not on `main`.

**When the calls happen**

- **Ahead of time.** `server/tools/genClips.ts` made the 11 effects and Athena's 37 lines. It uses three ElevenLabs endpoints through `server/ai/elevenlabs.ts`: `POST /v1/sound-generation` with model `eleven_text_to_sound_v3` (the prompt and length for each event are in the script), `POST /v1/text-to-speech/<voice id>` trying model `eleven_v4` first and `eleven_multilingual_v2` second, and `GET /v2/voices` to find a voice the key may use (the names tried are in `server/ai/voices.ts`). The repo does not record which of the two speech models, or which voice, made the committed clips. The eight Homer and Polyphemus clips came in with PR `#90`, which says they were recorded once with ElevenLabs; `genClips.ts` has no command for them.
- **Live.** Only `POST /api/speech`, with model `eleven_flash_v2_5`, and only once something calls it.
- **During a fight on `main`:** no ElevenLabs call. The sound code only fetches files under `/audio/`.

**With no network or no key**

- The clips are files served with the game. Playing them needs no key and no server.
- If a sound effect's clip fails to load, `src/audio/sfxSynth.ts` has a sound synthesised in code for 8 of the 11 events. `phaseChanged`, `finished` and `powerUnleashed` have none and stay silent.
- Athena only requests clips listed in `public/audio/athena/index.json`. With a clip or the index missing she is silent for that line and the fight carries on. A call whose clip is missing is replaced by "Defend yourself!" or "Strike now!".
- Live speech: with no key the server answers 503 unless that line was saved earlier. With no server the browser side plays nothing and does not throw.

**Tests:** `tests/sfx.test.ts`, `tests/voice.test.ts`, `tests/athenaLines.test.ts`, `tests/storyLines.test.ts`, `tests/ai/narration.test.ts`, `server/tests/speech.test.ts`. They use fakes and need no key.

**Not checked:** nobody has logged listening to a full fight in a browser. No test compares the scripts with the clip folder; at this commit the 45 ids in the two scripts, the 45 ids in the index and the 45 clip files agree.

## How we used Gemini

Checked against `main` at `fd14780`.

**What it does in the game**

- **The god scan, in the repo, `[if wired]`.** One still picture from the webcam goes to Gemini, which picks one of six Olympians (Zeus, Poseidon, Athena, Hermes, Artemis or Apollo) and writes an epithet, one sentence saying why, and a rival god. A second Gemini call repaints the same picture as a marble bust or a vase painting of the player. The screen is `src/ai/ui/RevealScreen.tsx`. On `main` it is only mounted on the test page `src/ai/lab/index.html`, which runs under the dev server and is not linked from the game. The game's own flow in `src/App.tsx` does not open it, so a player does not see it.
- **A fight from a sentence: the level is in the repo, the fight is `[if built]`.** `POST /api/level` in `server/routes/level.ts` sends Gemini the player's phrase, god and rival, and gets back a level: a title, an arena, a monster, 6 to 12 attacks, a tempo, 2 to 4 phases, 4 to 8 taunts and narration in Homer's voice (the limits are in `src/ai/contracts.ts`). `src/ai/repair.ts` pulls every number into range and fills gaps. On `main` the test page prints that level as text. Turning it into a fight the engine runs, and the "How do you fight?" screen, are PRs `#78` and `#92`, not merged.

**When the calls happen**

All of them are live, at the moment the player asks. Nothing from Gemini is made ahead of time or stored with the game. Every call goes through `server/ai/gemini.ts`: the `@google/genai` SDK, the Interactions API (`client.interactions.create`), API version `v1beta`, `store: false`, and no SDK retries.

- **Choosing the god and writing a level:** text in (plus the one picture for the god), JSON bound to a schema out. Model `gemini-3.5-flash-lite`; `gemini-3.1-flash-lite` is tried once if the first fails.
- **Painting the portrait:** picture in, picture out. Model `gemini-3.1-flash-lite-image`, then `gemini-nano-banana-2.1` if the first fails.
- The prompts are in `server/revealPrompts.ts` and `server/prompts.ts`.
- The key is read from `.env` by the server (`server/env.ts`) and is not sent to the browser. The routes that call Gemini answer only requests from the same machine (`server/lib/localOnly.ts`).

**With no network or no key**

- **God scan.** With no key the server answers 503 at once. With no server, or a slow, failed or unusable answer, the browser picks the god itself in `src/ai/gods/offlineReveal.ts`: from the stance (9 stances in `src/ai/gods/stance.ts`), then from the clothing colour (7 colour families in `src/ai/gods/tint.ts`), then by lot.
- **Portrait.** If Gemini's portrait does not arrive, the browser draws its own from the snapshot: a marble bust in a gold ring with a laurel wreath (`src/ai/gods/marble.ts`, `src/ai/gods/portrait.ts`).
- **Level.** `/api/level` always answers with a valid level. With no key, or on any error, timeout or unusable answer, it returns one of 5 handcrafted levels in `src/ai/fallbacks.ts`, marked `source: "fallback"`. The level is picked by keywords in the phrase, or by a hash of the phrase when no keyword matches. With no server at all, `src/ai/client.ts` picks the same fallback in the browser.

**Privacy of the god scan, as the code does it**

- **What is sent.** One JPEG, at most 640 pixels wide, taken after a three-second countdown and only after the player presses "Reveal my god". The request holds that picture and nothing else. It goes to our server on the same laptop (`POST /api/reveal` in `server/routes/reveal.ts`). The server sends it to Gemini to choose the god and, if that worked, once more to paint the portrait. When a model fails, the same picture goes to the second model named above. No video is sent.
- **What is not sent.** With no camera, or when the player presses "Cast the lot instead (no picture)", no picture is taken and no request is made. With the server off, the picture does not leave the laptop. With the server on but no Gemini key, it reaches our server and goes no further.
- **What is kept.** Our server holds the snapshot in memory for that request. It does not write it to disk and does not log it; long base64 runs are cut out of error messages before they are logged. The Gemini calls set `store: false`, which asks Gemini not to keep the request as a stored interaction. We have not checked what Google keeps beyond that setting. The painted portrait stays in the server's memory, at most 20 at a time, each forgotten after two minutes (`server/lib/portraits.ts`), and is served with `Cache-Control: no-store`.
- **What is judged.** The prompt tells Gemini to judge only the expression, the stance, the colours of the clothing and the energy of the pose. It tells it never to mention or use body shape, size, age, gender, skin, hair, face or attractiveness, and not to identify the person. The server then checks the answer: an epithet or reason with a word about body, age, looks or gender (the list is in `server/revealGuard.ts`) is replaced by a fixed line for that god. The offline scan reads only the stance and the clothing colour.
- **The portrait is a likeness, not a judgment.** Its prompt asks the image model to keep the player's face, hair, expression and pose so they stay recognisable as a statue.
- **What the screen tells the player** (`src/ai/ui/RevealScreen.tsx`): "One picture is taken and sent to Google Gemini to choose your god. It is not saved. With no network, the choice is made on this laptop." That text does not mention the portrait call.

**Tests:** `server/tests/reveal.test.ts`, `server/tests/app.test.ts`, `tests/ai/reveal.test.ts`, `tests/ai/revealGod.test.ts`, `tests/ai/gods.test.ts`, `tests/ai/marble.test.ts`, `tests/ai/level.test.ts`. They use a fake model and need no key.

**Not checked:** no live Gemini call was made for this page. The model names are as written in `server/ai/gemini.ts`.

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
- Athena coaching by voice in a fight from clips stored with the game, so she needs no network.

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
- `[if built]` Fights built from a sentence: describe how you fight and Gemini builds the fight. **Today:** the Gemini call that writes the level and five handcrafted fallback levels are on `main`; the fight itself and its screen are PRs `#78` and `#92`, not merged.
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
- ElevenLabs (sound effects, Athena's voice clips, Homer's and Polyphemus's clips)
- Poly Haven (CC0 textures and lighting map)
- Vitest
- ESLint with typescript-eslint
- Node.js and Express (the optional server)
- `[if wired]` Google Gemini API (Interactions API through the `@google/genai` SDK). On `main` only the test page reaches it.

## Still to add before submitting

All `[pending #21]`:

- Demo video and the backup recording of a full fight.
- Screenshots: title, style select, a defend card, a strike card, the stake card, the win screen.
- Repository link and the three team members.
- Play one keyboard fight to the stake and the win screen in the browser and log it in [playtest.md](playtest.md). The logged run predates the stake and did not reach a win.
- Re-verify every webcam claim after `#7` and `#17` close: the tagline, "Your body is the controller", "See yourself", and the first and sixth accomplishments.
- Re-read the two test numbers (30 simulated fights, 1,000 random fights) and the list of styles against `main`.
- Play one fight with the sound on and log in [playtest.md](playtest.md) that the effects and Athena are heard. Both are called from the fight screen on `main`, but no logged run mentions sound.
- Go through every `[if wired]` and `[if built]` tag in the two sponsor sections the same way as the `[pending]` tags, and count the clips and lines again if `public/audio/` changed.
- One pass to remove every `[pending]` tag as described at the top.
