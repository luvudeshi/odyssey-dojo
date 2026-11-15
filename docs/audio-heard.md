# What the voice clips say

All 82 voice clips under `public/audio` (`athena`, `narration`, `taunts`), put through speech to text on 14 November 2026 and compared with the line each is meant to say. **This is a machine transcript, not a person listening.** Nobody on the team has listened to these clips. The check says which words a speech to text model made out. It does not say how a clip sounds.

The tool is `server/tools/hearClips.ts`. It needs `ELEVENLABS_API_KEY` and a network connection. It is not part of `make check`. It never prints the key.

```bash
npx tsx --env-file=<path to .env> server/tools/hearClips.ts            # the table: clip, verdict, expected, heard
npx tsx --env-file=<path to .env> server/tools/hearClips.ts --check    # the same; exits 1 when a clip differs
```

**After you add or replace a voice clip, run it again** (after `levelClips.ts --write`, which changes the file). Each clip is sent once. The transcripts are kept in `server/data/hear-clips.json`, which git ignores, under the hash of the clip's bytes, so a second run sends only the clips that changed. `--cache=<file>` keeps them somewhere else.

## Result

| | same | differs | may be cut |
|---|---|---|---|
| First run, the clips as they were | 79 | 1 | 2 |
| Now, after one clip was made again | 80 | 0 | 2 |

One clip was made again: `athena/call_knee.mp3`. No clip is known to say the wrong words now. Two are flagged as possibly cut and were left as they are; both are described below.

Every clip that was not "same":

| clip | verdict | the line | what was heard | what was done |
|---|---|---|---|---|
| `athena/call_knee.mp3`, first take | differs | Knee! Drive it high! | Me, drive it high | Made again with `genClips.ts athena`, levelled, heard again: "Knee. Drive it high", same |
| `athena/fight_start.mp3` | cut? | I am with you! | I am with you | Left as it is. The words are all there; the file ends before the voice has died away |
| `taunts/taunt_suitors_3.mp3` | cut? | Friends, draw your swords and hold the tables up against his arrows! | Friends, draw your swords and hold the tables up against his arrows | Left as it is. The words are all there; there is a short sound in the last 10 ms |

### `athena/call_knee.mp3`

The first take's opening word came back as "Me". A second model (`scribe_v3`) heard "Me" too, and both were sure of it. This is a move call, so a player who hears "Me!" does not know what to do. The clip was made again once (voice Sarah, model `eleven_v4`, the same as before) and levelled with `levelClips.ts --write`. The new take came back as "Knee" both before and after levelling. Before levelling, the model gave that word a probability of about 0.91, lower than the rest of the line, so this is the clip most worth a person's ear. The first take is in git history.

### `athena/fight_start.mp3`

This is the opening line, trimmed to end before the first call (`docs/audio-levels.md`). The transcript has "you" whole, and the model was sure of every word. The word times put the end of "you" 95 ms before the end of the file. But the file does not end in silence: its last 30 ms are at -34 dBFS, about 17 dB under the loudest part of "you" (-17 dBFS, from 0.89 s to 1.04 s). So the vowel is said in full and the file stops during its quiet tail. A machine cannot say whether that sounds clipped. Nothing was changed: the clip must stay under 1.3 s, and any more of the tail would make it longer.

### `taunts/taunt_suitors_3.mp3`

"arrows" ends about 190 ms before the end of the file, and the next 170 ms are near silence (-48 to -63 dBFS). The last 10 ms then rise to -35 dBFS: the start of a breath or a small click. It is not a cut word. A taunt plays at 0.7 of the voice volume, under Athena's calls, so it is unlikely to be heard, but nobody has listened for it.

## How it was checked

- **Which clips.** Every line in `src/audio/athenaLines.ts` (50), `src/audio/storyLines.ts` (8) and `src/audio/narrationLines.ts` (24), and the clip named after its id. The tool also reads the three folders, so a clip no line names, or a line with no clip, is reported as `FAILED`. A test (`server/tests/hearRules.test.ts`) keeps the list equal to the files.
- **Speech to text.** ElevenLabs, `POST /v1/speech-to-text`, model `scribe_v2`, with the language set to English, sound tagging off and word timings on. The request was written from the API reference as it read on 14 November 2026. 82 clips, 4.6 minutes of audio in all, were sent once each, and the new take of `call_knee` once more after it was levelled. Four more requests were made by hand while the tool was written: one for `fight_start`, two for the first `call_knee` and one for its new take before levelling.
- **Comparing the words.** Both texts are put in lower case with punctuation, accents and apostrophes removed, and a small number written as digits is read as its word. They are then lined up word by word. A clip "differs" when a word of the line is not in the transcript or a word of the transcript is not in the line, and the tool prints those words. One word written as two ("wind-up" and "windup", "Earth-shaker" and "Earthshaker") is not a difference. Seventeen names and words from the Odyssey (Circe, Charybdis, moly and so on, listed in `server/tools/hearRules.ts`) may come back spelled another way, within one or two letters or with the same consonants. Every other word must match letter for letter.
- **Looking for a cut.** A clip whose words are right gets "cut?" when any of these is true: the first word starts at 0 ms; the last word ends within 40 ms of the end of the file; or the last 30 ms of the file are louder than -45 dBFS. The first two come from the word times in the transcript. The third is measured from the file with ffmpeg, and is skipped when ffmpeg is not installed. Most clips are near -85 dBFS over their last 30 ms.

## What this does not show

- **How anything sounds.** Tone, pace, whether a voice suits its character, whether a line is shouted or flat, clicks and odd noises in the middle of a clip: none of it is in a transcript.
- **How a name is said.** The model writes "Charybdis" and "Achaeans" the usual way whether or not they were said the usual way. No name came back misspelled, which says the names were near enough for the model to know them, and no more.
- **A word that is only slurred.** Speech to text guesses the likeliest word. A word said badly can still come back right, more so inside a sentence than in a two-word call. `call_knee` was caught because "Me" is also a likely word.
- **Small cuts.** The word times are coarse. Nearly all come in steps of 20 ms, and every first word was placed at 80 ms or later although the sound starts within 50 ms in every clip (`docs/audio-levels.md`, lead ms). So neither of the two rules that use the word times flagged any clip, and they would miss a cut of a few tens of milliseconds. Both flags above came from the level at the end of the file. Nothing measures a cut at the start of a clip except the 0 ms rule.
- **The clips in the game.** Each clip was checked alone, not under the music and effects it plays with.
- **Anything that is not a voice clip.** Effects, stop sounds and music have no words.

## Not tested

- No person has listened to any clip, the new `call_knee` included.
- The tool was run on a Mac with ffmpeg 9 only. Without ffmpeg it still compares the words and uses the word times; that path was not run.
- The answer for a clip can differ from one request to the next. Each clip was sent once, apart from the first `call_knee`, which three requests heard as "Me".
