# Devpost draft

Draft for the Odyssey Fighter page. Written against `origin/main` on Sat 14 Nov 2026, evening. Everything not in that build is marked **[if built]**: strike the tag if it ships, strike the sentence if it does not. Do not add a number, a user count or a result that nobody measured. Screenshots and the video link are for #21.

**Team:** toyeshhm, luvudeshi, tagrawal029. Add school and roles yourselves; this file does not guess them.

**Tagline:** Fight the monsters of the Odyssey with your own body. Your webcam is the controller.

## Inspiration

The Odyssey is a route: one monster after another, in a fixed order, on the way home. We wanted to fight along that route and learn something real while doing it.

Fighting games ask you to memorize buttons. We wanted the move itself to be the thing you learn. So you throw the punch, and the game tells you what that punch is for.

## What it does

Odyssey Fighter is a 3D fight game. You stand in front of a webcam, and a bronze figure on screen copies your body.

- You pick a fighting style: Boxer, Hoplite, Karate or Kung Fu. Each has its own strikes.
- You fight Polyphemus in his cave. Each exchange has two beats. First he winds up and a red card says what stops it: block, duck, dodge left or dodge right. Then a weak spot lights up and a gold card names a strike.
- The first time you meet a move, the card shows a stick figure and a hint. After two clean successes it shrinks to the word. After five it shrinks to a timer bar.
- Polyphemus has three phases: The Cave, The Club and Blinded. He gets faster and angrier as his health drops.
- The fight ends on one taught move. For Polyphemus it is the stake, a two-handed drive from the chest into his eye.
- Damage grows with your combo and with how well you threw the strike. A score and a combo count run along the top. Today only the stake has a real quality score; the other strikes count as a fixed 0.7.
- Every move also has a key, so the whole game plays with no camera. That is our fallback in front of a judge.

Also in the repo: Scylla exists as fight data and has no 3D model yet, so she shows as a plain block.

**[if built]** Athena speaks the call for each move and praises or warns you, from clips recorded ahead of time (PR #55).
**[if built]** A faint ghost outline of the pose to hit.
**[if built]** A quest map in Odyssey order, with Circe, the Sirens, Charybdis and the suitors as stops ahead (data in PR #44).
**[if built]** The camera names the god you take after, and you throw that god's gesture as a special power (moves in PR #56).
**[if built]** Describe how you fight in your own words and Gemini builds the fight (server in PR #43).
**[if built]** A second player in frame, or online rooms.

## How we built it

- **Pose tracking runs in the browser.** MediaPipe's pose landmarker (lite model) reads the webcam at 640 by 480. The model and its WASM files are copied into `public/mediapipe/` at install time, so tracking needs no network once the project is set up.
- **Moves are detectors.** Each move is one file that reads a short history of body landmarks and returns a confidence from 0 to 1. A new move, style or monster is one new file; a registry picks it up, so nobody edits a shared list.
- **The fight rules are a pure function.** `combat/engine.ts` takes the state, what the player is doing and the time passed, and returns the next state plus events. It has no camera, graphics or clock inside it. That is why the keyboard and the webcam are interchangeable, and why we test the rules without a browser.
- **Everything visible reads state.** The 3D scene, the HUD and the sound only watch the fight. They never change it.
- **3D in code.** React Three Fiber and three.js draw the cave and Polyphemus. The cave floor, walls and lighting use CC0 textures and an HDRI from Poly Haven (see `CREDITS.md`). Hit flashes, sparks and screen shake come from combat events.
- **Sound.** Combat sounds are synthesized in the browser, with a hook to swap in recorded clips.
- **Three people, one repo.** One lead owns the core. Teammates and their coding agents each took one issue, one folder and one PR at a time. `docs/COORDINATION.md` is the rulebook; we wrote it before writing the game.

## Challenges

- **A body is not a button.** Our detectors began as first guesses on synthetic frames. Real bodies, light and camera distance move every threshold. We added a `?debug` view that prints every move's live confidence, so we can tune by watching it.
- **Teaching without a tutorial.** A prompt that fades too early strands the player. Our own playtest log caught it: after five successes the card becomes a thin bar, and a player who was winning started taking hits. That is bug 1 in `docs/playtest.md`, and the ghost outline is meant to fix it.
- **The keyboard fallback had holes.** The playtest found that Caps Lock disables the letter keys and that holding every defense key stops every attack. Both are logged in `docs/playtest.md` with their status.
- **Keeping three agents out of each other's way.** Each folder has one owner, and shared files go through a PR only.

## Accomplishments

- A full fight against Polyphemus that plays start to finish by webcam or keyboard.
- A fight engine tested without a browser. The tests under `tests/` cover combat, phases, content merges, effects and sound.
- A game that survives a missing camera, a missing model file and a failed asset load. A camera error falls back to keyboard, an error boundary swaps a broken 3D part for a placeholder, and a missing sound clip is skipped.
- Adding a move, a style or a monster is one file.

## What we learned

- Put the rules in a pure function early. Every later feature (a second input, a new monster, a replay) is easier when the fight does not know where its input came from.
- Write the ownership rules before the code when several agents work in one repo.
- Pose detection is about thresholds you cannot guess. Build the debug view first.
- A fallback only counts if you test it. We added the keyboard path and then went looking for its bugs.

## What's next

- Rigged 3D models for the monsters, and a complete redesign of the menus and HUD (#52, #53). Not started.
- More stops on the route: Circe, the Sirens, Charybdis, the suitors **[if built]**.
- Detectors tuned on all three of us in the judging room's light (#17).
- More moves that teach real self-defense, and a difficulty that adapts to the player.

## Built with

TypeScript, React 19, three.js 0.187, React Three Fiber, drei, postprocessing, MediaPipe Tasks Vision (pose landmarker), Vite, Vitest, ESLint, Poly Haven CC0 textures and HDRI.

**[if built]** Gemini (god scan, AI-made fights), ElevenLabs (Athena's voice), Express and Zod (server).

## Try it

```bash
make setup
make dev
```

Open http://localhost:5173 in Chrome. Choose "Fight with your body (webcam)" or "Keyboard only". Keys: Space block, arrows dodge and duck, J K L strikes (Boxer), U I (Hoplite).
