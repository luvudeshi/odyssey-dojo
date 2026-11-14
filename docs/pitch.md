# Pitch, demo video and judge questions

Written against `origin/main` on Sat 14 Nov 2026, evening. **[if built]** marks something planned that is not in that build: strike the tag if it ships, strike the line if it does not. Rehearse only what is true on the day.

Setup before the judge arrives: laptop plugged in, Chrome, the game open at the title, camera allowed once already, light on your face and not behind you, `?debug` off, the backup recording open in another tab.

## 3-minute table pitch

You stand next to the laptop. You hand it to the judge at 0:45. Times are targets.

**0:00 to 0:20. Hook.** "This is Odyssey Fighter. Your webcam is the controller. You fight the monsters from Homer's Odyssey, and you learn a real move each time you throw one." Do not explain more. Click "Fight with your body".

**0:20 to 0:45. Show it once, yourself.** Step back so your upper body is in frame. Point at the bronze figure copying you. Pick Boxer. Say: "Two beats. First he attacks and a red card tells you the defense. Then a weak spot lights up and a gold card tells you the strike." Block one attack and throw one jab.

**0:45 to 2:15. The judge plays.** Hand over. Say only: "Do what the card says." Then be quiet and watch.
- If they stop at a defense, say "fists at your face". For a strike, "punch at the eye."
- If the camera misreads them, say "the keyboard works too" and point at Space, arrows, J, K, L. Keep going, do not apologize.
- Point out as it happens: the card shrinking as they learn the move, the combo count, Polyphemus changing phase.

**2:15 to 2:40. The finish.** If Polyphemus is low, say: "Now the stake. Both hands, drive it from your chest." That is the taught finishing move. If the fight is not close to done, skip it and go to the close.

**2:40 to 3:00. The close.** "Every move is one file and the fight rules are one pure function, so a keyboard, a webcam or a friend are the same input. It runs with the network off. Next is the rest of the route." Name only what shipped. **[if built]** "Athena coaches you by voice. A webcam snapshot picks your god."

If the judge is stuck at 1:30, switch to the keyboard and finish the fight. A finished fight beats a perfect demo of tracking.

Note: a clean run of the fight takes 90 to 150 seconds by our own pacing target, so the judge may not finish it inside 3 minutes. That is fine. Do not rush them.

## 60-second demo video: shot list

Screen capture of the game, with your voice over it. No music over speech. Add on-screen text only for the event name and the repo.

| Time | Shot | Voice over |
|---|---|---|
| 0:00 to 0:05 | Title screen, then click the webcam button | "Odyssey Fighter. Fight the Odyssey with your body." |
| 0:05 to 0:12 | Style choice, pick Boxer | "Pick how you fight. Each style has its own moves." |
| 0:12 to 0:20 | Camera preview and bronze figure copying you, side by side | "Your webcam tracks your body, in the browser. Nothing leaves your laptop." |
| 0:20 to 0:32 | Red defense card, you block, then the gold strike card, you jab | "He attacks, you defend. A weak spot lights up, you strike." |
| 0:32 to 0:40 | A prompt card shrinking, the combo count | "The more you get right, the less the game tells you." |
| 0:40 to 0:48 | Phase banner and a faster attack | "He changes as he gets hurt." |
| 0:48 to 0:55 | The stake finisher, then the win screen | "Each fight ends on one taught move." |
| 0:55 to 1:00 | Keyboard fight for two seconds, then the repo name | "No camera? Every move has a key." |

Check before recording: the length limit on the event page, and that nothing in the shot is on the [if built] list unless it shipped. Record the full backup run in the same session, with no commentary: it is what you show if the camera dies at judging.

## 12 likely judge questions

**1. Does it actually work? What if the camera fails?**
Every move has a key, so the whole fight plays on the keyboard. If the camera is refused or missing, the game says so and drops to keyboard controls. We also have a recorded full run **[if recorded]**.

**2. What happens if someone stands in the wrong place or the light is bad?**
Honest answer: the detectors were first tuned on synthetic frames and are still being tuned on real people (#17). A bad angle or poor light can drop a move. A calibration step and a pause when you leave the frame are planned **[if built]**. Until then, the keyboard is the fallback, and `?debug` shows each move's live confidence.

**3. How do you know it holds up?**
The fight rules are a pure function with automated tests (combat, phases, content, effects, sound), and `make check` runs lint, typecheck, tests and a build. A broken 3D part is replaced by a placeholder and a missing sound is skipped, so one bad file does not blank the game. We also keep a written playtest log with the bugs we found, including ones still open.

**4. How does the pose tracking work?**
MediaPipe's pose landmarker runs in the browser on the webcam feed. Each move is a small detector that looks at a short history of landmarks, such as a wrist travelling away from a shoulder, and returns a confidence. A move fires once when it crosses its threshold.

**5. Is any video sent to a server?**
No, not in the game as it stands. Tracking runs in the browser from files in the repo. **[if built]** The god scan sends one snapshot to Gemini through our server.

**6. How does it use the theme?**
The route is the Odyssey's route. The first fight is Polyphemus, in his cave, and the finishing move is the stake driven into his eye. His taunts paraphrase the book: "Nobody is killing me!" Each style's blurb ties to an episode: Odysseus and the beggar Irus for Boxer, Troy for Hoplite, the great bow for Karate, turning a giant's strength aside with wits for Kung Fu. The rest of the route, in the poem's order, is **[if built]**.

**7. What is creative about it?**
You do not press a button for a punch. You throw one, and the game says what it is for. The prompts fade as you learn, so the game teaches inside the fight and not in a tutorial.

**8. What is the real self-defense lesson in it?**
Each move carries a one-line reason. The double palm makes space and will not break on a hard target. The hammer fist hits hard on the padded bottom of the fist. The uppercut works when there is no room for a straight punch. Today these lines live in the move data **[if built]** and are shown on screen. We teach ideas, not certified technique: it is a game, not a class.

**9. What did you build this weekend, and what did you reuse?**
All game code is new this weekend. We use open libraries (React, three.js, MediaPipe) and CC0 cave textures and a lighting map from Poly Haven, listed in `CREDITS.md`. The cave arena and hit effects began from tagrawal029's branch.

**10. How did three people build this in a weekend?**
One lead owns the core, and each teammate took one issue and one folder. Moves, styles and monsters are one file each and register themselves, so we rarely touched the same file. We wrote the ownership rules first (`docs/COORDINATION.md`). Coding agents did much of the typing under those rules, with every change going through a pull request.

**11. How do you use ElevenLabs? (sponsor)**
**[if built]** Athena's voice lines are generated once with ElevenLabs and saved as audio files, so they play with no network (PR #55). If that has not merged, say: "We planned it, and it is not in this build." Do not claim it otherwise.

**12. How do you use Gemini? (sponsor)**
**[if built]** Two uses are planned and neither is in the main build as of this writing: the god scan, where a webcam snapshot goes to Gemini and comes back as an Olympian, and AI-made fights, where you describe how you fight and Gemini builds the level (server in PR #43). The server falls back to handcrafted levels if Gemini is slow or the key is missing, so the game never waits on it. If it did not merge, say: "Not in this build."

## What not to say

- Do not call it finished. Say what it does today.
- Do not promise Scylla or the rest of the route. Scylla has no model yet, and the build shows a plain block.
- Do not quote an accuracy figure for the tracking. We did not measure one.
