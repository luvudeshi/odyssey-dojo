# Homer's narration and the monsters' taunts

Homer speaks one line before each stop of the quest and one after it is won. Each monster has a few spoken taunts. All of it is recorded ahead of time, so the game speaks with no network and no server.

The script lives in `src/audio/narrationLines.ts` (new lines) and `src/audio/storyLines.ts` (the lines recorded first). The tables below must match those files exactly; `tests/narrationLines.test.ts` fails if they differ. Ids are fixed: clips are named after them.

Homer's lines are our own words, not a translation. Each is about 20 words and says what happens at that stop in the Odyssey. Every taunt is copied word for word from the `taunts` of that monster's file in `src/enemies/defs/`.

## Where the clips are

| Folder | What | Index |
|---|---|---|
| `public/audio/narration/` | Homer's 11 new lines | `public/audio/narration/index.json` |
| `public/audio/taunts/` | 13 new taunts | `public/audio/taunts/index.json` |
| `public/audio/athena/` | The 4 Homer lines and 4 Polyphemus taunts recorded first | `public/audio/athena/index.json` |

The game only asks for clips an index lists, and stays silent for the rest. The 24 new clips are 2.2 MB together. Each is between 2.7 and 8.8 seconds.

## New lines

| id | speaker | when it plays | text |
|---|---|---|---|
| `homer_after_polyphemus` | Homer | After the Polyphemus fight is won | Blinded, the Cyclops hurled a crag after their ship, and begged his father Poseidon to curse the long road home. |
| `homer_before_circe` | Homer | Before the Circe fight | In her hall Circe turned his men to swine. But Hermes gave Odysseus moly, the herb no spell can master. |
| `homer_after_circe` | Homer | After the Circe fight is won | Circe cried out and swore the great oath. She turned the swine back into men, and feasted them a full year. |
| `homer_before_sirens` | Homer | Before the Sirens fight | He stopped his men's ears with wax, and they bound him to the mast. Then the Sirens began to sing. |
| `homer_after_sirens` | Homer | After the Sirens fight is won | He begged to be set free, but the crew rowed on and bound him tighter, until the song died astern. |
| `homer_before_scylla` | Homer | Before the Scylla fight | In a cave above the strait waited Scylla: six heads on six long necks, each with three rows of teeth. |
| `homer_after_scylla` | Homer | After the Scylla fight is won | Six heads, six men. She took the best of the crew, and they cried his name as the ship ran on. |
| `homer_before_charybdis` | Homer | Before the Charybdis fight | Across the strait Charybdis drank the dark sea down, then spewed it up seething, like a cauldron on a great fire. |
| `homer_after_charybdis` | Homer | After the Charybdis fight is won | The ship was gone. He hung from the fig tree like a bat, until she gave his timbers back. |
| `homer_before_suitors` | Homer | Before the fight with the suitors | In beggar's rags he strung the great bow no suitor could bend, and the string sang like a swallow. |
| `homer_after_suitors` | Homer | After the fight with the suitors is won | So the hall fell silent. Odysseus, sacker of cities, was home, and Penelope knew him by the secret of their bed. |
| `taunt_circe_1` | Circe | Circe taunts the player | Drink, stranger. You have come a long way. |
| `taunt_circe_2` | Circe | Circe taunts the player | To the sty with you. Lie down with your friends. |
| `taunt_circe_3` | Circe | Circe taunts the player | No man has ever tasted this and kept his mind. |
| `taunt_sirens_1` | The Sirens | The Sirens taunt the player | Come closer, Odysseus, pride of the Achaeans. Stay your ship and hear us. |
| `taunt_sirens_2` | The Sirens | The Sirens taunt the player | No one rows past until he has heard the sweetness of our song. |
| `taunt_sirens_3` | The Sirens | The Sirens taunt the player | We know all that was suffered at Troy. We know everything that happens on the earth. |
| `taunt_scylla_1` | Scylla | Scylla taunts the player | Six of your crew. That is the toll. |
| `taunt_charybdis_1` | Charybdis | Charybdis taunts the player | Three times a day she drinks the sea, and three times gives it back. |
| `taunt_charybdis_2` | Charybdis | Charybdis taunts the player | Not even the Earth-shaker could pull you out of there. |
| `taunt_charybdis_3` | Charybdis | Charybdis taunts the player | Hold to the fig tree. Hold until she gives your timbers back. |
| `taunt_suitors_1` | The Suitors | The suitors taunt the player | Stand off from my table, beggar, or you will be sorry you came. |
| `taunt_suitors_2` | The Suitors | The suitors taunt the player | Stranger, you have shot your last. The vultures will have you here. |
| `taunt_suitors_3` | The Suitors | The suitors taunt the player | Friends, draw your swords and hold the tables up against his arrows! |

Scylla has one taunt because her file has one, so the "two or three taunts per monster" point of issue #86 is still open for her. When `src/enemies/defs/scylla.ts` gets more, add `taunt_scylla_2` and `taunt_scylla_3` to `TAUNT_LINES` and to this table, run the clip tool again, and change Scylla's range in `tests/narrationLines.test.ts` from `[1, 3]` to `[2, 3]`.

## Lines recorded first

Polyphemus's "before" line is `homer_intro_polyphemus`. It was not recorded a second time.

| id | speaker | when it plays | text |
|---|---|---|---|
| `homer_title` | Homer | The title screen | Sing, Muse, of the man who fought his way home to Ithaca. |
| `homer_intro_polyphemus` | Homer | Before the Polyphemus fight | They came to the land of the Cyclopes, who know no law. And in his cave the giant Polyphemus rolled a great stone across the door. |
| `homer_win` | Homer | A fight is won | So the monster fell, and the long road home lay open once more. |
| `homer_loss` | Homer | A fight is lost | But the gods are patient, and so is the sea. Rise, and fight again. |
| `taunt_polyphemus_1` | Polyphemus | Polyphemus taunts the player | Nobody? I will eat Nobody last! |
| `taunt_polyphemus_2` | Polyphemus | Polyphemus taunts the player | My father Poseidon will hear of this. |
| `taunt_polyphemus_3` | Polyphemus | Polyphemus taunts the player | Strangers, the door is stone. You leave when I am fed. |
| `taunt_polyphemus_4` | Polyphemus | Polyphemus is blinded | Nobody is killing me! Nobody! |

## Who speaks

All ElevenLabs voices, model `eleven_v4`. The names tried for each speaker are in `server/ai/voices.ts`. The voice below is the one this account had when the clips were made. Set the variable in `.env` to force another voice id.

| Speaker | Voice used | Why | Variable |
|---|---|---|---|
| Homer | George | Warm storyteller, the same voice as his first lines | `HOMER_VOICE_ID` |
| Circe | Lily | A woman, smooth and sure of herself | `CIRCE_VOICE_ID` |
| The Sirens | Jessica | A woman, bright and inviting | `SIRENS_VOICE_ID` |
| Scylla | Harry | Low and rough | `SCYLLA_VOICE_ID` |
| Charybdis | Brian | Low and slow | `CHARYBDIS_VOICE_ID` |
| The Suitors | Liam | A young man | `SUITORS_VOICE_ID` |
| Polyphemus | The `monster` voice. His clips were not redone | Deep and menacing | `MONSTER_VOICE_ID` |

## Making the clips again

```bash
npx tsx --env-file=.env server/tools/genClips.ts story          # only the clips that are missing
npx tsx --env-file=.env server/tools/genClips.ts story --force  # every clip in the two new folders
```

The tool writes both `index.json` files. It does not touch the lines recorded first.

## How the game speaks them

`src/audio/storyVoice.ts` speaks Homer's lines through Athena's voice, so those two are never heard together. A monster's taunt has a channel of its own, a second audio element, so it is heard over Athena's calls. Each function returns a promise that never rejects. It resolves `true` once a line that started is over, even if it was cut short, and `false` when it never started.

- `speakNarration(enemyId, "before" | "after")`: Homer's line for that stop. If another story line is playing it is cut off first. Then it waits up to 6 seconds for Athena to finish.
- `speakResult(enemyId, won)`: on a win, the stop's "after" line (or `homer_win` for a fight with none). On a loss, `homer_loss`. It waits for Athena's own result line to end.
- `speakMonsterTaunt(enemyId)`: one of that monster's taunts, picked at random. It starts at once, at 0.7 of Athena's volume (`TAUNT_VOLUME` in `src/audio/voice.ts`). Athena's calls play over it and do not cut it, and it never delays her. Only one taunt plays at a time: a second one asked for meanwhile is not played. It resolves `false`, or joins the playing taunt and resolves `true` when the dice pick that same taunt. `playVoice` silences the taunt in the frame the fight is won or lost, so the result lines are heard clean. Ask for the taunt before `playVoice` in a frame, as FightScreen does: a taunt asked for after `playVoice` in the frame the fight ends would play over the result line.
- `stopStory()`: drops a line that is still waiting and cuts off a story line or a taunt that is playing. Athena's lines are left alone.

Asking for a line that is already waiting or playing joins it, so it is heard once. Asking again after it is over speaks it again, so call these from an effect that runs once per screen, not on every frame.

### The wiring, and why the cleanup is required

The screens call these since PR #144: IntroScreen and EndPanel through `narrateIntro` and `narrateResult` in `src/screens/hookups.ts`, and FightScreen directly. The lines are:

```tsx
// src/screens/IntroScreen.tsx: narrateIntro calls speakNarration(enemy.id, "before") and returns stopStory
useEffect(() => narrateIntro(enemy.id), [enemy.id]);

// src/screens/EndScreen.tsx, in EndPanel: narrateResult calls speakResult(enemyId, won) and returns stopStory
useEffect(() => narrateResult(enemyId, won), [enemyId, won]);

// src/screens/FightScreen.tsx, inside result.events.forEach, before playVoice
if (event.type === "phaseChanged" && event.index > 0) void speakMonsterTaunt(enemy.id);
// and stopStory() in that effect's cleanup, so a taunt does not play on into the next screen
```

`return stopStory` is required, not optional. Homer's new lines are 6 to 9 seconds long and wait up to 6 seconds for Athena. Without the cleanup:

- A line still waiting when the screen is left starts inside the next fight. For example `homer_loss` after "Fight again".
- A before-line still playing when the fight begins holds the voice, so Athena's `fight_start` is refused.

One case is safe even without it: a new Homer line cuts off an older story line, so the next intro is not silent while the last result line plays on.

A taunt in a fight plays whole, under Athena's calls. Taunts are 2.7 to 5.8 seconds long and her calls come every 0.7 to 3 seconds, so two or three calls are spoken over each taunt. `tests/voicePriorities.test.ts` checks this with stand-in audio and a fake clock. Nobody has listened to the two voices together in a real fight yet. If the taunt is too loud or too quiet under her, change `TAUNT_VOLUME`.
