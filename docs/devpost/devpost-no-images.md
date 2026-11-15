<!-- Devpost form fields: paste these into the separate fields on the submission form, not into the story. -->

**Tagline:** Fight your way home to Ithaca with your own body.

**Built with:** typescript, react, vite, three.js, react-three-fiber, mediapipe, elevenlabs, google-gemini, express, node.js, vitest

**Links:** Demo `[confirm: live demo URL]` · Video `[confirm: demo video URL]` · Repo `[confirm: repo URL, github.com/toyeshhm/odyssey-dojo is private today]`

**Team:** toyeshhm, luvudeshi, tagrawal029, gatik-g

---

Odysseus did not beat Polyphemus by being stronger. He waited for the Cyclops to fall asleep, then drove a sharpened olive stake into his one eye. It was a plan and a single move, done at the right moment.

**Odyssey Dojo** is a browser game where your body is the controller. A webcam reads your jab, hook, block, duck and dodge. You fight six stops of Odysseus's road home, and Athena coaches you out loud while you do it.

## Inspiration

The Odyssey reads like a training story. Odysseus survives the Cyclops, the Sirens and the six-headed Scylla by knowing what each one will do next and having one prepared answer. Athena is beside him for the fight at the end, telling him what to do.

That is what a coach does. We wanted a player to stand up, throw a real jab, and leave knowing how to hold a guard.

## What it does

- **Your body is the controller.** MediaPipe pose tracking runs in the browser through a laptop webcam. There is a detector for each of the 26 moves.
- **Two beats in every exchange.** The monster winds up and a card names the defense: block, duck, dodge left or dodge right. Then a weak spot lights up and a second card names the strike.
- **A 3D mannequin shows each move.** It acts out the move on the prompt card before you try it.
- **Five fighting styles.** Boxer, Hoplite, Karate, Kung Fu and Pankration. Each has its own strikes.
- **Six stops, in Homer's order.** Polyphemus, Circe, the Sirens, Scylla, Charybdis and the Suitors, each with its own monster, arena and sound. Picking a stop on the quest map starts its fight at once.
- **Your hero leaps to the weak spot** when a strike counts, so a hit looks like a hit.
- **Polyphemus has three phases.** The Cave, The Club and Blinded. He throws boulders from the second phase on. At zero health he is still standing, and only the stake thrust ends the fight.
- **Athena coaches by voice.** She calls each defense and strike, praises a hit and warns after one. Homer narrates before and after each stop, and the monsters taunt you.
- **A god scan names your patron.** A snapshot goes to Gemini and comes back as an Olympian with one divine power. Defends fill a power ring at the bottom of the screen, and a god gesture spends it.
- **Fight together.** Host a room and a friend joins by code or QR code. Throw the same strike together and it does double damage.
- **Every move has a key.** The whole game plays on a keyboard, with no camera.
- **A main menu with Story mode, Multiplayer, a Training Dojo and an Account page.** Multiplayer hosts a room with a code and a QR code, or joins one. Account keeps your hero name, achievements and settings.

## How we built it

1. **See:** MediaPipe's PoseLandmarker tracks your body in the browser. The model ships with the game, so tracking needs no network.
2. **Read:** each move has a detector, written to hold for any body size, any camera distance and a turn of 30 degrees.
3. **Fight:** the combat engine is plain TypeScript with no browser in it. It runs the phases, the combo, the divine power meter and the finishing move.
4. **Draw:** three.js through React Three Fiber renders the arenas, the monsters and your hero, who follows your body in real time.
5. **Speak:** every voice line and sound is a clip made ahead of time, so sound works offline.

The keyboard and the camera feed the same input every frame, so a fight is identical either way. Because the rules do not touch the browser, we could test a whole fight, start to finish, as plain code.

Each monster and each move is one file. A new stop is one new file in `src/enemies/defs/`, and the quest map picks it up.

## ElevenLabs: Athena's voice

Athena, Homer and the monsters speak with ElevenLabs. We generated every clip ahead of time with our own account, so no network call happens in a fight.

- **Athena** calls every move and every phase. Her voice is Sarah, on model `eleven_v4`.
- **Homer** narrates before and after each stop. His voice is George.
- **Polyphemus** has his own taunts, in the voice of Callum, and the other monsters have theirs.
- **Sound effects and music** came from the same account: one clip for each fight event, plus a menu, fight, win and loss track.

We ran each clip through speech to text afterward. The check heard `call_knee` as "Me", so we generated that clip again. `[confirm: whether the team entered the ElevenLabs track]`

## Google Gemini: the god scan

Before the style menu, a webcam player gets a god scan. A snapshot goes to our Express server, which asks Gemini to name the Olympian they take after: Zeus, Poseidon, Athena, Hermes, Artemis or Apollo. The god comes with one power, and the power shows up in the fight.

- **The key stays on the server.** The browser never sees it.
- **Every call has a time limit and a fallback.** With the server off, the scan measures your body in the browser and picks a god from that.
- **It can be skipped.** It ends by itself after 30 seconds. `[confirm: whether the team entered the Gemini track]`

## Tech stack

| CATEGORY | TECHNOLOGIES |
|---|---|
| Frontend | React 19, TypeScript (strict), Vite |
| 3D | three.js, React Three Fiber, drei, postprocessing |
| Pose tracking | MediaPipe Tasks Vision (PoseLandmarker, runs in the browser) |
| Server | Node.js, Express (optional) |
| AI | Google Gemini (god scan), ElevenLabs (voice, sound effects, music) |
| Tests | Vitest, headless browser runs |
| Art | Poly Haven (CC0 skies and textures), Quaternius (CC0 models), shapes built in code |

## Challenges

- **Webcam play must survive a bad room.** A judge may stand in poor light, or the camera may fail. So every move has a key, the keys stay live during a webcam fight, and a camera failure is shown on screen. The game never drops to the keyboard without saying so.
- **Bodies come in all sizes.** Detectors scale to your torso and tolerate a 30 degree turn. We tested them on made-up poses first. `[confirm: result of the first fight on a real body on the demo laptop, issues #7 and #17]`
- **Strikes did not look like they landed.** The hit counted, but the hero stayed where he stood. Now he leaps so his fist, foot or blade meets the weak spot.
- **A playtest found what unit tests did not.** A prompt card that vanished, and a Caps Lock bug that made the strike keys do nothing. Both were fixed.
- **Three people and their coding agents in one repository.** Without rules they edit the same files. Folder owners, one issue per task and a branch for every change kept merges small.

## Accomplishments

- A fight you can play start to finish with only your body, or only a keyboard.
- Six stops, five styles and 26 moves.
- Athena, Homer and the monsters speak, from clips that ship with the game.
- A finishing move that ends Polyphemus the way Book 9 does.
- Online rooms where two fighters strike together for double damage.
- Rules that run without a browser, so the whole fight is tested as code.

## What we learned

- **Agree the contracts first.** Shared types let several people build in parallel without rewriting each other's work.
- **Keep the rules pure.** The keyboard fallback cost almost nothing, and a fight could be tested whole.
- **Test what the judge will feel.** How long a fight lasts matters as much as whether one rule is right.
- **A playtest beats a test suite** for finding what a player trips over.

## What's next

- Tune the detectors on real bodies and play a full webcam fight on the demo laptop.
- Show the character picker: Odysseus, Poseidon, Zeus, Athena and Achilles are built and not yet offered in a menu.
- Swap kicks the camera cannot see when a player is framed from the waist up.
- Fights written from a sentence, with Gemini building the level. The server route exists and no menu opens it.

Play it at `[confirm: live demo URL]`. Pick a stop and the fight starts.

*Credits: skies and textures from [Poly Haven](https://polyhaven.com) (CC0). Hero and Polyphemus models by Quaternius (CC0). Voices, sound effects and music generated with ElevenLabs. Pose tracking by Google MediaPipe (Apache License 2.0). The full list is in `CREDITS.md`.*
