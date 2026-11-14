# Pitch: three minutes at the table

What the presenter says while one judge plays the Polyphemus fight, what to do when something fails, and answers to the ten questions we expect in the two minutes after. The Devpost text is in [devpost.md](devpost.md).

**How to read this draft.** It was checked against `main` at commit `9e95d61` (Saturday afternoon). Anything tagged `[pending #N]` is not on `main` yet; N is the issue that will add it. Before judging, go through every tag. If the feature landed, delete the tag. If it did not, say the "Today" line next to it and never the pending one.

## What is true today

| Part of the pitch | On `main` now | Not yet |
|---|---|---|
| Webcam play | MediaPipe pose tracking in the browser, one detector per move, a bronze figure that mirrors the player in 3D | Proven on a real body `[pending #7]`, tuned on all three of us `[pending #17]` |
| Keyboard fallback | A key for every move. Keys and camera are merged every frame. If the camera cannot start, the game says so and carries on with keys | Nothing |
| Styles | Boxer (jab, cross, hook), Hoplite (spear thrust, overhead strike) | Pankration and kicks `[pending #25]` |
| The two-beat fight | Defend, then strike. Combo, score, prompts that shrink as a move is learned | Ghost outline `[pending #24]`; "what this move is for" shown on screen `[pending #36]` |
| Polyphemus | 3D model built in code, 400 health, four attacks, two weak spots. His three phases exist as data, and the stake thrust exists as a tested move detector | The engine does not change phase yet `[pending #5]`; the fight ends at zero health, not on the stake `[pending #6]`; a model that changes per phase `[pending #11]` |
| Strike quality | Every strike carries a 0 to 1 quality into the engine | Damage that scales with it and GOOD, GREAT, PERFECT on screen `[pending #23]` |
| Arena and hit feel | Flat floor, four columns, one synth tone per fight event | Cave arena `[pending #9]`; shake, flashes, sparks `[pending #10]` (both on a branch, not merged) |
| Athena | Nothing | Script and clips `[pending #14]`, playback `[pending #15]` |
| The route | Fights run in route order: Polyphemus, then Scylla (data only, drawn as a placeholder block) | Quest map `[pending #26]`, Scylla's model `[pending #27]`, the other stops `[pending #37]` |
| Screens | Title, style select, name banner, win and loss overlay with the score | Intro line and finished screens `[pending #16]`; calibration countdown and "step back" pause `[pending #8]` |
| God scan, divine power | Only the fields in the shared contracts | `[pending #20]`, `[pending #30]` |
| Server (Gemini, ElevenLabs) | Nothing | `[pending #2]` (a first server is on a branch, not merged) |
| Two players, online rooms | Only the fields in the shared contracts | `[pending #28]`, `[pending #29]` |

## Before the judge steps up

- `make dev` is running and the tab is on the title screen, full screen. No network is needed.
- Tape a mark on the floor where the corner preview shows a standing person from head to hips. Settle the distance during tuning `[pending #17]` and check it again in the judging room's light.
- The presenter stands beside the laptop, out of the camera's view. The tracker follows one body only.
- Volume up. Every fight event makes a sound.
- Keep one hand near the keyboard. Keys work during a webcam fight, so you can cover for the judge without restarting.

## The script

About 300 spoken words. The judge is busy, so say less than you want to. The fight is paced by a test to last 90 to 150 seconds for a player who gets most prompts right, which leaves about 35 seconds before it and 20 after.

### 0:00 to 0:20. Step up

**Judge:** stands on the tape. The presenter clicks "Fight with your body (webcam)" and allows the camera.

**Say:** "This is Odyssey Fighter. You are Odysseus, sailing home from Troy to Ithaca. There is no controller: the laptop camera tracks your body, and you fight the monsters he met, in the order he met them. Stand on the tape so the small picture in the corner shows you from head to hips."

- `[pending #20]` Add: "First the camera looks at you and names the Olympian you take after." **Today:** skip it.
- `[pending #26]` Point at the map: "This is the route. The first stop is the Cyclops's cave." **Today:** say "The first stop is the Cyclops's cave, Book 9" with no map.

### 0:20 to 0:35. Pick a style, meet the Cyclops

**Judge:** picks Boxer. The banner reads "Polyphemus, The Cyclops of the Cave" for a second and a half.

**Say:** "Pick Boxer. That is how Odysseus fought the beggar Irus in his own hall. Now stand still with your arms down while his name is up. The game is measuring where your shoulders rest, so it can tell a dodge from standing."

Steer the judge to Boxer: it is the style the pacing test plays, and each of its strikes uses one arm.

### 0:35 to 1:15. The Cave: the two beats

**Judge:** a red card names a defense; they hold it until the blow lands. A gold card names a strike and a weak spot lights up; they throw it.

**Say, during the first exchange:** "Every exchange is two beats. Red card: he is winding up, and the card names what stops it. Hold it until the blow lands. Gold card: a weak spot is lit. Throw the strike it names."

Then be quiet for two or three exchanges. If the judge freezes, read the card to them: "Lean right. Hold it."

**Say, about 1:00:** "The bronze figure in front of you is you, drawn from the camera's 3D body points. And look at the card: after two clean reps of a move it drops the drawing and the hint. After five it is only the timer bar. The game stops telling you what you already know."

### 1:15 to 1:55. The Club

**Judge:** keeps fighting. `[pending #5]` At two thirds health he changes phase and starts throwing boulders, which must be ducked.

**Say:** `[pending #5]` "He is under two thirds health, so this is his second phase, The Club. He throws boulders now, so you have to duck, and his warnings are shorter."
**Today:** all four attacks come from the first exchange and the timing never changes. Say instead: "He has four attacks and each has one answer. Lean away from the club, block the grab, duck the boulder."

**Say, while they fight:** "While you fight: the rules of this fight are one pure function. There is no camera, no graphics and no clock in it, so a key and a punch look the same to it, and we test it without a browser. One test plays thirty whole fights against him and fails if they do not last between 90 and 150 seconds."

- `[pending #14, #15]` When Athena speaks: "That voice is Athena. She coaches Odysseus through the whole poem, and here she names the move you missed." **Today:** there is no voice. You are the coach.

### 1:55 to 2:35. Blinded

**Judge:** `[pending #5]` under 30 percent health he stops grabbing and swings fast.

**Say:** `[pending #5]` "Under a third. He cannot see to grab you now, so it is wild swings and boulders, with about half the warning you had at the start."
**Today:** say nothing about phases. Say: "Your hits are getting heavier. Each hit in a row adds ten percent, up to fifty, and a missed opening resets it."

- `[pending #23]` "The word after each hit, GOOD, GREAT or PERFECT, is how well you threw it. A better strike does more damage." **Today:** skip it.

### 2:35 to 2:55. The stake

**Judge:** `[pending #6]` his health is at zero and the card reads DRIVE THE STAKE. Both hands together at the chest, then driven forward and down.

**Say:** `[pending #6]` "His health is gone but he is still standing. Both hands together at your chest, then drive them forward and down. That is the sharpened olive stake going into his eye, the way Odysseus ends it in Book 9."
**Today:** the fight ends when his health reaches zero. Say: "In the poem this ends with the olive stake in his eye. That move is built and tested; making it the last blow is the next change to the engine."

### 2:55 to 3:00. Close

**Judge:** reads "Polyphemus falls" and their score.

**Say:** "Polyphemus falls. That is the first stop on the way home. Everything you just did ran in this browser tab, with no network."

Do not click "Next fight". Scylla is data only and is drawn as a placeholder block `[pending #27]`.

### If the time runs differently

- **The judge loses** ("You are struck down"): click "Try again". Say: "Odysseus lost six men in that cave. Go again."
- **The judge wins with time left:** click "Change style" and let them try Hoplite: both hands thrust forward together, or the right hand raised and chopped down.
- **It is 2:45 and he is still standing:** let them finish the exchange, then say the close line. Do not cut a judge off mid-swing.

## If the camera fails

**The camera will not start** (permission refused, no camera, pose files missing). The game handles it: it shows "No camera available, so you're on keyboard controls." and goes on to style select.

**Say:** "The camera is not coming up, so you are on the keys. It is the same fight. The engine cannot tell a key from a punch."

| Move | Key |
|---|---|
| Block | Space (hold until the blow lands) |
| Dodge left, dodge right | Left arrow, Right arrow (hold) |
| Duck | Down arrow (hold) |
| Jab, cross, left hook | J, K, L |
| Spear thrust, overhead strike | U, I |
| Stake thrust | O (only once the finisher lands, `[pending #6]`) |

**Tracking drops in the middle of a fight** (bad light, too close, someone walks behind). Do not restart. Hold the defense key for the judge yourself.

**Say:** "Step back onto the tape. I will cover your defense from the keys for a moment."

- `[pending #8]` The game pauses with "step back, I can't see you". **Today:** there is no pause; the keys are the cover.

**The tab breaks.** Reload, choose "Keyboard only", pick Boxer. If that fails too, play the backup recording `[pending #21]`.

## Where the theme lands

- **The route home.** The fights are the monsters Odysseus met, in the order he met them: the Cyclops (Book 9), Circe (Book 10), the Sirens, Scylla and Charybdis (Book 12), then the suitors in Ithaca (Book 22). Each win opens the next. Say it at 0:00. **Today:** two stops exist, Polyphemus and Scylla as data; the map is `[pending #26]` and the other stops are `[pending #37]`.
- **Polyphemus and the stake.** His weak spot is "his one eye". He swings a club, grabs, and throws boulders, as he throws them at the ship in the poem. His phases are named The Cave, The Club and Blinded. The fight ends on the sharpened olive stake. Say it at the banner and at 2:35. **Today:** phases and the stake are data and a tested detector; the engine does not use them yet `[pending #5, #6]`. His taunts ("Nobody? I will eat Nobody last!") are written but not shown or spoken `[pending #14, #15]`.
- **Athena as coach.** In the poem Athena stands beside Odysseus and tells him what to do next. In the game she is the coach's voice: she names the move you missed. Her clips are made ahead of time, so she speaks with no network. Say it the first time she speaks. All of it is `[pending #14, #15]`.
- **The gods in disguise.** In the poem the gods rarely arrive as themselves: Athena comes as Mentor, as a girl, as a shepherd. We turn that around. The camera looks at the player and names the Olympian they take after, and that god grants one power for the fight. Say it at 0:10. All of it is `[pending #20, #30]`.
- **The styles.** Boxer is Odysseus against Irus (Book 18). Hoplite is spear and shield, the way the Greeks fought at Troy. Both are built.

## If you only get three sentences in

1. **Robustness:** every move has a key, the camera and the keys feed the same tested engine, and nothing in the fight needs a network.
2. **Theme:** it is Odysseus's route home, one monster per stop, and this stop ends the way Book 9 does.
3. **Creativity:** the prompts shrink as you learn, so by the end you are reading the monster and not the card.

## The ten questions

**1. What happens if the camera fails?**
Every move has a key, and the camera and the keyboard are merged into one input every frame, so the fight carries on from the keys without a restart. If the camera cannot start at all, the game says so and puts you on keyboard controls by itself. `[pending #8]` If you step out of view the fight pauses and asks you to step back. **Today:** there is no pause yet.

**2. Does it need the internet or a server?**
No. Pose tracking runs in the browser from model files that setup copies onto the laptop, and the fight makes no network calls. `[pending #2]` The server is optional and only adds the Gemini and ElevenLabs features; our rule is that a full fight plays with the server off.

**3. How do you know it works?**
The fight rules are a pure function: state, input and elapsed time go in, the new state and a list of events come out. That lets us test them in plain Node. There are 18 tests on `main` as of this draft: one plays 30 simulated fights against Polyphemus and fails unless they average 90 to 150 seconds, and another fails if any monster or style names a move that does not exist. What the tests cannot tell us is how the detectors behave on a real body in this room's light; that is tuning by hand `[pending #17]`.

**4. How does the pose tracking work?**
Google's MediaPipe pose model (the lite one) runs in the browser on each new webcam frame and returns 33 body points, both as positions in the picture and as 3D positions in metres from the hips. We mirror them so your left is the screen's left and keep the last second of frames. Each move is a small function over that second that returns how sure it is, from 0 to 1.

**5. How does it tell a jab from a cross, and will it work on someone my size?**
A jab is the left elbow going from bent to straight at shoulder height inside 450 milliseconds while the right arm stays back; a cross is the same on the right, and both arms together is a spear thrust. Distances are measured in your own shoulder widths, and dodges and ducks are measured against your own resting stance, so height and distance from the camera should cancel out. We have not yet tuned it on all three of us `[pending #17]`, and it tracks one person, so nobody should stand behind you.

**6. Where is the Odyssey in this?**
The fights are the monsters Odysseus met, in the order he met them, and each is built from its episode: Polyphemus's weak spot is his one eye, he throws boulders, and his fight ends on the olive stake `[pending #6]`. You also win the way Odysseus does: you wait, read the attack, and strike the one opening. `[pending #14, #20]` Athena coaches you as she coaches him, and the camera names the god you take after.

**7. What is new here?**
The fight teaches. The prompt card shrinks as you get a move right, from a drawing with a hint, to one word, to only a timer, so by the end you are reading the monster. The moves are real ones (guard, slip, duck, jab, cross, hook), always defend first and then counter. And it needs only a laptop webcam and a browser tab: no depth camera, no controller, nothing to install.

**8. Does it really teach you to fight?**
It teaches the shape and timing of a move: hands up before the blow lands, weight across on a dodge, a straight arm on a jab. It cannot teach contact, distance or power, and it does not replace a coach. `[pending #23, #24, #36]` Scoring how well a strike is thrown, a ghost outline to line up with, and one line per move on what it is for are how we take it further.

**9. What do Gemini and ElevenLabs do, and where does my picture go?**
Neither is part of the fight. `[pending #20]` Gemini does the god scan: one webcam snapshot goes to our server and a god comes back, with a fallback in the browser that uses body measurements. `[pending #14, #15]` ElevenLabs makes Athena's voice as clips generated ahead of time, so they play offline. Pose tracking itself runs on this laptop and sends no video anywhere, and the API keys stay on the server, never in the browser.

**10. What would you build next?**
The rest of the route: Circe, the Sirens, Scylla, Charybdis and the suitors, each with its own finishing move. Then kicks and a Pankration style, two players on one camera who strike together for double damage, and rooms so a friend can join from another laptop. After that, difficulty that adapts to the player.

**Spare: how did three people build this in a weekend?**
Each of us ran a coding agent, and we treated the three agents like three more teammates: one issue per task, each issue listing the files it may touch, and one shared contracts file agreed first. Moves, monsters and styles are one file each and register themselves, so two people rarely edit the same file. No code is copied from earlier projects.
