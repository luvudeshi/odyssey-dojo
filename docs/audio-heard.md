# What the voice clips say

All 82 voice clips under `public/audio` (`athena`, `narration`, `taunts`), put through speech to text on 14 November 2026 and compared with the line each is meant to say. **This is a machine transcript, not a person listening.** Nobody on the team has listened to these clips. The check says which words a speech to text model made out. It does not say how a clip sounds.

The tool is `server/tools/hearClips.ts`. It needs `ELEVENLABS_API_KEY` and a network connection. It is not part of `make check`. It never prints the key.

```bash
npx tsx --env-file=<path to .env> server/tools/hearClips.ts            # the table: clip, verdict, expected, heard
npx tsx --env-file=<path to .env> server/tools/hearClips.ts --check    # the same; exits 1 when a clip differs
```

**After you add or replace a voice clip, run it again** (after `levelClips.ts --write`, which changes the file). Each clip is sent once. The transcripts are kept in `server/data/hear-clips.json`, which git ignores, under what was asked and the hash of the clip's bytes, so a second run sends only the clips that changed. `--cache=<file>` keeps them somewhere else.

## Result

| | same | differs | may be cut | unsure |
|---|---|---|---|---|
| First run, the clips as they were | 79 | 1 | 2 | not read |
| After `call_knee` was made again | 80 | 0 | 2 | not read |
| Now: all 82 sent again, with sound tagging on and the word probabilities read | 51 | 0 | 2 | 29 |

**Added after that run:** `narration/homer_homecoming.mp3`, Homer's closing line, made and levelled on the evening of 14 November 2026 and sent once: every word came back as written, with "last" at 0.89, so it reads "unsure?" like the 29 below. It is not in the counts or the tables of this page, which are the 82 clips of the run above. Nobody has listened to it either.

No clip has a word that speech to text heard differently from its line. **One clip is not confirmed all the same: `athena/call_knee.mp3`.** ElevenLabs hears "Knee"; a second engine hears "Me" more often than "Knee". A person has to listen to it.

"unsure" is new in the last row: the words came back right, but speech to text gave one of them a probability under 0.95. It is a weak signal (see "The 29 unsure clips"), and it is the only signal that pointed at `call_knee`.

## For a person's ear, most important first

Nothing below can be settled by a machine. On a Mac: `afplay public/audio/athena/call_knee.mp3`.

1. `athena/call_knee.mp3`: two engines disagree on the first word. Polyphemus has a weak spot for the knee, so a judge can hear this call.
2. `athena/fight_start.mp3`: the first line of every fight. The words are whole, but the file stops while the voice is still sounding. Listen for a click at the end.
3. `athena/call_chain_punch.mp3`: the second engine heard "Change Punch one two" in its one request. ElevenLabs heard "Chain punch" and was sure. Probably two words that sound alike, so it was not made again.
4. The seven other move calls with an unsure word: `call_block` (up, 0.84), `call_hammer_fist` (fist, 0.84), `call_jump` (Jump, 0.92), `call_rising_palm` (palm, 0.76), `call_spear_thrust` (Thrust, 0.93), `call_stake_thrust` (hands, 0.93), `call_uppercut` (Uppercut, 0.91). The second engine heard the right words in the five of these it was sent (all but `call_rising_palm` and `call_stake_thrust`).
5. `taunts/taunt_suitors_3.mp3`: a short sound in its last 10 ms.

## The clips that were not "same" in the first run

| clip | verdict | the line | what was heard | what was done |
|---|---|---|---|---|
| `athena/call_knee.mp3`, first take | differs | Knee! Drive it high! | Me, drive it high | Made again with `genClips.ts athena` and levelled. ElevenLabs hears the new take as "Knee, drive it high". Not confirmed: see below |
| `athena/fight_start.mp3` | cut? | I am with you! | I am with you | Left as it is. The words are all there; the file ends before the voice has died away |
| `taunts/taunt_suitors_3.mp3` | cut? | Friends, draw your swords and hold the tables up against his arrows! | Friends, draw your swords and hold the tables up against his arrows | Left as it is. The words are all there; there is a short sound in the last 10 ms |

### `athena/call_knee.mp3`: not confirmed

The first take's opening word came back as "Me". A second model (`scribe_v3`) heard "Me" too, and both were sure of it. This is a move call, so a player who hears "Me!" does not know what to do. The clip was made again once (voice Sarah, model `eleven_v4`, the same as before) and levelled with `levelClips.ts --write`. That take is the one in the repo. The first take is in git history.

**What the two engines make of the take in the repo:** ElevenLabs speech to text hears "Knee", at a probability of 0.89 to 0.91. Gemini (`gemini-3.5-flash-lite`, given the audio and not told the line) hears "Me" in 5 of 6 requests and "knee" in 1.

Seven more takes were then made with the same command to look for one that both engines hear as "Knee". None was kept, because none passed, and none was clearly better than the take in the repo:

| take | ElevenLabs: first word (probability) | Gemini: first word, one per request |
|---|---|---|
| first take (replaced) | Me (sure) | Me, Me |
| **the take in the repo** | Knee (0.89 to 0.91) | Me, Me, Me, me, me, knee |
| 1, as made | Knee (0.92) | knee, Nie, Me, Me, knee, knee |
| 1, levelled | Knee (0.95) | Me, me, me, me |
| 2 | Me (0.98) | Nee |
| 3 | Knee (0.89) | knee, Ne, me, Me, me, and once no first word at all |
| 4 | Knee (0.95) | Me |
| 5 | Me (0.90) | not sent |
| 6 | Knee (0.82) | not sent |
| 7 | Knee (0.79) | not sent |
| "Knee strike! Drive up!", two takes, never in the repo | Knee (0.98 and 1.00) | Me, Me, Me and New, No, New |

What this shows:

- ElevenLabs heard "Knee" in 6 of the 9 takes of the line and "Me" in 3, so this voice's "Knee!" is easy to mistake for "Me!".
- Gemini gives different answers for the same file from one request to the next, and it heard "Me" for a reworded line that ElevenLabs was sure of. So some of the doubt may be that engine's and not the clip's. It heard 14 of 15 other move calls right, though, so it cannot be waved away.
- A machine cannot settle it. If a person hears "Me", the choices are another take or a reworded line. A call may be at most 4 words (`tests/athenaLines.test.ts`). "Knee strike! Drive up!" fits and ElevenLabs was sure of it, but the second engine did not hear "Knee" in it either. Changing the line is the team's choice and was not done.

### `athena/fight_start.mp3`

This is the opening line, trimmed to end before the first call (`docs/audio-levels.md`). The transcript has "you" whole, and the model was sure of every word. The second engine heard "I am with you" too. The word times put the end of "you" 95 ms before the end of the file. But the file does not end in silence: its last 30 ms are at -34 dBFS, about 17 dB under the loudest part of "you" (-17 dBFS, from 0.89 s to 1.04 s). So the vowel is said in full and the file stops during its quiet tail. A machine cannot say whether that sounds clipped. Nothing was changed: the clip must stay under 1.3 s, and any more of the tail would make it longer.

If a person hears a click at the end: add a 25 ms fade out with ffmpeg (`afade=t=out`), drop the frame the re-encode adds with `ffmpeg -t 1.24 -c copy` as `docs/audio-levels.md` describes, and run `tests/athenaLines.test.ts` again. That is a separate small change.

### `taunts/taunt_suitors_3.mp3`

"arrows" ends about 190 ms before the end of the file, and the next 170 ms are near silence (-48 to -63 dBFS). The last 10 ms then rise to -35 dBFS: the start of a breath or a small click. It is not a cut word. A taunt plays at 0.7 of the voice volume, under Athena's calls, so it is unlikely to be heard, but nobody has listened for it.

## The 29 unsure clips

Speech to text gives every word a probability. The tool marks a clip "unsure?" when its words are right, nothing looks cut, and a word is under 0.95. Of 650 words in the 82 clips, 37 are under 0.95, 20 under 0.90 and 6 under 0.80. The lowest is 0.62.

It is a weak signal. The probability looks as if it covers how the word is written as well as how it sounds: many of the low ones are where the transcript and the line differ only in a capital, a comma or a hyphen ("muse" for "Muse", "sirens" for "Sirens", "and" where the line has ", and", "windup" for "wind-up", "Earthshaker" for "Earth-shaker"). So most of these 29 are probably fine, and a clip that is "same" is not proved right. It matters most in a two to four word call, where one word is the whole instruction: those eight are in the list for a person's ear above.

| clip | the words speech to text was not sure of |
|---|---|
| `athena/call_block.mp3` | up (0.84) |
| `athena/call_hammer_fist.mp3` | fist (0.84) |
| `athena/call_jump.mp3` | Jump (0.92) |
| `athena/call_knee.mp3` | Knee (0.89) |
| `athena/call_rising_palm.mp3` | palm (0.76) |
| `athena/call_spear_thrust.mp3` | Thrust (0.93) |
| `athena/call_stake_thrust.mp3` | hands (0.93) |
| `athena/call_uppercut.mp3` | Uppercut (0.91) |
| `athena/homer_intro_polyphemus.mp3` | cave (0.93) |
| `athena/homer_title.mp3` | muse (0.80), Ithaca (0.91) |
| `athena/phase_any.mp3` | windup (0.81) |
| `athena/phase_six_heads.mp3` | heads (0.91) |
| `athena/phase_the_fig_tree.mp3` | tree (0.94) |
| `athena/taunt_polyphemus_1.mp3` | nobody (0.89) |
| `athena/taunt_polyphemus_2.mp3` | Poseidon (0.93) |
| `narration/homer_after_circe.mp3` | Circe (0.73) |
| `narration/homer_after_polyphemus.mp3` | Poseidon (0.89) |
| `narration/homer_after_scylla.mp3` | on (0.85) |
| `narration/homer_after_suitors.mp3` | bed (0.84) |
| `narration/homer_before_charybdis.mp3` | like (0.90), fire (0.91) |
| `narration/homer_before_circe.mp3` | moly (0.82) |
| `narration/homer_before_scylla.mp3` | Scylla (0.94), teeth (0.95) |
| `narration/homer_before_sirens.mp3` | and (0.68), sirens (0.71), sing (0.94) |
| `narration/homer_before_suitors.mp3` | beggar's (0.91) |
| `taunts/taunt_charybdis_1.mp3` | and (0.62) |
| `taunts/taunt_charybdis_2.mp3` | Earthshaker (0.87) |
| `taunts/taunt_charybdis_3.mp3` | tree (0.91), hold (0.85), back (0.88) |
| `taunts/taunt_sirens_3.mp3` | Troy (0.88), earth (0.95) |
| `taunts/taunt_suitors_2.mp3` | vultures (0.87) |

A word shown as 0.95 is just under it.

## How it was checked

- **Which clips.** Every line in `src/audio/athenaLines.ts` (50), `src/audio/storyLines.ts` (8) and `src/audio/narrationLines.ts` (24), and the clip named after its id. The tool also reads the three folders, so a clip no line names, or a line with no clip, is reported as `FAILED`. A test (`server/tests/hearRules.test.ts`) keeps the list equal to the files.
- **Speech to text.** ElevenLabs, `POST /v1/speech-to-text`, model `scribe_v2`, with the language set to English, sound tagging on and word timings on. The request was written from the API reference as it read on 14 November 2026. 82 clips, 4.6 minutes of audio in all, were sent once each in the first run, and all 82 again in the last run because the request changed (sound tagging on, probabilities kept). Another 15 short requests were made for the takes of `call_knee`.
- **Sounds that are not words.** With sound tagging on, a laugh, a sigh or a breath that the voice model added would come back as a tag such as "(laughs)", which the comparison counts as a word the line does not have. No clip came back with a tag.
- **Comparing the words.** Both texts are put in lower case with punctuation, accents and apostrophes removed, and a small number written as digits is read as its word. They are then lined up word by word. A clip "differs" when a word of the line is not in the transcript or a word of the transcript is not in the line, and the tool prints those words. One word written as two ("wind-up" and "windup", "Earth-shaker" and "Earthshaker") is not a difference. Eight names from the Odyssey may come back in another spelling from a short list in `server/tools/hearRules.ts` ("Kirke" or "Cersei" for Circe, "Molly" for moly, "Skylla" for Scylla and so on). Every other word must match letter for letter, so "circle" for Circe or "holy" for moly differs. In these runs every transcript matched its line letter for letter, so the list was not used.
- **Looking for a cut.** A clip whose words are right gets "cut?" when any of these is true: the first word starts at 0 ms; the last word ends within 40 ms of the end of the file; or the last 30 ms of the file are louder than -45 dBFS. The first two come from the word times in the transcript. The third is measured from the file with ffmpeg. Without ffmpeg it is skipped, and the tool says so. Most clips are near -85 dBFS over their last 30 ms.
- **When speech to text fails.** A refused key, a rate limit (HTTP 429), a request that gets no answer in 60 s, or three failed requests in a row stop the run. The clips left are reported as not sent, the last line says how many requests were made and how many were answered, and the tool exits 1.

## The second engine

Gemini (`gemini-3.5-flash-lite`, audio in, asked to write down the words and not told the line) was used by hand as a second opinion. It is not part of the tool. **It covers only part of the clips:** 15 of Athena's move calls and `fight_start`, once each, and the takes of `call_knee` above. The other 66 clips were not sent to it. In 14 of the 15 calls it heard the line; the other is `call_chain_punch`, in the list for a person's ear.

It answers differently from one request to the next for the same file, so one request is not a verdict.

**Do not run a batch of Gemini requests close to the demo or during it.** That key answered 429 ("exceeded your current quota") after about 15 requests in under a minute, and took up to a minute to recover. The god scan in the demo uses the same key and the same model. If a full second pass is wanted, run it well before, one request every 5 seconds.

## What this does not show

- **How anything sounds.** Tone, pace, whether a voice suits its character, whether a line is shouted or flat, clicks and odd noises in the middle of a clip: none of it is in a transcript.
- **How a name is said.** The model writes "Charybdis" and "Achaeans" the usual way whether or not they were said the usual way. No name came back misspelled, which says the names were near enough for the model to know them, and no more.
- **A word that is only slurred.** Speech to text guesses the likeliest word. A word said badly can still come back right, more so inside a sentence than in a two-word call. `call_knee` was caught because "Me" is also a likely word.
- **Small cuts.** The word times are coarse. Nearly all come in steps of 20 ms, and every first word was placed at 80 ms or later although the sound starts within 85 ms in every clip, and within 50 ms in all but six (`docs/audio-levels.md`, lead ms). So neither of the two rules that use the word times flagged any clip, and they would miss a cut of a few tens of milliseconds. Both flags above came from the level at the end of the file. Nothing measures a cut at the start of a clip except the 0 ms rule.
- **The clips in the game.** Each clip was checked alone, not under the music and effects it plays with.
- **Anything that is not a voice clip.** Effects, stop sounds and music have no words.

## Not tested

- No person has listened to any clip.
- The second engine heard only 16 clips and the knee takes.
- The tool was run on one Mac, with ffmpeg 9. With ffmpeg taken off PATH it still compares the words and uses the word times, and says that the end levels were not measured; the two "cut?" flags need ffmpeg.
- The answer for a clip can differ from one request to the next. Each clip in the repo was sent twice to ElevenLabs (once per run, with different settings) and got the same words both times.
- How the tool behaves when speech to text fails was tried by hand against a made-up upstream (a 400 that repeats the key, 401, 429, 500, a body that is not JSON, a body of the wrong shape, a network error, a stall). The rules it uses are in the unit test; the tool's own loop is not.
