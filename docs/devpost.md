# Devpost page: Odyssey Fighter

## Before you submit (not part of the page)

The page starts under the first horizontal rule and ends at "For the table". Paste that part into Devpost. This block and the "For the table" part stay in the repo. The spoken pitch is in [pitch.md](pitch.md); it was last checked at an older commit, so where the two differ this file is the newer one.

**Checked against** `main` at commit `532abb2` (the merge of PR #78), Saturday 14 November 2026, 6:05 PM. The first pass was made at `7b563c8`. Fifteen pull requests merged while it was being written, so every section was checked again at `532abb2`.

- A feature is written as present only if a player reaches it from `src/App.tsx` or `src/screens/`. Code that is on `main` but that no screen opens is under "What's next".
- Every number was counted from a file or a command at that commit. The commands are in the description of the pull request for issue #130.
- No browser was opened and no webcam was used to write this. No live call to Gemini or ElevenLabs was made.

**Three tags. None of them may reach Devpost.**

- `[confirm N]`: nobody has checked this. Row N of the table below says what to check and how. If it holds, delete the tag. If not, use the replacement in the last column.
- `[if merged: #N]`: true only once pull request N is on `main`. It covers the one sentence after it, or the whole bullet, paragraph or table row when it stands at the start of one. If the pull request is merged, delete the tag and keep the text. If not, delete the text.
- `[screenshot: ...]`: a picture the lead's agent adds on Sunday morning.

### Every [confirm]

| # | Where it is used | What nobody has checked | How to check it | If it does not hold |
|---|---|---|---|---|
| 1 | Tagline. "What it does", first paragraph. "Accomplishments", first bullet. Question 5. | That a person can win the Polyphemus fight with only their body. The tracking, the calibration and one detector per move are on `main` and are tested on made-up pose sequences. `docs/webcam-smoke.md` logs a run on a fake camera fed from a video, which is not a real body. Issue #7 (a real body) is open, and `docs/playtest.md` has no webcam run. | On the demo laptop: `make dev`, "Fight with your body (webcam)", Boxer, stop 1. Win with both hands off the keyboard. Log the run in `docs/playtest.md`, section D. | Tagline: "Fight your way home to Ithaca: a browser fight training game that teaches you to block, dodge and strike, starting with the Cyclops." First paragraph: delete the tagged sentence. Accomplishment: delete the bullet. Keep the line in question 5; delete that line only once the fight has been won with a body. |
| 2 | "Challenges", the bullet on different bodies. "What we learned", last bullet. Question 4, last sentence. | That the detectors work on three different people and in the judging room's light. Issue #17 is open. | Each of the three of us plays one webcam fight in the room. Write down every move that had to be repeated. Then write the two bracketed lines, and change the last sentence of question 4 to say what was tuned. | Delete the two bracketed lines. Keep the last sentence of question 4 as it is. |
| 3 | "What it does", the Athena bullet. "Accomplishments", last bullet. The ElevenLabs paragraph. Walkthrough. | That the effects and Athena are heard. The fight screen calls both, and tests cover which line is chosen. Nobody has logged listening to a fight. | Play one fight with the volume up. Listen for a call on the first defend card, a sound on each hit, and "He takes his club!" at the second phase. | Fix the sound first. If it cannot be fixed, delete the Athena bullet, the last accomplishment and the Athena sentence in the walkthrough. |
| 4 | "Accomplishments", second bullet. Walkthrough, "Keyboard fallback". Question 5. | That a keyboard fight runs in a browser from the title to the result screen at the commit we submit. `make check` passes, but it opens no browser. The Caps Lock line in question 5 was read from `src/input/keyboard.ts`, not tried. | `make dev`, "Keyboard only", Boxer, stop 1, win, read the result screen. Then turn Caps Lock on in a new fight and press J on a jab card. | A broken keyboard fight is a bug to fix before submitting. If Caps Lock works, delete that line from question 5. |
| 5 | Walkthrough, the Clock column and the mark on the floor. | The clock times. Before the fight they are guesses for the clicks, the camera prompt and the model load. In the fight they come from the simulated players in `tests/balance/simulate.ts`, not from a person. The standing distance was not measured. | Run the walkthrough once with a stopwatch and someone who has not played. Mark the floor where the calibration screen shows no hint. | Write the measured times into the Clock column. |
| 6 | "What it does", the no-network bullet. Questions 1 and 2. | That nothing leaves the laptop during a fight on the demo laptop. Read from the code: `src/` has no outside address, and every file loads from a local path. `docs/webcam-smoke.md` logs a headless run that played the same with every outside request blocked. It also logs one request that the MediaPipe library tries to send to a Google address (`odml.pa.googleapis.com`) when the laptop is online. Nobody has looked at what that request holds. The pose model file is not in git; `make setup` downloads it once. | Check that `public/mediapipe/pose_landmarker_lite.task` exists. Turn Wi-Fi off, reload, play one webcam exchange. Then, with Wi-Fi on, open the network tab and read that one request. | Say what the request holds, or run the demo with Wi-Fi off and say so. |
| 7 | "Sponsor prizes". | The exact names of the sponsor prizes and which ones we enter. `docs/sponsors.md`, which issue #130 points to, does not exist; PR #107 put the sponsor text into this file and `pitch.md`. | Read the prize list on the HackUTA Devpost page. | Rename the two headings, or delete a paragraph for a prize we do not enter. |
| 8 | The Gemini paragraph. Question 3. | A live answer from Gemini. The tests use a fake model. The model names are as written in `server/ai/gemini.ts`. | With keys in `.env`: `npx tsx server/tools/preflight.ts` prints which Gemini model answered. Then `npm run dev:all` and one god scan (in the game once #144 is merged; before that, on the test page `src/ai/lab/index.html`). Check that a god and a portrait appear. | If Gemini does not answer on the day, say that the scan fell back to the laptop, which is what the code does. |
| 9 | "Privacy of the god scan". Question 1. | What Google keeps beyond `store: false`. | Read the Gemini API terms for the key's project (free or paid tier). | Leave the sentence "We have not checked what Google keeps beyond that setting." as it is. |
| 10 | "Inspiration", last line. "Links". Walkthrough, "Nothing works". | One line from the team on why this idea. The repository link, the three team members as they want to be named, the demo video link, and the backup recording of a full fight (#21). | The team writes and records these. | The page cannot be submitted without the links. |

### Every [if merged]

State of each open pull request when this was written, and what to do when it merges. Check again with `gh pr list` before submitting.

| PR | State | What it adds | Where it is on this page | When it merges |
|---|---|---|---|---|
| #144 | open, in conflict with `main` | Music, Homer's narration, monster taunts, Athena's opening line, the god scan before the style menu (webcam play only), the divine power effect, the music slider. | "What's next", first two bullets. One tagged sentence in each sponsor paragraph, one in "Privacy of the god scan", one walkthrough row, one paragraph in question 1 and one sentence in question 3. | Move the two bullets up into "What it does" and delete the tags. Delete the four sentences that start with "Today" and stand just before a tagged sentence (the ElevenLabs paragraph, the Gemini paragraph, questions 1 and 3). In question 5, shorten the line on the music and the god scan to "The sounds for the later stops are recorded but not played." Add music, narration and taunts to the ElevenLabs line in "Built with". #144 also edits this file: this rewrite replaces those edits. |
| #153 | open | A camera panel with the tracked skeleton and the last move recognised, in place of the small camera picture. | "What's next". "What it does" and the walkthrough say the camera picture is in the bottom left corner. | Move the bullet up and change that wording. |
| #150 | open | Online rooms: host and join screens, the guest's fight, touch buttons for a phone. | "What's next". | Move the bullet up, and add "Fight together" to the title bullet and the walkthrough. |
| #92, #109 | draft | The screen for AI-made fights. The god card with a share panel. | "What's next". | Only if a game screen opens them. |

Merged while this was being written, and already in the page: #134 (the pottery look), #136, #138, #139, #140 and #147 (the five later stops), #142 and #159 (the Spartan, who follows the player's body), #146 (the webcam smoke test and the tracker fix), #149 (sounds for the later stops; no screen plays them), #78 (the level adapter; no screen opens it), #141, #143 and #162 (reports and credits), #152 (coordination).

### When `main` moves

Count again: stops and playable stops, styles, moves, clips, tests, and the balance numbers. The commands are in the PR for #130.

---

# Odyssey Fighter

**Tagline:** Fight your way home to Ithaca with your own body: a browser game that tracks you through a laptop webcam and teaches you to block, dodge and strike, starting with the Cyclops. `[confirm 1]`

[screenshot: the fight, Polyphemus winding up in the cave mouth, a defend card at the right edge]

## Inspiration

The Odyssey is a training story as much as a travel story. Odysseus does not beat Polyphemus by being stronger. He waits, reads him, and uses one prepared move: the sharpened olive stake. When he finally fights for his own house, Athena stands beside him as Mentor and urges him on. That is what a coach does, and it is the shape of a real fight drill: defend first, then take the opening.

We wanted a judge to stand up and do that with their own body, not press a button, and to leave knowing how to hold a guard and throw a jab.

`[confirm 10: one line from the team on why this idea, in our own words]`

## What it does

Odyssey Fighter is a 3D fight training game that runs in a browser tab. You are Odysseus on the way home from Troy. A laptop webcam tracks your body, and a detector for each move turns what you do into a block, a dodge or a strike. You can win the first fight with your body alone. `[confirm 1]`

- **Two ways in.** The title screen offers "Fight with your body (webcam)" and "Keyboard only". Every move has a key.
- **Five fighting styles.** Boxer (jab, cross, left hook, uppercut), Hoplite (spear thrust, overhead strike), Karate (reverse punch, knife hand, hammer fist), Kung Fu (double palm, chain punch, rising palm) and Pankration (front kick, knee strike, hammer fist, uppercut). Each is tied to a Greek figure: Polydeuces, Achilles, Heracles, Proteus and Theseus.
- **A map of the road home.** A sea chart runs from Troy to Ithaca with six stops in the poem's order: the Cyclopes (Book 9), Circe (Book 10), the Sirens, Scylla and Charybdis (Book 12), and the hall in Ithaca (Book 22). Every stop is a fight. Winning one opens the next, and the stops you have not reached are drawn as still ahead.
- **Calibration.** Before a webcam fight you stand still, arms down, for a three-second count. The game measures your resting stance, so a dodge is judged against your own body. If it cannot see you it says "Step back", "Step closer" or "Move into view".
- **Two beats.** The monster winds up and a card names what stops the attack: BLOCK, DUCK, DODGE LEFT or DODGE RIGHT. Hold it until the blow lands. Then a ring lights a weak spot and a card names a strike from your style.
- **Learn as you play.** The first card for a move has a drawing of the pose, the word, a hint, the key, and one line on what the move is for in self-defense. After two clean reps the drawing and the hint go. After five the card is the word, the key and a timer.
- **A ghost to copy.** A see-through gold figure beside your character holds the pose the card asks for. On the webcam it brightens as your body gets close to that pose. It fades as you learn the move.
- **Strikes are rated.** Each strike is scored on speed, arm extension and aim. The game shows GOOD, GREAT or PERFECT, and damage runs from half to one and a half times with the score. A key press counts as a fixed 0.7.
- **Combos.** Hits in a row do more damage, up to 50 percent more. Taking a hit or missing an opening resets the run.
- **Polyphemus in three phases.** In The Cave he swings and grabs. At two thirds health, The Club: he takes up a club and starts throwing boulders, which you duck. At 30 percent, Blinded: he stops grabbing and his warnings are about half as long as at the start. A banner names each new phase. His weak spots are his one eye and his gut.
- **End it with the stake.** At zero health he is still standing. The card reads DRIVE THE STAKE: both hands together at the chest, driven forward and down. Only that move ends the fight. He cannot hit you there, and the card comes back every six seconds until the move lands.
- **Five more stops.** Circe in the courtyard of her hall, the Sirens on their islet of bones, Scylla from the deck of the ship under her cliff, Charybdis from a raft in the strait, and Antinous and the suitors in the hall in Ithaca. Each has its own monster, its own arena and three phases. Circe ends on an overhead strike and the suitors on a spear thrust. These five are harder than the first and are not yet balanced for a first-time player.
- **See yourself.** Your character is a Spartan, seen from behind. On the webcam his arms, body, head and legs follow yours from the camera's 3D points, and your mirrored camera picture sits in the bottom left corner. On the keyboard he plays an animation for each move. His shield stays on his back and his hands are empty. The spear comes out only for the Hoplite's two strikes, and the stake only for the finishing move.
- **The cave at dusk.** The first fight is in the mouth of Polyphemus's cave, with a sunset sky and the sea behind him, shafts of light and a fire. A hit on him throws sparks. A hit on you shakes the camera and flashes the edge of the screen.
- **A black-figure look.** The menus, the HUD and the cards are drawn like Greek black-figure pottery: clay, black ink and Greek key bands.
- **Athena coaches by voice.** She calls each defense and each strike as it is needed, calls the stake, praises a hit, warns after one, and announces the result. In the Polyphemus fight she also announces each phase. The fight screen plays her lines from clips stored with the game. `[confirm 3]`
- **Sound for every fight event.** Each of the engine's 11 events has a clip.
- **Divine power.** Each defense fills a fifth of a meter. When it is full, any one of six god gestures (Thunderbolt, Trident sweep, Aegis push, Swift dash, Moon arrow, Sun burst; keys 1 to 6) spends it, while a card is up, for a hit worth three plain strikes. The meter is on screen. The game does not yet tell you which gesture to make.
- **If the camera loses you.** The fight pauses with "Step back, I can't see you" and resumes once you have been back in view for a second. Press any move key and it carries on from the keyboard.
- **Pause and settings.** Esc pauses a fight: resume, restart, settings or quit to the map. Settings hold the graphics quality, the effects and voice volume, the camera mirror and the key hints, and are saved in the browser.
- **Play with no camera.** The camera and the keyboard feed the same fight at the same time. If the camera cannot start, the game says so and carries on with keys. If calibration cannot finish in ten seconds, the fight starts on the keyboard.
- **Play with no network.** Pose tracking runs in the browser from files stored with the game, and the sounds, the 3D files and the textures are local files. There is no server to start. `[confirm 6]`
- **The result.** "Polyphemus falls", your score, and a count of each move you got right.

[screenshot: the title screen]
[screenshot: the style menu]
[screenshot: the quest map with stop 1 open]
[screenshot: a strike card with the ring on his eye and the gold ghost]
[screenshot: the stake card]
[screenshot: the result screen after a win]
[screenshot: one of the later stops, for example Scylla from the deck of the ship]

## How we built it

- **Vite, React and TypeScript** for the app. **three.js through @react-three/fiber** for the 3D scene, with @react-three/drei and @react-three/postprocessing for the sky, bloom, ambient occlusion and a vignette.
- **Monsters and arenas.** Polyphemus is a rigged low-poly giant by Quaternius (CC0). We tint him and add his one eye and his club in code, and he changes with each phase. The Spartan and the suitors are CC0 mannequins by Quaternius, with their gear built in code. Circe, the Sirens, Scylla and Charybdis are built in code, and so is every arena. The sky over the cave mouth and over Circe's hall is a CC0 file from Poly Haven. Each monster and each arena is one file behind a fixed interface, with a plain stand-in if it fails to build or load.
- **MediaPipe Tasks Vision** runs the lite pose model in the browser, once for each new camera picture, and returns 33 body points, as positions in the picture and as 3D positions in metres from the hips. The runtime is copied and the model is downloaded once at setup.
- **Move detectors.** We mirror the points so your left is the screen's left, and keep the last second of frames. Each move is one small file with a function over that second that returns how sure it is, from 0 to 1. A strike counts once when it passes 0.7 and cannot count again until it drops under 0.4. A defense counts for as long as it stays at 0.7 or above. Distances are in your own shoulder widths.
- **A pure combat engine.** The fight rules are one function: the state, what the player is doing and the time passed go in; the new state and a list of events come out. It has no camera, graphics, clock or network in it. The keyboard and the webcam produce the same input, which is why one can stand in for the other.
- **Everything visible only reads.** The scene, the HUD, the hit effects and the sound take the state and the events and never change the fight.
- **Content registers itself.** Moves, styles, monsters, monster models and arenas are one file each in a folder that is scanned at build time. Right now that is 26 moves (5 defenses, 14 style strikes, 6 god gestures and the stake thrust), 5 styles and 6 stops.
- **Tests in plain Node.** Because the engine is pure, vitest plays whole fights without a browser. The suite is 1,442 tests in 99 files. One test file plays 3,600 simulated fights (three made-up players, six stops, 200 fights each) and fails unless a beginner who defends one attack in two wins at least 85 percent of Polyphemus fights, in 90 seconds or less. Another plays 240 seeded random fights across every stop and style and checks the rules on every step. Another fails if a monster or a style names a move that does not exist. Detector tests check that each move fires when done right, stays quiet when you stand still, and is not read as another move.
- **A webcam test with nobody in front of it.** A script drives the real game in headless Chrome with a fake camera fed from a video of one person. It showed the camera start, the pose model load with every outside request blocked, calibration finish, the pause trigger and moves being detected. It also found that the pose model was running twice for each camera picture, which we fixed. It does not show that the game feels right on a real body.
- **Sound.** The 11 fight sounds and Athena's 37 lines were made ahead of time with **ElevenLabs** and are files in the game. Effects play through the Web Audio API. Eight of the 11 events also have a sound synthesised in code, which plays if a clip fails to load.
- **An optional Node and Express server** in `server/` holds the API keys and talks to **Google Gemini** and **ElevenLabs**. The game starts and plays a full fight with the server off.
- **Three people, three coding agents.** Each of us ran a coding agent. We agreed the shared contracts first and wrote one issue per task, listing the files it may touch. Every change, from anyone, goes through a branch and a pull request that must sit on the latest `main` and pass lint, typecheck, tests and a build. No code is copied from earlier projects.

## Challenges we ran into

- **Left and right.** The webcam picture has to be mirrored so the game feels like a mirror, and the 3D points have to be mirrored the same way, or "jab with your left" lights up the wrong arm.
- **Telling similar moves apart.** A jab, a cross, a spear thrust and the stake thrust all end with straight arms. Each detector also checks what the other arm is doing and where the hands were a moment before. Tests check that no move is read as another.
- **Different bodies and distances.** Pixel distances change with height and with how far back you stand, so detectors measure in shoulder widths and against your own resting stance. Tests replay each move on bodies of other sizes and distances. `[confirm 2: what changed after we tried it on the three of us in the room's light]`
- **A shaky camera.** Tracked points jitter from frame to frame. The block and the dodges are read from the last fifth of a second of frames, not from one frame, and tests replay every defense through a noisy camera.
- **Fitting one fight into a judge's three minutes.** Our first Polyphemus had 400 health, and a simulated beginner won 2 percent of fights. We made the length and the win rate a test and tuned to it: he now has 162 health, the same beginner wins 88 percent of fights, and those wins take 89 seconds on average.
- **Six fights, one tuned.** The five later stops are harder than we want. In the same simulation a player who defends three attacks in four wins 78 percent of fights against Circe and 22 percent against the suitors.
- **Prompts that stepped back too far.** The card used to shrink to only a timer after five clean reps. Our first playtest showed a player who was winning start to take hits, because nothing said which move was wanted. Now the card never drops the word and the key, and the ghost shows the pose.
- **A webcam demo can fail in a bright room.** So every move has a key, the keys stay live during a webcam fight, calibration gives up to the keyboard after ten seconds, and a lost body pauses the fight.
- **Three agents in one repository.** Without rules they edit the same files. Folder owners, one issue per task, content that registers itself and a branch for every change kept merges small.

## Accomplishments that we're proud of

- A fight you can play from the first card to the stake with only your body, in a browser tab, on a laptop webcam. `[confirm 1]`
- The same fight, under the same rules, from the keyboard when the camera is not available. `[confirm 4]`
- Rules that are tested without a browser, down to how long the first fight lasts and how often a beginner wins it.
- Prompts that step back as you learn, so the game teaches and does not only score.
- All six stops of the road home as fights, each with its own monster and arena.
- A structure where a new move, monster, style or arena is one new file.
- A fight that ends the way Book 9 does: he does not fall until the stake is driven in.
- Athena coaching by voice from clips stored with the game, so she needs no network. `[confirm 3]`

## What we learned

- Agreeing the shared contracts before anything else let three people build in parallel. Later features were added to those contracts without rewriting what was there.
- Keeping the rules pure paid for itself twice: the keyboard fallback cost almost nothing, and the fight could be tested as a whole.
- One deep fight is safer in front of a judge than six shallow ones. We tuned the first fight before we opened the other five.
- Test the thing the judge will feel, such as how long the fight lasts and whether a first-time player wins it, and not only whether single rules are correct.
- A playtest finds what unit tests do not. Ours found the vanishing prompt card.
- `[confirm 2: what tuning the detectors on three different bodies taught us]`

## What's next

Built and waiting on a merge:

- `[if merged: #144]` **Meet your god.** Before the style menu, webcam players can let the camera name the Olympian they take after: Zeus, Poseidon, Athena, Hermes, Artemis or Apollo. The scan can be skipped, and it ends by itself after 30 seconds.
- `[if merged: #144]` **Music and story.** A cave ambience on the menus, battle music in the fight and a short piece for the win and the loss. Homer narrates the title, the screen before a fight and the result. The monster taunts you when a phase changes.
- **A camera panel** that draws your tracked skeleton over the camera picture and names the move it just recognised.
- **Fight together.** Host and join screens for online rooms, so a friend can join from another laptop or a phone. The relay on the server and the host and guest logic are already in the repository.

In the repository as tested code that no screen opens yet:

- **Two players on one camera.** The engine doubles the damage when two players land the same strike together, and there is code that tells two bodies apart.
- **Fights from a sentence.** The server asks Gemini to write a level from a phrase you type and falls back to one of five handcrafted levels. An adapter turns that level into a fight the engine runs. The screen for it is a draft.
- **Sounds for the later stops.** An ambience loop and four sounds for each of the five later stops.
- **Difficulty that adapts** to how the player is doing, and a warm-up coach that leans the monster toward the defenses you need to practice.
- **A replay and a god card** to take away, shared by QR code.

After that: balance for the five later stops, phase lines of their own for Athena in those fights, your god's own gesture for the power meter, a tell of its own for each of Polyphemus's attacks, and detectors tuned on more bodies.

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
- ElevenLabs (sound effects and Athena's voice)
- Google Gemini API (Interactions API through the `@google/genai` SDK, for the god scan on the optional server)
- Node.js and Express (the optional server)
- Zod
- Vitest
- ESLint with typescript-eslint
- Quaternius (CC0 giant and mannequin models)
- Poly Haven (CC0 sky and textures)

## Sponsor prizes

`[confirm 7: the exact prize names, and which we enter]`

### ElevenLabs

The game's sound clips were made ahead of time with ElevenLabs and are stored with the game, so nothing is generated while you play and nothing needs a network. The fight screen plays two sets today. One is a sound effect for each of the engine's 11 fight events, made with the sound generation API (`public/audio/sfx/`, played by `src/audio/sfx.ts`). The other is Athena, the coach: 37 short lines made with text to speech (`public/audio/athena/`, chosen and played one at a time by `src/audio/voice.ts`). `[confirm 3]` She only asks for clips that are listed in an index file, so a missing clip means she is silent for that line and the fight carries on. If an effect clip fails to load, eight of the 11 events fall back to a sound synthesised in code. The repository holds 109 clips in all. Besides those two sets there are 25 ambience and event sounds for the five later stops, with tested playback code that no screen calls yet. Today the same is true of four music and ambience clips, 15 lines for Homer as narrator and 17 monster taunts. `[if merged: #144]` The game also plays four music and ambience clips, Homer's narration and the monsters' taunts. The script that made the clips is `server/tools/genClips.ts`, and `CREDITS.md` lists the endpoint, the model and the voice behind each set. The server also has a route that makes speech on demand (`POST /api/speech`), for lines that cannot be recorded ahead of time; no screen calls it.

### Google Gemini

Gemini is behind the god scan. One still picture from the webcam goes to Gemini, which picks one of six Olympians and writes an epithet, one sentence saying why, and a rival god. A second call repaints the same picture as a marble bust or a vase painting of the player. Both calls go through our server (`server/routes/reveal.ts`, `server/ai/gemini.ts`), which keeps the key out of the browser and answers only requests from the same laptop. With no key, no server or a slow answer, the browser picks the god itself, from the stance, then the clothing colour, then by lot, and draws its own marble portrait (`src/ai/gods/`). The scan screen is `src/ai/ui/RevealScreen.tsx`. All of this is in the repository and tested with a fake model. `[confirm 8]` Today only a test page opens the scan, so a player does not reach Gemini. `[if merged: #144]` Webcam players get the scan before the style menu and can skip it. The server can also ask Gemini to write a fight from a sentence (`POST /api/level`); no screen calls it yet.

**Privacy of the god scan, as the code does it**

- The screen says, before anything is taken: "One picture is taken and sent to Google Gemini to choose your god. It is not saved. With no network, the choice is made on this laptop."
- **What is sent.** One JPEG, at most 640 pixels wide, taken after a three-second count and only after the player presses "Reveal my god". The request holds that picture and nothing else. It goes to our server on the same laptop, which sends it to Gemini to choose the god and, if that worked, once more to paint the portrait. If the first model fails, the same picture goes to a second Gemini model. No video is sent. The text on the screen does not mention the portrait call.
- **What is not sent.** With no camera, or when the player presses "Cast the lot instead (no picture)", no picture is taken and no request is made. `[if merged: #144]` The same holds when the player skips the scan before the count ends, or plays on the keyboard. With the server off, the picture does not leave the laptop. With the server on but no Gemini key, it reaches our server and goes no further.
- **What is kept.** Our server holds the picture in memory only, until the portrait call ends; the limit for that call is 12 seconds. It never writes the picture to disk and never logs it. The painted portrait stays in the server's memory, at most 20 at a time, each forgotten after two minutes. The Gemini calls set `store: false`, which asks Gemini not to keep the request as a stored interaction. We have not checked what Google keeps beyond that setting. `[confirm 9]`
- **What is judged.** The prompt tells Gemini to judge only the expression, the stance, the colours of the clothing and the energy of the pose, never body shape, size, age, gender, skin, hair, face or attractiveness, and not to identify the person. The server then checks the answer: an epithet or a reason with a word about body, age, looks or gender is replaced by a fixed line for that god.
- **The portrait is a likeness.** Its prompt asks the image model to keep the player's face, hair, expression and pose, so they stay recognisable as a statue.

## Links

`[confirm 10: repository link, team members, demo video]`

---

# For the table (not for Devpost)

## Judge walkthrough: three minutes

This is the path that exists on `main`: title, camera, style, map, intro, calibration, the Polyphemus fight, result.

**Before the judge steps up.** `make dev` is running and the tab is full screen. Volume up. Caps Lock off. A mark on the floor where the camera sees the judge from head to hips; the smoke test notes suggest two to three metres back. `[confirm 5]` The presenter stands beside the laptop, out of the camera's view, and does every click, so the judge never leaves the mark.

**The clock.** The fight has no fixed length. From 0:23 on, the first time is for a player who defends three attacks in four, and the time in brackets is for a first-time player who defends one in two. Both come from simulated fights. `[confirm 5]`

| Clock | Screen | What the judge does | What the judge sees and hears |
|---|---|---|---|
| 0:00 | Title | Stands on the mark. The presenter clicks "Fight with your body (webcam)" and allows the camera. | "Odyssey Fighter", one line of verse, and "Starting the camera...". |
| 0:00 to 0:08 | Title | Waits. | The camera starts and the pose model loads. |
| `[if merged: #144]` 0:08 | God scan | Either strikes a pose while the presenter clicks "Reveal my god" and then "Begin the journey", or the presenter clicks "Skip (Esc)" to save time. | A count of three, one picture, then a god, an epithet, one sentence and a portrait. The scan ends by itself after 30 seconds. Add the time it takes to every clock time below. |
| 0:08 | Choose your fighting style | Says "Boxer". The presenter clicks it. | Five styles, each with a line on its Greek figure. |
| 0:12 | The Road Home | Watches. The presenter clicks stop 1. | A sea chart from Troy to Ithaca with six stops. Stop 1, "The land of the Cyclopes, Book 9", is open. The other five say "(ahead)"; each opens when the stop before it is won. |
| 0:16 | Intro | Watches. The presenter clicks "Face Polyphemus". | The place and the book, his name, and one line. |
| 0:20 to 0:23 | Stand still, arms down | Stands still with arms down. | A count: 3, 2, 1. It counts only while the camera sees shoulders, hips and wrists. If not, it says why and starts again. There is no camera picture on this screen. |
| 0:23 to 0:25 | The fight opens | Nothing yet. | The cave mouth at dusk and the giant. A Spartan, seen from behind, moves with the judge. Their camera picture is bottom left. His name shows for a second and a half. |
| 0:25 | First defend card | Does what the card says and holds it until the blow lands, a little over two seconds. | A card at the right edge: a drawing, the word, HOLD, a hint and the key. A gold ghost holds the pose. Athena calls the move. `[confirm 3]` In this phase he only swings and grabs: dodge left, dodge right or block. |
| 0:27 | First strike card | Throws the strike the card names, inside 2.6 seconds. | A gold ring on his eye or his gut. On a hit: sparks, a sound, GOOD, GREAT or PERFECT, and his bar drops. A miss costs only the combo. |
| to 0:46 (1:03) | The Cave | Defends, then strikes, again and again. | After two clean reps of a move the card loses its drawing and hint. Hits in a row count up as a combo. |
| 0:46 (1:03) | The Club | Now also ducks. | His bar is under two thirds. A banner: "The Club". He holds a club. Athena: "He takes his club!". He throws boulders, and every warning is about a quarter shorter. |
| 1:04 (1:30) | Blinded | Keeps going. | His bar is under 30 percent. A banner: "Blinded". He stops grabbing. A club swing lands 1.2 seconds after it starts. |
| 1:15 (1:49) | The stake | Puts both hands together at the chest, then drives them forward and down. | His bar is empty and he is still standing. The card reads DRIVE THE STAKE. He cannot hit the judge here, and the card comes back every six seconds until the move lands. |
| 1:16 (1:52) | Result | Reads. | "Polyphemus falls", the score, the moves learned with a count each, and "The way onward is open." |
| to 3:00 | Map, then a second fight | Chooses. The presenter clicks "Back to the map", then either stop 2, or "Change style", Hoplite and stop 1 again. | Stop 1 has a tick and stop 2, Circe, is open. Circe is much harder: in the simulation a first-time player almost never wins her fight, so say so and cover the defense from the keys. Hoplite's two strikes are a two-handed thrust and an overhead chop. Esc in a fight shows the pause menu and the settings. |

In the simulation the slowest win by the first-time player ended at 2:34 on this clock, and that player lost about one fight in eight.

**To show a later stop** without winning the ones before it, open the game at `/?stop=scylla` (or `circe`, `sirens`, `charybdis`, `suitors`). The stops before it count as won.

**If the judge loses.** The screen reads "You are struck down". Click "Fight again". The fight starts over with a new calibration, so tell the judge to stand still first. Cover the defense from the keys this time (see below).

**Keyboard fallback.** `[confirm 4]` Every move has a key, and the keys count during a webcam fight too. The presenter can hold a defense or throw a strike for the judge without restarting. Say so when you do it.

| Move | Key |
|---|---|
| Block | Space (hold until the blow lands) |
| Dodge left, dodge right | Left arrow, Right arrow (hold) |
| Duck | Down arrow (hold) |
| Boxer: jab, cross, left hook, uppercut | J, K, L, B |
| Hoplite: spear thrust, overhead strike | U, I |
| Karate: reverse punch, knife hand, hammer fist | R, H, M |
| Kung Fu: double palm, chain punch, rising palm | P, C, G |
| Pankration: front kick, knee strike, hammer fist, uppercut | F, N, M, B |
| Stake thrust | O (only when the card reads DRIVE THE STAKE) |
| God gestures, when the power meter is full | 1 to 6 |
| Pause | Esc |
| Low graphics, on and off | Q |

**If the camera fails.**

- **It will not start** (permission refused, no camera, pose files missing). The game shows "No camera available, so you're on keyboard controls." and goes on to the style menu. Say: "The camera is not coming up, so you are on the keys. It is the same fight. The engine cannot tell a key from a punch."
- **Calibration cannot see the judge.** It says "Step back", "Step closer", "Move into view" or "I can't see you". After ten seconds it starts the fight on the keyboard. "Use keyboard instead" does that at once.
- **The camera loses the judge in the fight.** The fight pauses with "Step back, I can't see you". It resumes once they have been back in view for a second. Or press any move key: the fight carries on from the keyboard and does not pause again.
- **One move will not register.** Press its key and say "I will throw that one for you."
- **Dodges or ducks misfire from the first exchange.** The resting stance was measured badly. Press Esc, then "Restart fight", and have the judge stand still through the count.
- **The picture stutters.** Press Q once for low graphics.
- **The tab breaks.** Reload, choose "Keyboard only", pick Boxer.
- **Nothing works.** Play the backup recording. `[confirm 10]`

## Five questions a judge is likely to ask

**1. Is my picture stored?**
No. During a fight the camera picture is read by a pose model that runs in this browser tab. Our code does not record it, save it or send it anywhere. The game keeps only the last second of body points, in memory. The pose library itself tries one telemetry request to a Google address when the laptop is online. We have not looked at what it holds, and the game plays the same with it blocked. `[confirm 6]` Today the game takes no still picture at all.

`[if merged: #144]` The god scan is the one place a picture leaves the tab: one still, only after you press "Reveal my god", sent through our server on this laptop to Google Gemini. Our server holds it in memory until the portrait is painted, 12 seconds at most, and never writes it to disk or to a log. We ask Gemini not to store the request. We have not checked what Google keeps beyond that setting. `[confirm 9]` You can skip the scan, or cast the lot with no picture.

**2. What happens with no internet, or if the camera fails?**
The fight needs no internet. The pose model, the sounds, the 3D files and the textures are files served with the game, and no server is needed. `[confirm 6]` If the camera cannot start, the game says so and puts you on the keyboard. If it loses you in the middle of a fight, the fight pauses until you are back, or carries on from the keys the moment you press one. The keys also work during a webcam fight, so one of us can cover for you.

**3. What do Gemini and ElevenLabs actually do?**
Neither is called during a fight. ElevenLabs made the sound ahead of time: the 11 fight sounds and Athena's 37 lines are files in the game. Gemini is behind the god scan: it picks one of six gods from one still picture and paints a portrait. The scan, its server route and a fallback that runs on the laptop are on `main` and tested with a fake model. `[confirm 8]` Today no game screen opens the scan. `[if merged: #144]` Webcam players get the scan before they pick a style. The API keys stay on the server and never reach the browser.

**4. How does it know a punch from a wave?**
The pose model gives 33 body points for each camera picture. We keep the last second of them and each move looks for its own shape in that second. A jab is the left elbow going from bent (under 115 degrees) to straight inside a fifth of a second, with the fist at shoulder height and in front of the body. A wave is not that shape. A hand coming down from over the head, an arm flung out to the side and a slow reach are each ruled out, and each has a test. If the right arm goes out at the same time it is a spear thrust, not a jab. A strike counts once and cannot count again until the arm comes back. Distances are in your own shoulder widths, so height and distance from the camera should not matter. These are tested on made-up pose sequences. They are not yet tuned on real people. `[confirm 2]`

**5. What is not finished?**
- All six stops play, but only the first is balanced for a first-time player. In simulation a player who defends three attacks in four wins 78 percent of fights against Circe and 22 percent against the suitors.
- Nobody has logged a full webcam fight won by a real person. The webcam path has run end to end only on a fake camera fed from a video. `[confirm 1]`
- Athena's two phase lines were written for Polyphemus ("He takes his club!" and "He is blind! Stay light!"). She says them in the other five fights too.
- Polyphemus plays the same animation for all four attacks, so the card and Athena tell you which defense is wanted, not his body.
- The power meter fills and can be spent, but the game does not tell you the gesture, and any of the six god gestures works.
- On the keyboard, the letter keys do nothing with Caps Lock on, and holding all four defense keys stops every attack. `[confirm 4]`
- The music, Homer's narration, the taunts, the god scan and the sounds for the later stops are built but no screen opens them.
- Two players, online rooms, fights written by Gemini, adaptive difficulty and the replay card are tested code with no screen yet.
