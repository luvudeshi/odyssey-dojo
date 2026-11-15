# Pitch: three minutes at the table

What the presenter says while one judge plays the Polyphemus fight, what to do when something fails, and answers to the ten questions we expect in the two minutes after. The Devpost text is in [devpost.md](devpost.md).

**How to read this draft.** It was checked against `main` at commit `de77074` (Saturday afternoon). Anything tagged `[pending #N]` is not on `main` yet; N is the issue that will add it. Before judging, go through every tag. If the feature landed, delete the tag. If it did not, say the "Today" line next to it and never the pending one. The button, screen and key names, and which features a screen shows, were checked again against `main` at commit `f1ac86d` (Sunday morning); the fight lengths, word counts and test counts were not.

The ElevenLabs and Gemini parts (sound, Athena, Homer and the taunts, the god scan, the server) were checked again against `main` at commit `fd14780` and use two more tags. `[if wired]` means the code is on `main` but no game screen calls it yet, so the judge does not see or hear it. `[if built]` means it is not on `main` at all. Treat both like `[pending]`. The file paths and counts behind these parts are in the two sponsor sections of [devpost.md](devpost.md).

The fight lengths quoted here come from the pacing test's own simulated player (`tests/content.test.ts`: 30 fights as Boxer), run against the engine at that commit. Measure them again if Polyphemus's health or timing changes.

## What is true today

| Part of the pitch | On `main` now | Not yet |
|---|---|---|
| Webcam play | MediaPipe pose tracking in the browser, one detector per move, a bronze figure that mirrors the player in 3D. Detectors are tested on made-up pose sequences | Proven on a real body `[pending #7]`, tuned on all three of us `[pending #17]` |
| Keyboard fallback | A key for every move. Keys and camera are merged every frame. If the camera cannot start, the game says why and offers "Try the camera again" or "Play on the keyboard". With Caps Lock on the letter keys do nothing (bug 2 in [playtest.md](playtest.md)) | Nothing |
| Styles | Boxer (jab, cross, hook, uppercut), Jiu-jitsu (double palm, rising palm, knife hand), Karate (reverse punch, knife hand, hammer fist), Kung Fu (double palm, chain punch, rising palm), Taekwondo (front kick, knee, hammer fist, uppercut). Polyphemus's weak spots name strikes of all five styles, the Boxer's uppercut among them; they leave out the knife hand (Karate and Jiu-jitsu) and Kung Fu's chain punch | Nothing |
| The two-beat fight | Defend, then strike. Combo, score, a card that shrinks as a move is learned | The ghost outline is on `main` but switched off; only the address `?ghost=1` shows it. "What each move is for" is on the result screen, not in the fight |
| Polyphemus | 3D model, 162 health, four attacks, two weak spots. Three phases run in the engine: The Cave, The Club from two thirds health, Blinded from 30 percent. Each changes which attacks he uses and how long the warning is, and a sound marks the change | A look that changes per phase and a tell of its own for each attack `[pending #11]`. The phase's numeral and name show for a moment when it changes, and one of his four taunts plays then |
| The stake | At zero health he stays standing and the card reads DRIVE THE STAKE. Only that move ends the fight, the player cannot lose there, and the card comes back every six seconds until it lands | Nothing in the engine. Thrown by a real body: `[pending #7]` |
| Strike quality | The engine scales damage from half to one and a half times by a 0 to 1 quality. GOOD, GREAT or PERFECT flashes after a strike lands | Which moves measure their own quality was not checked again at `f1ac86d` |
| Arena and hit feel | A torch-lit cave, sparks and a flash where he is hit, a camera shake and a red edge flash when the player is hit. Q switches between high and low graphics, and the choice is saved. The player's own character, chosen on "Choose your character", stands in the scene | Nothing |
| Sound | One clip per fight event, eleven in all, made ahead of time with the ElevenLabs sound generation API and played from local files by the fight screen. Eight of the eleven also have a sound synthesised in code, which plays if the clip fails to load; the phase change, the finishing blow and the god power have none | Music plays on the menus, in the fight and at the result. Nobody has logged listening to a fight |
| Athena | A script of 50 short lines, a clip for each made ahead of time with ElevenLabs text to speech. The fight screen plays them: she calls each defense, each strike and the stake, praises a hit, warns after one, and announces each later phase with a line written for that monster, the win and the loss. The next defense call cuts a phase line after about 0.7 s | Her fight start line now plays as the fight opens, and her god-power calls when the meter is full. Her jump call was not checked again. "Defend yourself!" is only a stand-in for a defense with no clip, and every defense has one, so it is not heard either. Nobody has logged listening to a fight |
| Homer and the taunts | Four lines for Homer as narrator (title, before Polyphemus, win, loss) and Polyphemus's four taunts, as clips beside Athena's, with tested playback | The screens now play them: one of Homer's opening lines on "Story mode", his line before a stop and at the result, and a taunt at each later phase. The other stops have narration lines too. Nobody has logged hearing them |
| The route | Six stops, each with a model, on the quest map "The Road Home": Polyphemus, Circe, the Sirens, Scylla, Charybdis, the Suitors. Every stop is open from the start | Nothing |
| Screens | Main menu (Story mode, Multiplayer, Training Dojo, Account), "Choose your character", "Choose your fighting style", the quest map, a cutscene with the monster's name, a 3-second calibration count, a pause when the player steps out of view, the Esc pause menu, win and loss panel with the score | Nothing |
| God scan | The scan screen, the Gemini call behind it and a scan that runs in the browser with no network are on `main` and tested with a fake model. Only the test page `src/ai/lab/index.html` opens the screen | Opened by the game `[if wired]` |
| Divine power | The meter and the six god gestures are in the engine (`tests/divinePower.test.ts`) and the fight screen draws the meter (`src/hud/PowerCircle.tsx`). Any of the six gestures spends a full meter while a defend or strike card is up | Limiting it to the player's own god needs the god scan `[if wired]`. With no scan every fight's power is Athena's |
| Server (Gemini, speech made on demand) | An optional server in `server/`, started with `npm run dev:all`: the god scan and its portrait, a level written from a sentence, and speech made on demand. With no key or no network each one falls back or stays silent, and the game plays with the server off | The god scan called by a game screen `[if wired]`. The Multiplayer rooms need the server. The fight written from a sentence is played only at the address `?ai=1`, not from the menu |
| Two players, online rooms | The engine doubles the damage when two players land the same strike together, and that is tested. "Multiplayer" on the main menu hosts or joins a room, and the guest's strikes join the fight | Two players on one camera: the code is in `src/duo/` and no screen uses it |

## Before the judge steps up

- Confirm `public/mediapipe/pose_landmarker_lite.task` exists, then play one webcam exchange with Wi-Fi off. Setup downloads that file once, and a failed download only prints a warning, so a laptop that was set up offline gets only the "The camera did not start" card.
- `make dev` is running and the tab is full screen. Click "Story mode" and allow the camera yourself, click "Fight as" and the name on "Choose your character", then wait on "Choose your fighting style". The camera prompt and the model load are then over before the judge's three minutes start, and that click is what lets the browser play sound.
- Caps Lock off.
- Play one keyboard fight through to the stake and the win screen on the demo laptop. The run logged in [playtest.md](playtest.md) predates the stake and did not reach a win.
- Tape a mark on the floor where a standing person shows from head to hips. The camera picture only shows during the calibration count and the fight, so find the spot in a test fight. Settle the distance during tuning `[pending #17]` and check it again in the judging room's light.
- The presenter stands beside the laptop, out of the camera's view, and reaches in from the side to click. The tracker follows one body only.
- Volume up. Every fight event plays a sound.
- If the picture stutters in the test fight, press Q once for low graphics. The choice is saved, so it holds after a restart and a reload; the game also drops to low by itself after a few seconds of slow frames.
- Keep one hand near the keyboard. Keys work during a webcam fight, so you can cover for the judge without restarting.
- Check that the demo laptop registers Space and three arrows held together (see "Covering from the keys").
- At the win screen the buttons are "Back to the map", "Your hero card" and "Change style". There is no "Next fight" button now, and Scylla has a model.

## The script

**The presenter clicks everything. The judge never leaves the tape.** If the judge walks up and clicks, the calibration count can measure their resting stance before they are back on the tape, and every dodge and duck in the fight is judged against that.

**Follow his health bar, not the clock.** The fight does not run to a fixed length. The pacing test bounds the average of 30 simulated fights (90 to 150 seconds, at least 24 won), not each fight. What the simulation gives at this commit:

| Player | Result |
|---|---|
| The test's player: 85 percent of prompts right, 0.8 seconds to strike | Wins in about two minutes on average; single fights run from 75 to 160 seconds |
| A slower player: 70 percent right, a full second to strike | Loses 21 fights of 30, about two and a half minutes in. The 9 wins take 2:20 to 3:20 |
| A covered player: 95 percent right | Wins in 70 to 105 seconds |

So a first-time judge left alone will most likely lose near the three-minute mark. The plan is to start the fight by 0:20 and to take over the defense from the keys in the last third, or sooner if the judge is losing. The clock times below are for the test's player with the fight starting at 0:20.

| Cue | Clock, on average | Clock, range |
|---|---|---|
| Fight starts | 0:20 | |
| His bar drops to two thirds: The Club | 1:10 | 0:50 to 1:40 |
| His bar drops to 30 percent: the last phase | 1:50 | 1:15 to 2:25 |
| His bar is empty: the stake card | 2:15 | 1:35 to 3:00 |

Spoken words on the main path: 203 today, 225 with every tagged line in. At 150 words a minute that is about 80 and 90 seconds of talking, which leaves room to call moves and for Athena's clips. The count is next to each line; keep it honest when you edit.

### 0:00 to 0:20. Step up

**Judge:** stands on the tape. The tab is already on "Choose your fighting style".

**Say (34 words):** "This is Odyssey Dojo. You are Odysseus, fighting your way home from Troy. No controller: the camera tracks your body. First stop is the Cyclops's cave. Stand still, arms down, until his name clears."

Then click Boxer, click Polyphemus on the map ("The Road Home") and say nothing through the cutscene with his name (about 5 seconds; any key or a click skips it) and the "Stand still, arms down" count (3 seconds). The game takes the resting stance at the end of that count and does not measure it again in that fight.

- The "Stand still, arms down" countdown is on `main`: the screen shows it for 3 seconds before the fight, and the line above prepares the judge for it.
- `[if wired]` Add after "your body" (6 words): "First the camera names your god." That makes 40 words before the fight; add no more. **Today:** skip it. The god scan is on `main` but the game does not open it.
- The map is on `main`, but it shows only after you click Boxer, so it is not up while you say "First stop". Point at it when it appears. No extra words.

Boxer is the style the pacing test plays, and each of its strikes uses one arm.

### About 0:20 to 1:10. His bar is full. The Cave: the two beats

**Judge:** a red card names a defense; they do it once before the blow lands. A gold card names a strike and a gold ring marks the weak spot; they throw it. In this phase he swings and grabs, with over two seconds of warning.

**Say on the first red card (9 words):** "Red card: do what it says before he hits."

**Say on the first gold card (10 words):** "Gold card: his weak spot is lit. Throw that strike."

Then be quiet for three exchanges. If the judge freezes, read the card to them: "Lean right." If they miss the first one, let it go; the next card teaches the same thing.

**Say after those (24 words):** "Watch the card shrink. After two clean reps the drawing goes. After five it is only a timer, and I will call the move."

From here on, call any move whose card is only a timer bar (see "When the card is only a bar"). For the test's player the first one arrives about 50 seconds into the fight.

### About 1:10 to 1:50. His bar is under two thirds. The Club

**Judge:** hears the phase sound. He now throws boulders as well, which must be ducked, and every warning is about a quarter shorter.

**Say at the sound (15 words):** "Second phase, The Club. He throws boulders now: duck them. And his warnings are shorter."

**Say while they fight (24 words):** "The rules of this fight are one pure function, with no camera or graphics in it, so we test whole fights without a browser."

**Say here, or sooner if the judge asks about the voice (14 words):** "That voice is Athena, his patron. She calls the move before you need it." She has been calling moves since the first card. Listen for her in the test fight before judging: if she is silent on the demo laptop, drop this line and be the coach yourself.

If the judge's own health is under half here, start covering the defense now and say so.

### About 1:50 to 2:15. His bar is under one third. The last phase

**Judge:** hears the phase sound. He stops grabbing and swings fast: a club swing lands 1.2 seconds after it starts.

**Say at the sound (24 words):** "Last phase. He is swinging wild, with half the warning you started with. I will cover your defense from the keys. You just hit."

Hold the defense keys from here to the end. Call the strike when the gold card is only a bar.

Do not say the phase's name, Blinded, out loud: the stake that blinds him comes after it (see "Open points for the lead"). The screen now shows the name for a moment.

- GOOD, GREAT or PERFECT now flashes after a hit, so this line can be said after a rated hit (16 words, not counted in the 203 above): "The word after each hit is how well you threw it. Better strikes do more damage."

**Clock check at 2:15.** If his bar is still above one third, throw the strikes from the keys as well and say "I will throw with you". For Boxer, pressing J, K and L together lands whatever the card wants.

### About 2:15. His bar is empty. The stake

**Judge:** he is still standing and the card reads DRIVE THE STAKE with its drawing. Both hands together at the chest, then driven forward and down. They cannot be hit here, and the card comes back every six seconds until the move lands.

**Say (30 words):** "His health is gone but he is still standing. Hands together at your chest, then drive them forward and down. That is the olive stake into his eye, Book 9."

If two tries do not register, press T and say "I will drive it for you" `[pending #7: the stake has not been thrown by a real body yet]`.

### The close: as he falls, and no later than 2:50

**Judge:** reads "Polyphemus falls" and their score.

**Say (19 words):** "Polyphemus falls. First stop on the way home, and all of it ran in this tab with no network."

There is no "Next fight" button now. If the judge wants more, click "Back to the map" or "Change style" on the win screen.

### The other two endings

Plan for both. Without cover, the second is the likely one.

- **It is 2:45 and he is still standing.** Do not cut a judge off mid-swing. Let them keep fighting into the questions and say (30 words): "That is our three minutes. Keep going if you like. It ends with the olive stake in his eye, and all of it runs in this tab with no network."
- **The judge loses** ("You are struck down"). Say (11 words): "Odysseus lost six men in that cave before he got out." With 40 seconds or more left, tell the judge to stand still, click "Fight again" and cover the defense from the first card. With less, say (20 words): "The fight ends with the olive stake in his eye. All of it ran in this tab with no network."
- **The judge wins with time left.** Tell them to stand still, click "Change style", pick Jiu-jitsu and click the stop on the map again: both open palms pushed forward together, or the left palm driven up to chin height.

## Covering from the keys

The engine counts a defense if its key is down when the blow lands, whatever else is held. So you can hold more than one.

- **Everything:** hold Space, Left, Right and Down together. Not every laptop keyboard registers four keys at once; check before judging. This works because of bug 3 in [playtest.md](playtest.md). If that is fixed before judging, hold only the one defense the card or his arm calls for.
- **By his arm**, if four keys do not register. He raises the arm on the side you should lean to:

| What he does | Hold | Why two keys |
|---|---|---|
| The arm on the right of the screen goes up | Right arrow and Down arrow | It is a club swing (dodge right) or a boulder (duck). In The Cave it is always the club |
| The arm on the left of the screen goes up | Left arrow and Space | It is a club swing (dodge left) or a grab (block). In the last phase it is always the club |

- **Strikes:** a wrong strike key costs nothing. For Boxer press J, K and L together. The ring at his eye wants a jab or a cross; the ring at his gut wants a hook, a cross or an uppercut.

Say what you are doing: "I will cover your defense from the keys", "I will throw that one for you".

## When the card is only a bar

After five clean reps of a move its card is a thin timer bar with no word and no drawing, and his model does not say which move is wanted: the same arm goes up for a club swing and a boulder, and the same ring lights for a jab and a cross. In the simulation about 4 prompts in 10 are bars over a whole fight. Covering the defense from the keys makes it sooner, because a covered defense counts as a clean rep.

- Tell the judge early (the "Watch the card shrink" line), then call what you can tell. In The Cave the arm on the right always means "Lean right!". In the last phase the arm on the left always means "Lean left!".
- Where you cannot tell, hold both candidates from the table above and say "I have that one".
- Athena calls every defense and every Boxer strike by name ("Duck! Head down!"), so the judge is told even when the card is a bar. This is on `main` but nobody has logged hearing it; check it in the test fight, and keep calling the moves yourself if she is silent.
- `[pending #11, #24]` Each attack gets its own tell and the ghost outline shows the pose, so the judge can read the monster. **Today:** you are the tell.

## If the camera fails

**The camera will not start** (permission refused, no camera, pose files missing). You find this out before the judge steps up, because you start the camera first. The game shows "The camera did not start" with the reason and two buttons: click "Play on the keyboard" and it goes on to the character and style choice.

**Say:** "The camera is not coming up, so you are on the keys. It is the same fight. The engine cannot tell a key from a punch."

| Move | Key |
|---|---|
| Block | Space (hold until the blow lands) |
| Dodge left, dodge right | Left arrow, Right arrow (hold) |
| Duck | Down arrow (hold) |
| Boxer: jab, cross, left hook, uppercut | J, K, L, B |
| Jiu-jitsu: double palm, rising palm, knife hand | P, G, H |
| Karate: reverse punch, knife hand, hammer fist | R, H, M |
| Kung Fu: double palm, chain punch, rising palm | P, C, G |
| Taekwondo: front kick, knee, hammer fist, uppercut | F, N, M, B |
| Stake thrust | T (only when the card reads DRIVE THE STAKE) |

**A strike will not register.** While `#7` and `#17` are open this is the likeliest failure: the camera works and one move does not fire. Press that strike's key and say "I will throw that one for you." After three misfires of the same move, swap jobs: the judge keeps defending with their body and you throw every strike from the keys.

**Dodges or ducks misfire from the first exchange** (they fire while the judge stands still, or never fire). The resting stance was measured badly. Either cover the defense from the keys for the whole fight, or tell the judge to stand still, press Esc and click "Restart fight": it runs the calibration count again. A new fight measures a new stance. "Fight again" and "Change style" on the end screen also start a new fight and a new measurement.

**Tracking drops in the middle of a fight** (bad light, too close, someone walks behind). Do not restart. Hold the defense keys for the judge yourself.

**Say:** "Step back onto the tape. I will cover your defense from the keys for a moment."

- The pause is on `main`: after 0.7 seconds unseen the fight stops and says why ("I can't see you", for one), and it goes on a second after the judge is back. Pressing a move key while it is paused stops the pausing for that fight.

**The tab breaks.** Reload, click "Account", "Open settings", set "Play with" to "Keyboard", go back to the main menu, click "Story mode", confirm the character, pick Boxer. If that fails too, play the backup recording `[pending #21]`.

## Where the theme lands

- **The route home.** The fights are the monsters Odysseus met, in the order he met them: the Cyclops (Book 9), Circe (Book 10), the Sirens, Scylla and Charybdis (Book 12), then the suitors in Ithaca (Book 22). Each win opens the next. It lands in the first line. All six stops and the map are on `main`.
- **Polyphemus and the stake.** His weak spot is "his one eye". He swings a club, grabs, and throws boulders, as he throws them at the ship in the poem. His fight has three phases and cannot end until the sharpened olive stake is driven in. It lands at the stake card. His taunts ("Nobody? I will eat Nobody last!") are voice clips, and one plays at each later phase.
- **Athena as coach.** Athena is Odysseus's patron. She is not with him in the cave: in Book 13 he tells her he did not see her from the fall of Troy until Scheria. She plans the fight in his hall with him and stands beside him in it as Mentor (Book 22). In the game she coaches you from the first stop: she calls each move as it is needed. Her clips are made ahead of time, so she speaks with no network. It lands the first time she speaks. Her lines and clips are on `main` and the fight screen plays them.
- **The gods in disguise.** In the poem the gods rarely arrive as themselves: Athena comes as Mentor, as a girl, as a shepherd. We turn that around. The camera looks at the player and names the Olympian they take after, and that god grants one power for the fight. It lands before the style choice. The god scan is on `main` but the game does not open it `[if wired]`, so today nothing names the player's god.
- **The styles.** Boxer is Odysseus against Irus (Book 18). Jiu-jitsu, Taekwondo, Karate and Kung Fu are not Greek; their one-line descriptions tie them to the bow he strings in Book 21 and to his wits. If a judge asks, say that plainly: they are there so the player can choose how to fight.

## If you only get three sentences in

1. **Robustness:** every move has a key, the camera and the keys feed the same tested engine, and nothing in the fight needs a network.
2. **Theme:** it is Odysseus's route home, one monster per stop, and this stop ends the way Book 9 does: with the stake.
3. **Creativity:** the game teaches, then stops telling you what you already know: the card steps back from a drawing with a hint, to one word, to only a timer. `[pending #11, #24]` By the end you are reading the monster and not the card. **Today:** stop after "only a timer".

## The ten questions

**1. What happens if the camera fails?**
Every move has a key, and the camera and the keyboard are merged into one input every frame, so the fight carries on from the keys without a restart. If the camera cannot start at all, the game says why and offers the keyboard. If you step out of view the fight pauses and says what it needs, and goes on when it sees you again.

**2. Does it need the internet or a server?**
No. Pose tracking runs in the browser: the runtime is copied and the pose model is downloaded once at setup, and after that the fight makes no network calls and plays its sounds from local files. There is an optional server for the Gemini features and for speech made on demand, and in the game only the Multiplayer rooms, the account sign-in and Hall of heroes, sharing a hero card and the fight written from a sentence (`?ai=1`) use it; our rule is that a full fight plays with the server off.

**3. How do you know it works?**
The fight rules are a pure function: state, input and elapsed time go in, the new state and a list of events come out, so we test them in plain Node. One test plays 30 simulated fights against Polyphemus and fails unless they average 90 to 150 seconds with at least 24 won; another plays 1,000 random fights and fails if one never ends; another fails if a monster or style names a move that does not exist. (Read the test count off `npm test` on the day; it was 101 at this draft.) What the tests cannot tell us is how the detectors behave on a real body in this room's light: that is `[pending #7, #17]`.

**4. How does the pose tracking work?**
Google's MediaPipe pose model (the lite one) runs in the browser on each new webcam frame and returns 33 body points, both as positions in the picture and as 3D positions in metres from the hips. We mirror them so your left is the screen's left and keep the last second of frames. Each move is a small function over that second that returns how sure it is, from 0 to 1.

**5. How does it tell a jab from a cross, and will it work on someone my size?**
A jab is the left elbow going from bent to straight at shoulder height inside 450 milliseconds while the right arm stays back; a cross is the same on the right, and both arms together is a spear thrust. Distances are measured in your own shoulder widths, and dodges and ducks are measured against your own resting stance, so height and distance from the camera should cancel out. We have not yet tuned it on all three of us `[pending #17]`, and it tracks one person, so nobody should stand behind you.

**6. Where is the Odyssey in this?**
The fights are the monsters Odysseus met, in the order he met them, and each is built from its episode: Polyphemus's weak spot is his one eye, he throws boulders, and his fight cannot end until you drive in the olive stake. You also win the way Odysseus does: you wait, read the attack, and strike the one opening. Athena, his patron, coaches you by voice. `[if wired]` The camera names the god you take after.

**7. What is new here?**
The fight teaches. The prompt card shrinks as you get a move right, from a drawing with a hint, to one word, to only a timer. The moves are real ones (guard, slip, duck, jab, cross, hook), always defend first and then counter. And it needs only a laptop webcam and a browser tab: no depth camera, no controller, nothing to install.

**8. Does it really teach you to fight?**
It teaches the shape and timing of a move: hands up before the blow lands, weight across on a dodge, a straight arm on a jab. It cannot teach contact, distance or power, and it does not replace a coach. Rating how well each strike is thrown (GOOD, GREAT, PERFECT, on screen now), one line per move on what it is for (on the result screen now), and a ghost outline to line up with (built, switched off) are how we take it further.

**9. What do Gemini and ElevenLabs do, and where does my picture go?**
Pose tracking runs on this laptop and sends no video anywhere, and neither service is called during a fight. ElevenLabs made the sound ahead of time: the eleven fight sounds and Athena's 50 lines are files in the game, so they play with no network. The API keys stay on the server, never in the browser.
`[if wired]` Gemini is behind the god scan: one still picture goes through our server on this laptop to Google's Gemini API, and a god, an epithet and one sentence come back. **Today:** Gemini is behind a god scan that is on `main` and tested with a fake model, but the game does not open it, so no picture is taken at all.
If the judge asks how the scan treats a picture, these describe the code on `main` and need no tag as long as you say "the scan", not "the game": The scan sends the same picture once more to paint a portrait as a statue. Gemini is told to judge only the expression, stance, clothing colour and the energy of the pose, never body, age, face or attractiveness, and our server swaps any answer that uses a word about body, age, looks or gender for a fixed line. Our server holds the picture in memory only, never on disk or in a log, and sets Gemini's `store: false` so the request is not kept as a stored interaction; we have not checked what Google keeps beyond that. If the server is off, the browser picks the god from the stance and clothing colour and no picture leaves the laptop.
Gemini also writes a fight from a sentence you type. **Today:** that page is not on the menu; only the address `?ai=1` opens it, and the fight it writes can be played there.

**10. What would you build next?**
The rest of the route: Circe, the Sirens, Scylla, Charybdis and the suitors, each with its own finishing move. Then kicks and a Taekwondo style, two players on one camera who strike together for double damage, and rooms so a friend can join from another laptop. After that, difficulty that adapts to the player.

**Spare: how did three people build this in a weekend?**
Each of us ran a coding agent, and we treated the three agents like three more teammates: one issue per task, each issue listing the files it may touch, one shared contracts file agreed first, and every change through a branch and a pull request. Moves, monsters and styles are one file each and register themselves, so two people rarely edit the same file. No code is copied from earlier projects.

## Open points for the lead

These need a change outside this document. They are listed here because the pitch depends on them.

1. **The fight is longer than the judged slot for a first-time player.** If the judged fight must end inside three minutes without the presenter's help, Polyphemus's health (400) has to come down; the comment in the pacing test names `hp` as the knob.
2. **The card disappears after five clean reps** (bug 1 in [playtest.md](playtest.md), reported on `#24`). Either keep the word at the last level or give each of the four attacks its own animation `[pending #11]`. Until then the presenter calls the moves.
3. **The third phase is named Blinded, but the stake that blinds him comes after it.** A judge who knows Book 9 may notice. The name now shows on screen for a moment when the phase starts, and the script avoids saying it; renaming the phase is a data change in `src/enemies/defs/polyphemus.ts`.
4. **Athena's line at the third phase is "He is blind! Stay light!"** (`phase_2` in `src/audio/athenaLines.ts`). She is wired in now, so the judge hears point 3 said out loud before the stake.
5. **Athena's phase lines are cut short.** Each later phase of each of the six monsters now has its own line, picked by the phase's name, so only Polyphemus hears "He takes his club!". But the next defense call cuts the line after 0.7 s, the engine's pause after a strike (`RECOVER_MS` in `src/combat/engine.ts`), and the longest phase clip is 2.9 s. A pause of about 3 s after a strike that changes the phase would let the whole line be heard. The exact line is in a NEEDS comment on `#2`.
6. **Done: Homer, the taunts and Athena's fight start line are wired in.** The main menu speaks one of Homer's opening lines (`src/audio/titleLine.ts`), the fight screen calls `speakLine("fight_start")` and `speakMonsterTaunt`, and the map and the result panel call Homer's lines through `src/screens/hookups.ts`.
7. **One of the pacing test's 30 simulated fights never throws the stake** and runs to the test's ten-minute cap, which lifts the test's average from about 120 seconds to 136. The test still passes, but its average is closer to the 150-second limit than the fights are.
