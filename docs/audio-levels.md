# Audio levels

Every clip under `public/audio`, measured with ffmpeg on 14 November 2026. **This is measurement, not listening.** Nobody has heard these levels in the game. The numbers say what is loud and what is quiet. They do not say what sounds good.

The tool is `server/tools/levelClips.ts`. It needs ffmpeg and ffprobe on PATH, no keys and no network. It is not part of `make check`.

```bash
npx tsx server/tools/levelClips.ts            # the table, and what --write would change
npx tsx server/tools/levelClips.ts --check    # the same; exits 1 when a voice clip is out of tolerance
npx tsx server/tools/levelClips.ts --write    # re-encodes the voice clips that are out of tolerance, then refreshes the tables below
npx tsx server/tools/levelClips.ts --doc      # refreshes the tables below and changes no clip
```

**After you add or replace a clip, run it with `--write`.** It is safe to run again at any time. A clip within tolerance is left byte for byte as it is. Only clips in `athena`, `narration` and `taunts` are ever rewritten. It reads the folders, not the `index.json` files, and never edits them. `tests/audioLevels.test.ts` fails when a clip has no row in the tables below, and when a voice clip's row gives a length its file no longer has (the take was replaced). With no ffmpeg, add the row by hand between the `levels:start` and `levels:end` markers, in the table for its folder: the path in backticks and a dash in each other cell. For a replaced clip, change the cells of its row to dashes.

## What the columns mean

- **LUFS**: integrated loudness of the file (EBU R 128, ffmpeg's `ebur128` filter). One LU is one dB. On a clip of one or two seconds this number is rougher than on a long one.
- **peak dBTP**: true peak of the file.
- **lead ms, tail ms**: the time before the first sample above -50 dBFS and after the last one. ffmpeg has already skipped the padding an MP3 carries at its start. A soft first consonant can sit under -50 dBFS, so the first loud syllable may come later than the lead says.
- **play dB**: what the game's playback adds at the default settings (music 0.7, effects 1, voice 1). The gains are copied into `server/tools/levelRules.ts` from the audio code. If a gain changes there, change it in `levelRules.ts` too and run `--doc`.
- **at the listener**: LUFS plus play dB. This is the number to compare across categories.

## How each category is played

| category | how it is played | at the listener |
|---|---|---|
| Athena | An audio element at the voice volume (`voice.ts`). Default 1, so the file's own level. | -15.6 LUFS (-16.8 to -14.0) |
| Homer | The same path (`storyVoice.ts` speaks through `voice.ts`). | -19.0 LUFS (-20.1 to -19.0) |
| A monster's taunt | Its own channel, at `TAUNT_VOLUME` 0.7 of the voice volume (`voice.ts`). It plays under Athena's calls. | -22.1 LUFS (-23.6 to -21.9) |
| Effects (`sfx`) | The file's own level, times `LEVELS[type]`, times `MASTER_GAIN` 0.5 (`sfx.ts`). Files are not levelled. | -25.8 LUFS (-41.2 to -16.7) |
| Stop events | Each clip is raised or lowered to RMS 0.12 with its peak held to 0.9, then times `EVENT_GAIN` 0.5 (`stopAudio.ts`). | -22.4 LUFS (-31.4 to -17.0) |
| Music | Each clip is brought to its scene's RMS (0.1 to 0.16), then times `MUSIC_GAIN` 0.16, times the music volume (`music.ts`). | fight -34.0, menu -36.5, loss -32.3, win -28.6 LUFS |
| Music under a spoken line | The two loops drop by half (`DUCK` 0.5). The stings do not. | fight -40.0, menu -42.5 LUFS |
| Ambience | Each clip is brought to RMS 0.08, then times `AMBIENCE_GAIN` 0.16, times the music volume (`stopAudio.ts`). | -38.2 LUFS (-39.1 to -37.6) |

Athena's range leaves out `athena/fight_start.mp3`, which is at -17.2 LUFS and is not levelled here (see "What was changed").

## Reading the mix

What was wanted: Athena's calls clearly on top, Homer and the monsters near her, effects under the voice, music and ambience well under.

- **Athena is on top.** Her lines sit at -15.6 LUFS.
- **Homer is near her now**, 3.4 LU under. Before this change he was 7 LU under (about -22.3 LUFS).
- **A taunt is 6.5 LU under her.** The clips are 3.4 LU under hers, and `TAUNT_VOLUME` takes 3.1 dB more because a taunt plays at the same time as her calls. Before this change a taunt was 9.6 LU under her (-25.0 LUFS), quieter than most of the effects around it. It is now level with the median stop event (-22.4) and still 2.2 LU under the hit sound (`enemyHit`, -19.9). `TAUNT_VOLUME` was not changed: it is in `voice.ts`, which others are editing, and nobody has heard whether a louder taunt masks her calls.
- **Most effects are under Athena.** The median effect is 10 LU under her, the median stop event 7 LU under. Some effects are far too quiet and one is as loud as her: see below.
- **Music and ambience are well under.** The fight music is 18 LU under Athena, and 24 LU under while she speaks. The menu loop is 17.5 LU under Homer, 23.5 LU while he speaks. A common yardstick for background sound under speech is 20 dB (WCAG 1.4.7). The dip is what gets the music past it. So the level `music.ts` picks is sensible against the voice and no constant was changed. In RMS terms the fight music comes out at -31.8 dBFS with the music volume at 1 and -34.9 dBFS at the default 0.7. If the music cannot be heard in a loud room, `MUSIC_GAIN` is the one number to raise: 0.22 is 2.8 dB more.

### What the numbers say is wrong, and was not changed

These are effects, stop sounds and music. This change does not touch those files, and none of these is one constant.

1. **The effect files are not levelled, and they differ by 24.5 LU at the listener.** `sfx.ts` plays a file at its own level. `LEVELS` was set for the built-in synthesised sounds, which all peak at 0.9. The files that replaced them do not. `opening` (-41.2), `whiffed` (-39.7), `lost` (-38.5) and `phaseChanged` (-36.3) are 20 LU or more under Athena and are likely not heard. `playerHit` (-28.6) is 8.7 LU quieter than `enemyHit` (-19.9), so the hit you take is much quieter than the hit you land. `finished` (-16.7) is about as loud as Athena. Suggested fix: have `sfx.ts` level each file when it loads, with `stopClipLevel` from `stopAudio.ts`, as the stop sounds already are.
2. **Some hit sounds start late.** `sfx/playerHit` has 197 ms of silence before the sound, `sfx/enemyHit` 88 ms, `stops/sirens/swoop` 339 ms, `stops/suitors/throw` 196 ms, `stops/scylla/snap` 155 ms, `stops/suitors/hurt` 107 ms. Suggested fix: start each buffer past its silence (`source.start(0, offset)`), or trim the files.
3. **The stop events still differ by 14 LU after levelling.** Levelling is by RMS over the whole clip, so a clip that is mostly tail comes out quiet. `stops/scylla/snap` (-31.4), `stops/sirens/wave` (-29.0) and `stops/sirens/hurt` (-27.0) are the quiet ones. `stops/circe/wand` (-17.0) and `stops/circe/squeal` (-18.5) are louder than a taunt.
4. **The win sting is 5.4 LU louder than the fight music** (-28.6 against -34.0), for the same reason: it has 1.8 s of quiet tail, so its RMS underrates it. It is still 9.6 LU under Homer's result line and 13 LU under Athena's.
5. **Lines made at run time are not levelled.** `narration.ts` plays what `/api/speech` returns at its own level. Recorded Homer lines came out near -22.3 LUFS before this change, so a line made at run time will likely be about 3 LU under the recorded ones.
6. **Calls have up to 301 ms of silence after them.** Not trimmed here.

At commit 7557bdf no screen calls `startStopAmbience` or `playStopEvent`, so the stop ambience and the stop events are not heard in the game yet. Their numbers are what they will reach once a screen plays them.

## What was changed

Voice clips only: `athena`, `narration`, `taunts`. 65 of the 82 were re-encoded. 16 were within tolerance and are untouched. One, `athena/fight_start.mp3`, is out of tolerance and was left alone on purpose (see below). That was two runs of the tool: 53 of the 69 clips that existed first, then 12 of the 13 clips PR #167 added.

**Targets.** The clips came in two groups about 7 LU apart, so one target would have meant changing every clip by 3 dB or more. Athena's own lines also had peaks near -0.9 dBTP, and Homer's had peaks 19 dB above their loudness, so neither group could simply be moved to the other. There are two targets:

- **Athena's own lines: -15.5 LUFS.** The median of her first 37 clips as they were made was -15.4.
- **Homer and the monsters: -19.0 LUFS**, 3.5 LU under her. Their median was -22.2. -19.0 is about as loud as the hardest of them gets with no more than 3 dB of limiting (`homer_after_scylla` stops at -19.5). This includes the Homer and Polyphemus clips that live in `public/audio/athena`.

**Tolerance.** A voice clip is out of tolerance when it is more than 1.5 LU from its target, or its true peak is above -1.0 dBTP, or it is a move call (`call_*`) with more than 60 ms of silence before it. A clip that is rewritten ends with its peak at or under -1.5 dBTP and, for a late call, 30 ms of lead.

**How a clip is fixed.** One gain puts it on target. If that gain would lift the peak past -1.5 dBTP, the gain stops there when that lands within 1 LU of the target. Only otherwise is ffmpeg's lookahead limiter (`alimiter`) used, and never for more than 3 dB. 26 clips went through the limiter. The clip is re-encoded with libmp3lame at the rate, channels and bitrate it had (all 82 are 44.1 kHz mono at 128 kbps, before and after). The encoder itself takes about 0.5 dB off at this bitrate, so the tool measures what it made and tries again until it lands.

**What this leaves.** 12 untouched clips peak between -1.4 and -1.0 dBTP: within tolerance, so not rewritten. That is a choice. None of them clips, and a rewrite would cost each about 0.5 to 1 dB and a second MP3 encoding. To hold every clip to -1.5 dBTP, set `PEAK_TOLERANCE_DBTP` to -1.5 in `levelRules.ts` and run `--write`. No move call had more than 48 ms of lead, so none was trimmed. Clip lengths did not change.

**`athena/fight_start.mp3` is not levelled here.** PR #188 replaces it with a shorter take, and two PRs that both rewrite one MP3 cannot both merge. So this change leaves the file as it is on `main`, and its row under "Measured now" was put in by hand with dashes. The take on `main` measures -17.2 LUFS with a peak of -2.7 dBTP: 1.7 LU under the target. The take in #188 measures -17.6 LUFS and -1.7 dBTP: 2.1 LU under. Until it is levelled, `--check` exits 1 and names this one clip. **Once #188 is merged, run `--write` once.** On a copy of the folder with #188's take, that brought it to -15.6 LUFS and -1.5 dBTP through the limiter, kept its 1.25 s, and filled in its row. The tables and counts in this section leave the clip out.

| group | clips | before: quietest to loudest (median) | spread | after: quietest to loudest (median) | spread |
|---|---|---|---|---|---|
| athena (Athena's own lines, without `fight_start`) | 49 | -19.4 to -12.6 (-15.3) | 6.8 LU | -16.8 to -14.0 (-15.6) | 2.8 LU |
| athena (Homer) | 4 | -22.4 to -21.4 (-21.9) | 1.0 LU | -19.0 to -19.0 (-19.0) | 0.0 LU |
| athena (Polyphemus) | 4 | -23.0 to -20.4 (-22.2) | 2.6 LU | -20.4 to -19.0 (-19.0) | 1.4 LU |
| narration | 11 | -23.7 to -21.5 (-22.6) | 2.2 LU | -20.1 to -19.0 (-19.0) | 1.1 LU |
| taunts | 13 | -24.7 to -18.8 (-21.9) | 5.9 LU | -20.5 to -18.8 (-19.0) | 1.7 LU |

Before, 31 voice clips peaked above -1.0 dBTP (the highest at -0.4). After, none does.

The clips that were rewritten. "limiter" marks the ones that went through it.

| clip | LUFS before | LUFS after | change dB | peak before | peak after | limiter |
|---|---|---|---|---|---|---|
| `athena/call_aegis_push.mp3` | -15.4 | -16.1 | -0.7 | -0.9 | -1.6 |  |
| `athena/call_any_defend.mp3` | -16.3 | -15.6 | +0.7 | -0.9 | -1.6 | yes |
| `athena/call_any_strike.mp3` | -14.0 | -15.5 | -1.5 | -0.9 | -2.3 |  |
| `athena/call_block.mp3` | -12.7 | -15.5 | -2.8 | -0.7 | -3.5 |  |
| `athena/call_cross.mp3` | -15.2 | -16.0 | -0.8 | -0.7 | -1.5 |  |
| `athena/call_duck.mp3` | -16.9 | -15.8 | +1.1 | -0.4 | -1.5 | yes |
| `athena/call_hammer_fist.mp3` | -15.4 | -16.5 | -1.1 | -0.5 | -1.6 |  |
| `athena/call_hook.mp3` | -15.3 | -16.0 | -0.7 | -0.9 | -1.6 |  |
| `athena/call_jab.mp3` | -15.8 | -16.7 | -0.9 | -0.8 | -1.5 |  |
| `athena/call_knee.mp3` | -13.8 | -15.5 | -1.7 | -0.9 | -2.5 |  |
| `athena/call_moon_arrow.mp3` | -15.0 | -15.7 | -0.7 | -0.9 | -1.5 |  |
| `athena/call_overhead_strike.mp3` | -14.3 | -15.5 | -1.2 | -0.8 | -2.0 |  |
| `athena/call_rising_palm.mp3` | -13.2 | -15.5 | -2.3 | -0.8 | -3.1 |  |
| `athena/call_spear_thrust.mp3` | -16.2 | -15.7 | +0.5 | -0.9 | -1.5 | yes |
| `athena/call_stake_thrust.mp3` | -16.7 | -15.6 | +1.1 | -0.9 | -1.5 | yes |
| `athena/call_swift_dash.mp3` | -17.1 | -16.0 | +1.1 | -0.4 | -1.6 | yes |
| `athena/call_thunderbolt.mp3` | -14.0 | -15.5 | -1.5 | -0.8 | -2.2 |  |
| `athena/call_trident_sweep.mp3` | -15.3 | -16.0 | -0.7 | -0.8 | -1.6 |  |
| `athena/homer_intro_polyphemus.mp3` | -22.2 | -19.0 | +3.2 | -3.4 | -1.5 | yes |
| `athena/homer_loss.mp3` | -21.4 | -19.0 | +2.4 | -2.4 | -1.6 | yes |
| `athena/homer_title.mp3` | -21.6 | -19.0 | +2.6 | -2.5 | -1.5 | yes |
| `athena/homer_win.mp3` | -22.4 | -19.0 | +3.4 | -3.1 | -1.6 | yes |
| `athena/loss.mp3` | -19.4 | -15.6 | +3.8 | -2.9 | -1.6 | yes |
| `athena/phase_1.mp3` | -17.1 | -15.6 | +1.5 | -1.9 | -1.5 | yes |
| `athena/phase_2.mp3` | -16.3 | -15.5 | +0.8 | -0.8 | -1.6 | yes |
| `athena/phase_any.mp3` | -19.3 | -16.5 | +2.8 | -4.4 | -1.6 |  |
| `athena/phase_eurymachus.mp3` | -12.6 | -15.5 | -2.9 | -0.7 | -3.7 |  |
| `athena/phase_six_heads.mp3` | -15.7 | -16.5 | -0.8 | -0.7 | -1.5 |  |
| `athena/phase_the_fig_tree.mp3` | -13.6 | -15.5 | -1.9 | -0.7 | -2.6 |  |
| `athena/phase_the_meadow_of_bones.mp3` | -14.4 | -15.6 | -1.2 | -0.8 | -1.9 |  |
| `athena/phase_the_song.mp3` | -13.2 | -15.5 | -2.3 | -0.8 | -3.0 |  |
| `athena/phase_the_spew.mp3` | -15.4 | -16.3 | -0.9 | -0.7 | -1.6 |  |
| `athena/phase_the_toll.mp3` | -13.7 | -15.5 | -1.8 | -0.4 | -2.2 |  |
| `athena/phase_the_volley.mp3` | -14.7 | -15.5 | -0.8 | -0.8 | -1.6 |  |
| `athena/phase_the_wand.mp3` | -16.0 | -15.6 | +0.4 | -0.7 | -1.5 | yes |
| `athena/phase_unmasked.mp3` | -13.3 | -15.5 | -2.2 | -1.0 | -3.1 |  |
| `athena/praise_1.mp3` | -18.0 | -15.5 | +2.5 | -2.6 | -1.6 | yes |
| `athena/praise_2.mp3` | -13.9 | -15.5 | -1.6 | -0.7 | -2.4 |  |
| `athena/praise_3.mp3` | -14.6 | -15.5 | -0.9 | -0.8 | -1.8 |  |
| `athena/taunt_polyphemus_1.mp3` | -21.9 | -19.0 | +2.9 | -5.5 | -2.7 |  |
| `athena/taunt_polyphemus_2.mp3` | -23.0 | -19.0 | +4.0 | -6.1 | -2.2 |  |
| `athena/taunt_polyphemus_3.mp3` | -22.5 | -19.0 | +3.5 | -6.1 | -2.5 |  |
| `athena/warn_1.mp3` | -14.9 | -15.6 | -0.7 | -0.9 | -1.6 |  |
| `narration/homer_after_charybdis.mp3` | -23.6 | -19.0 | +4.6 | -4.4 | -1.5 | yes |
| `narration/homer_after_circe.mp3` | -22.2 | -19.0 | +3.2 | -2.9 | -1.5 | yes |
| `narration/homer_after_polyphemus.mp3` | -21.5 | -19.0 | +2.5 | -4.4 | -2.0 |  |
| `narration/homer_after_scylla.mp3` | -22.7 | -19.5 | +3.2 | -2.2 | -1.6 | yes |
| `narration/homer_after_sirens.mp3` | -22.3 | -20.1 | +2.2 | -3.8 | -1.6 |  |
| `narration/homer_after_suitors.mp3` | -23.7 | -19.1 | +4.6 | -3.7 | -1.7 | yes |
| `narration/homer_before_charybdis.mp3` | -22.1 | -19.0 | +3.1 | -2.5 | -1.5 | yes |
| `narration/homer_before_circe.mp3` | -22.6 | -19.0 | +3.6 | -3.6 | -1.6 | yes |
| `narration/homer_before_scylla.mp3` | -23.0 | -19.0 | +4.0 | -4.3 | -1.5 | yes |
| `narration/homer_before_sirens.mp3` | -23.0 | -19.0 | +4.0 | -3.6 | -1.6 | yes |
| `narration/homer_before_suitors.mp3` | -22.2 | -19.0 | +3.2 | -5.5 | -2.3 |  |
| `taunts/taunt_charybdis_1.mp3` | -21.9 | -19.0 | +2.9 | -5.4 | -2.6 |  |
| `taunts/taunt_charybdis_2.mp3` | -20.9 | -19.5 | +1.4 | -2.9 | -1.5 |  |
| `taunts/taunt_charybdis_3.mp3` | -21.9 | -19.0 | +2.9 | -3.2 | -1.7 | yes |
| `taunts/taunt_circe_1.mp3` | -22.3 | -19.0 | +3.3 | -2.8 | -1.5 | yes |
| `taunts/taunt_circe_2.mp3` | -20.8 | -19.0 | +1.8 | -2.1 | -1.5 | yes |
| `taunts/taunt_circe_3.mp3` | -22.0 | -19.5 | +2.5 | -3.8 | -1.5 |  |
| `taunts/taunt_sirens_1.mp3` | -23.7 | -19.0 | +4.7 | -8.1 | -3.3 |  |
| `taunts/taunt_sirens_2.mp3` | -24.7 | -19.0 | +5.7 | -8.8 | -3.0 |  |
| `taunts/taunt_sirens_3.mp3` | -24.0 | -19.0 | +5.0 | -6.8 | -1.9 |  |
| `taunts/taunt_suitors_1.mp3` | -21.4 | -19.0 | +2.4 | -5.0 | -2.7 |  |
| `taunts/taunt_suitors_2.mp3` | -24.7 | -19.0 | +5.7 | -4.9 | -1.5 | yes |

## Not tested

- Nobody has listened to any clip, before or after. The limiter was checked by numbers only: on four of the clips it works hardest on, at about the settings used, it turned down 2 to 11 percent of the samples and left the rest as plain gain, and the clip kept its length.
- **The first clips to listen to** are the five move calls that went through the limiter: `call_any_defend`, `call_duck`, `call_spear_thrust`, `call_stake_thrust` and `call_swift_dash`. A player hears these in every fight. Four of them were within 1.5 LU of the target already and were rewritten only because their peak was 0.1 to 0.6 dB over the tolerance.
- The levels were not measured in a browser. "At the listener" is the file's loudness plus the gains read from the code.
- LUFS on a clip of one or two seconds is rough. Two calls 1 LU apart may not sound different.

## Measured now

Everything from here to the end marker is written by the tool. Do not edit it by hand, except to add a row for a new clip when you have no ffmpeg. One row was added by hand: `athena/fight_start.mp3`, with dashes (see "What was changed"). The group table above it counts 49 of Athena's lines for that reason.

<!-- levels:start (written by server/tools/levelClips.ts) -->

| group | clips | quietest | median | loudest | spread LU | at the listener, median (range) |
|---|---|---|---|---|---|---|
| athena | 49 | -16.8 | -15.6 | -14.0 | 2.8 | -15.6 (-16.8 to -14.0) |
| athena (Homer) | 4 | -19.0 | -19.0 | -19.0 | 0.0 | -19.0 (-19.0 to -19.0) |
| athena (Polyphemus) | 4 | -20.4 | -19.0 | -19.0 | 1.4 | -22.1 (-23.5 to -22.1) |
| music | 4 | -37.7 | -12.9 | -9.8 | 27.9 | -33.1 (-36.5 to -28.6) |
| narration | 11 | -20.1 | -19.0 | -19.0 | 1.1 | -19.0 (-20.1 to -19.0) |
| sfx | 11 | -31.1 | -18.4 | -10.7 | 20.4 | -25.8 (-41.2 to -16.7) |
| stops (ambience) | 5 | -38.0 | -23.0 | -12.2 | 25.8 | -38.2 (-39.1 to -37.6) |
| stops (events) | 20 | -38.0 | -20.1 | -12.3 | 25.7 | -22.4 (-31.4 to -17.0) |
| taunts | 13 | -20.5 | -19.0 | -18.8 | 1.7 | -22.1 (-23.6 to -21.9) |

### Voice clips out of tolerance

None.

### Out of line

- `music/menu.mp3`: -3.4 LU from the median of music at the listener
- `music/win.mp3`: +4.5 LU from the median of music at the listener
- `sfx/enemyHit.mp3`: +5.9 LU from the median of sfx at the listener
- `sfx/finished.mp3`: +9.1 LU from the median of sfx at the listener
- `sfx/lost.mp3`: -12.7 LU from the median of sfx at the listener
- `sfx/opening.mp3`: -15.4 LU from the median of sfx at the listener
- `sfx/phaseChanged.mp3`: -10.5 LU from the median of sfx at the listener
- `sfx/playerHit.mp3`: 197 ms of silence before the sound
- `sfx/powerUnleashed.mp3`: +5.4 LU from the median of sfx at the listener
- `sfx/whiffed.mp3`: -13.9 LU from the median of sfx at the listener
- `stops/circe/squeal.mp3`: +3.9 LU from the median of stops (events) at the listener
- `stops/circe/wand.mp3`: +5.4 LU from the median of stops (events) at the listener
- `stops/scylla/snap.mp3`: -9.0 LU from the median of stops (events) at the listener; 155 ms of silence before the sound
- `stops/sirens/hurt.mp3`: -4.6 LU from the median of stops (events) at the listener
- `stops/sirens/swoop.mp3`: -3.6 LU from the median of stops (events) at the listener; 339 ms of silence before the sound
- `stops/sirens/wave.mp3`: -6.6 LU from the median of stops (events) at the listener
- `stops/suitors/sword.mp3`: +3.1 LU from the median of stops (events) at the listener
- `stops/suitors/throw.mp3`: 196 ms of silence before the sound

### athena

| clip | seconds | LUFS | peak dBTP | lead ms | tail ms | play dB | at the listener |
|---|---|---|---|---|---|---|---|
| `athena/call_aegis_push.mp3` | 2.00 | -16.1 | -1.6 | 22 | 126 | 0.0 | -16.1 |
| `athena/call_any_defend.mp3` | 1.44 | -15.6 | -1.6 | 38 | 91 | 0.0 | -15.6 |
| `athena/call_any_strike.mp3` | 1.36 | -15.5 | -2.3 | 25 | 105 | 0.0 | -15.5 |
| `athena/call_block.mp3` | 1.84 | -15.5 | -3.5 | 36 | 295 | 0.0 | -15.5 |
| `athena/call_chain_punch.mp3` | 2.32 | -16.8 | -1.2 | 21 | 101 | 0.0 | -16.8 |
| `athena/call_cross.mp3` | 2.00 | -16.0 | -1.5 | 48 | 0 | 0.0 | -16.0 |
| `athena/call_dodge_left.mp3` | 1.44 | -16.5 | -3.7 | 23 | 254 | 0.0 | -16.5 |
| `athena/call_dodge_right.mp3` | 1.44 | -14.7 | -1.0 | 16 | 0 | 0.0 | -14.7 |
| `athena/call_double_palm.mp3` | 2.32 | -14.5 | -1.0 | 28 | 157 | 0.0 | -14.5 |
| `athena/call_duck.mp3` | 1.92 | -15.8 | -1.5 | 32 | 295 | 0.0 | -15.8 |
| `athena/call_front_kick.mp3` | 1.84 | -15.8 | -1.0 | 17 | 98 | 0.0 | -15.8 |
| `athena/call_hammer_fist.mp3` | 2.48 | -16.5 | -1.6 | 29 | 118 | 0.0 | -16.5 |
| `athena/call_hook.mp3` | 2.08 | -16.0 | -1.6 | 33 | 254 | 0.0 | -16.0 |
| `athena/call_jab.mp3` | 1.92 | -16.7 | -1.5 | 26 | 105 | 0.0 | -16.7 |
| `athena/call_jump.mp3` | 1.68 | -15.9 | -1.4 | 21 | 250 | 0.0 | -15.9 |
| `athena/call_knee.mp3` | 2.16 | -15.5 | -2.5 | 42 | 179 | 0.0 | -15.5 |
| `athena/call_knife_hand.mp3` | 2.00 | -14.0 | -1.0 | 27 | 265 | 0.0 | -14.0 |
| `athena/call_moon_arrow.mp3` | 2.08 | -15.7 | -1.5 | 28 | 159 | 0.0 | -15.7 |
| `athena/call_overhead_strike.mp3` | 2.16 | -15.5 | -2.0 | 37 | 100 | 0.0 | -15.5 |
| `athena/call_reverse_punch.mp3` | 2.32 | -15.6 | -1.0 | 44 | 152 | 0.0 | -15.6 |
| `athena/call_rising_palm.mp3` | 2.32 | -15.5 | -3.1 | 34 | 112 | 0.0 | -15.5 |
| `athena/call_spear_thrust.mp3` | 2.00 | -15.7 | -1.5 | 12 | 149 | 0.0 | -15.7 |
| `athena/call_stake_thrust.mp3` | 2.72 | -15.6 | -1.5 | 41 | 89 | 0.0 | -15.6 |
| `athena/call_sun_burst.mp3` | 2.48 | -14.9 | -1.0 | 22 | 301 | 0.0 | -14.9 |
| `athena/call_swift_dash.mp3` | 1.84 | -16.0 | -1.6 | 21 | 126 | 0.0 | -16.0 |
| `athena/call_thunderbolt.mp3` | 2.08 | -15.5 | -2.2 | 1 | 0 | 0.0 | -15.5 |
| `athena/call_trident_sweep.mp3` | 2.08 | -16.0 | -1.6 | 23 | 131 | 0.0 | -16.0 |
| `athena/call_uppercut.mp3` | 2.16 | -16.4 | -1.1 | 36 | 279 | 0.0 | -16.4 |
| `athena/fight_start.mp3` | - | - | - | - | - | - | - |
| `athena/loss.mp3` | 3.76 | -15.6 | -1.6 | 34 | 125 | 0.0 | -15.6 |
| `athena/phase_1.mp3` | 1.68 | -15.6 | -1.5 | 22 | 261 | 0.0 | -15.6 |
| `athena/phase_2.mp3` | 2.40 | -15.5 | -1.6 | 23 | 0 | 0.0 | -15.5 |
| `athena/phase_any.mp3` | 2.40 | -16.5 | -1.6 | 20 | 134 | 0.0 | -16.5 |
| `athena/phase_eurymachus.mp3` | 2.24 | -15.5 | -3.7 | 35 | 214 | 0.0 | -15.5 |
| `athena/phase_six_heads.mp3` | 2.56 | -16.5 | -1.5 | 32 | 180 | 0.0 | -16.5 |
| `athena/phase_the_fig_tree.mp3` | 2.32 | -15.5 | -2.6 | 36 | 140 | 0.0 | -15.5 |
| `athena/phase_the_meadow_of_bones.mp3` | 2.16 | -15.6 | -1.9 | 0 | 124 | 0.0 | -15.6 |
| `athena/phase_the_song.mp3` | 2.08 | -15.5 | -3.0 | 25 | 183 | 0.0 | -15.5 |
| `athena/phase_the_spew.mp3` | 2.48 | -16.3 | -1.6 | 7 | 127 | 0.0 | -16.3 |
| `athena/phase_the_toll.mp3` | 2.80 | -15.5 | -2.2 | 23 | 125 | 0.0 | -15.5 |
| `athena/phase_the_volley.mp3` | 2.56 | -15.5 | -1.6 | 38 | 179 | 0.0 | -15.5 |
| `athena/phase_the_wand.mp3` | 2.16 | -15.6 | -1.5 | 32 | 118 | 0.0 | -15.6 |
| `athena/phase_unmasked.mp3` | 2.08 | -15.5 | -3.1 | 23 | 98 | 0.0 | -15.5 |
| `athena/praise_1.mp3` | 1.36 | -15.5 | -1.6 | 44 | 88 | 0.0 | -15.5 |
| `athena/praise_2.mp3` | 1.44 | -15.5 | -2.4 | 21 | 263 | 0.0 | -15.5 |
| `athena/praise_3.mp3` | 1.36 | -15.5 | -1.8 | 17 | 265 | 0.0 | -15.5 |
| `athena/warn_1.mp3` | 1.12 | -15.6 | -1.6 | 48 | 49 | 0.0 | -15.6 |
| `athena/warn_2.mp3` | 1.28 | -15.5 | -1.1 | 17 | 98 | 0.0 | -15.5 |
| `athena/warn_3.mp3` | 1.36 | -15.9 | -2.1 | 36 | 236 | 0.0 | -15.9 |
| `athena/win.mp3` | 3.28 | -14.1 | -1.4 | 17 | 140 | 0.0 | -14.1 |

### athena (Homer)

| clip | seconds | LUFS | peak dBTP | lead ms | tail ms | play dB | at the listener |
|---|---|---|---|---|---|---|---|
| `athena/homer_intro_polyphemus.mp3` | 9.20 | -19.0 | -1.5 | 27 | 154 | 0.0 | -19.0 |
| `athena/homer_loss.mp3` | 5.84 | -19.0 | -1.6 | 57 | 160 | 0.0 | -19.0 |
| `athena/homer_title.mp3` | 4.40 | -19.0 | -1.5 | 29 | 265 | 0.0 | -19.0 |
| `athena/homer_win.mp3` | 4.64 | -19.0 | -1.6 | 21 | 118 | 0.0 | -19.0 |

### athena (Polyphemus)

| clip | seconds | LUFS | peak dBTP | lead ms | tail ms | play dB | at the listener |
|---|---|---|---|---|---|---|---|
| `athena/taunt_polyphemus_1.mp3` | 3.20 | -19.0 | -2.7 | 20 | 149 | -3.1 | -22.1 |
| `athena/taunt_polyphemus_2.mp3` | 2.80 | -19.0 | -2.2 | 39 | 186 | -3.1 | -22.1 |
| `athena/taunt_polyphemus_3.mp3` | 4.88 | -19.0 | -2.5 | 21 | 136 | -3.1 | -22.1 |
| `athena/taunt_polyphemus_4.mp3` | 2.64 | -20.4 | -3.5 | 36 | 113 | -3.1 | -23.5 |

### music

| clip | seconds | LUFS | peak dBTP | lead ms | tail ms | play dB | at the listener |
|---|---|---|---|---|---|---|---|
| `music/fight.mp3` | 48.07 | -14.8 | -1.2 | 30 | 17 | -19.2 | -34.0 |
| `music/loss.mp3` | 7.55 | -9.8 | -1.4 | 206 | 1275 | -22.5 | -32.3 |
| `music/menu.mp3` | 30.00 | -37.7 | -23.9 | 0 | 0 | 1.2 | -36.5 |
| `music/win.mp3` | 6.03 | -11.0 | -1.0 | 24 | 1757 | -17.6 | -28.6 |

### narration

| clip | seconds | LUFS | peak dBTP | lead ms | tail ms | play dB | at the listener |
|---|---|---|---|---|---|---|---|
| `narration/homer_after_charybdis.mp3` | 6.32 | -19.0 | -1.5 | 50 | 127 | 0.0 | -19.0 |
| `narration/homer_after_circe.mp3` | 8.00 | -19.0 | -1.5 | 39 | 118 | 0.0 | -19.0 |
| `narration/homer_after_polyphemus.mp3` | 7.28 | -19.0 | -2.0 | 29 | 139 | 0.0 | -19.0 |
| `narration/homer_after_scylla.mp3` | 7.12 | -19.5 | -1.6 | 25 | 110 | 0.0 | -19.5 |
| `narration/homer_after_sirens.mp3` | 7.20 | -20.1 | -1.6 | 40 | 163 | 0.0 | -20.1 |
| `narration/homer_after_suitors.mp3` | 8.72 | -19.1 | -1.7 | 23 | 0 | 0.0 | -19.1 |
| `narration/homer_before_charybdis.mp3` | 8.40 | -19.0 | -1.5 | 71 | 127 | 0.0 | -19.0 |
| `narration/homer_before_circe.mp3` | 8.72 | -19.0 | -1.6 | 59 | 149 | 0.0 | -19.0 |
| `narration/homer_before_scylla.mp3` | 7.76 | -19.0 | -1.5 | 70 | 132 | 0.0 | -19.0 |
| `narration/homer_before_sirens.mp3` | 6.96 | -19.0 | -1.6 | 39 | 148 | 0.0 | -19.0 |
| `narration/homer_before_suitors.mp3` | 6.96 | -19.0 | -2.3 | 40 | 124 | 0.0 | -19.0 |

### sfx

| clip | seconds | LUFS | peak dBTP | lead ms | tail ms | play dB | at the listener |
|---|---|---|---|---|---|---|---|
| `sfx/defended.mp3` | 0.80 | -15.4 | -1.2 | 0 | 144 | -8.0 | -23.4 |
| `sfx/enemyHit.mp3` | 0.88 | -13.9 | -1.3 | 88 | 182 | -6.0 | -19.9 |
| `sfx/finished.mp3` | 2.48 | -10.7 | -1.5 | 0 | 0 | -6.0 | -16.7 |
| `sfx/lost.mp3` | 3.00 | -31.1 | -18.9 | 31 | 193 | -7.4 | -38.5 |
| `sfx/opening.mp3` | 0.60 | -29.2 | -18.8 | 0 | 36 | -12.0 | -41.2 |
| `sfx/phaseChanged.mp3` | 1.48 | -30.3 | -11.7 | 0 | 0 | -6.0 | -36.3 |
| `sfx/playerHit.mp3` | 0.68 | -22.6 | -6.2 | 197 | 244 | -6.0 | -28.6 |
| `sfx/powerUnleashed.mp3` | 2.00 | -14.4 | -1.5 | 0 | 35 | -6.0 | -20.4 |
| `sfx/telegraph.mp3` | 1.00 | -18.4 | -1.4 | 15 | 0 | -7.4 | -25.8 |
| `sfx/whiffed.mp3` | 0.48 | -28.5 | -10.4 | 0 | 0 | -11.2 | -39.7 |
| `sfx/won.mp3` | 3.00 | -15.5 | -1.1 | 0 | 617 | -7.4 | -22.9 |

### stops (ambience)

| clip | seconds | LUFS | peak dBTP | lead ms | tail ms | play dB | at the listener |
|---|---|---|---|---|---|---|---|
| `stops/charybdis/ambience.mp3` | 30.00 | -12.2 | -1.5 | 0 | 0 | -26.0 | -38.2 |
| `stops/circe/ambience.mp3` | 30.00 | -38.0 | -10.8 | 0 | 0 | -1.1 | -39.1 |
| `stops/scylla/ambience.mp3` | 30.00 | -15.0 | -1.1 | 0 | 0 | -22.6 | -37.6 |
| `stops/sirens/ambience.mp3` | 30.00 | -31.0 | -18.0 | 0 | 0 | -6.9 | -37.9 |
| `stops/suitors/ambience.mp3` | 30.00 | -23.0 | -5.0 | 0 | 0 | -15.4 | -38.4 |

### stops (events)

| clip | seconds | LUFS | peak dBTP | lead ms | tail ms | play dB | at the listener |
|---|---|---|---|---|---|---|---|
| `stops/charybdis/crash.mp3` | 1.20 | -29.3 | -13.6 | 0 | 0 | 4.1 | -25.2 |
| `stops/charybdis/gulp.mp3` | 1.60 | -22.3 | -4.7 | 39 | 0 | -2.2 | -24.5 |
| `stops/charybdis/hurt.mp3` | 1.00 | -36.3 | -22.4 | 0 | 0 | 14.7 | -21.6 |
| `stops/charybdis/spout.mp3` | 1.28 | -13.3 | -1.2 | 0 | 0 | -6.9 | -20.2 |
| `stops/circe/defeat.mp3` | 2.48 | -22.0 | -5.5 | 0 | 341 | -1.2 | -23.2 |
| `stops/circe/hurt.mp3` | 0.88 | -18.3 | -0.6 | 0 | 447 | -6.4 | -24.7 |
| `stops/circe/squeal.mp3` | 1.20 | -12.3 | -0.6 | 0 | 0 | -6.2 | -18.5 |
| `stops/circe/wand.mp3` | 1.20 | -15.4 | -6.3 | 0 | 104 | -1.6 | -17.0 |
| `stops/scylla/howl.mp3` | 2.00 | -26.3 | -13.2 | 0 | 248 | 5.1 | -21.2 |
| `stops/scylla/hurt.mp3` | 0.88 | -15.4 | -3.4 | 0 | 0 | -7.9 | -23.3 |
| `stops/scylla/snap.mp3` | 0.68 | -33.9 | -9.2 | 155 | 468 | 2.5 | -31.4 |
| `stops/scylla/snarl.mp3` | 1.28 | -38.0 | -21.4 | 22 | 0 | 14.5 | -23.5 |
| `stops/sirens/hurt.mp3` | 0.88 | -30.1 | -10.0 | 0 | 0 | 3.1 | -27.0 |
| `stops/sirens/note.mp3` | 1.76 | -14.9 | -7.1 | 0 | 0 | -4.8 | -19.7 |
| `stops/sirens/swoop.mp3` | 1.20 | -31.9 | -12.6 | 339 | 381 | 5.9 | -26.0 |
| `stops/sirens/wave.mp3` | 1.00 | -37.3 | -15.2 | 0 | 0 | 8.3 | -29.0 |
| `stops/suitors/hurt.mp3` | 0.88 | -16.7 | -4.5 | 107 | 61 | -3.0 | -19.7 |
| `stops/suitors/jeer.mp3` | 1.60 | -12.5 | -1.2 | 61 | 10 | -7.0 | -19.5 |
| `stops/suitors/sword.mp3` | 1.00 | -14.2 | -1.4 | 6 | 0 | -5.1 | -19.3 |
| `stops/suitors/throw.mp3` | 0.88 | -15.6 | -2.2 | 196 | 71 | -4.6 | -20.2 |

### taunts

| clip | seconds | LUFS | peak dBTP | lead ms | tail ms | play dB | at the listener |
|---|---|---|---|---|---|---|---|
| `taunts/taunt_charybdis_1.mp3` | 4.88 | -19.0 | -2.6 | 25 | 108 | -3.1 | -22.1 |
| `taunts/taunt_charybdis_2.mp3` | 2.64 | -19.5 | -1.5 | 27 | 122 | -3.1 | -22.6 |
| `taunts/taunt_charybdis_3.mp3` | 4.00 | -19.0 | -1.7 | 32 | 150 | -3.1 | -22.1 |
| `taunts/taunt_circe_1.mp3` | 3.52 | -19.0 | -1.5 | 49 | 140 | -3.1 | -22.1 |
| `taunts/taunt_circe_2.mp3` | 3.44 | -19.0 | -1.5 | 83 | 1 | -3.1 | -22.1 |
| `taunts/taunt_circe_3.mp3` | 3.68 | -19.5 | -1.5 | 45 | 197 | -3.1 | -22.6 |
| `taunts/taunt_scylla_1.mp3` | 3.04 | -20.5 | -3.7 | 39 | 133 | -3.1 | -23.6 |
| `taunts/taunt_sirens_1.mp3` | 5.76 | -19.0 | -3.3 | 84 | 116 | -3.1 | -22.1 |
| `taunts/taunt_sirens_2.mp3` | 4.40 | -19.0 | -3.0 | 33 | 126 | -3.1 | -22.1 |
| `taunts/taunt_sirens_3.mp3` | 5.20 | -19.0 | -1.9 | 43 | 106 | -3.1 | -22.1 |
| `taunts/taunt_suitors_1.mp3` | 4.08 | -19.0 | -2.7 | 29 | 151 | -3.1 | -22.1 |
| `taunts/taunt_suitors_2.mp3` | 4.56 | -19.0 | -1.5 | 37 | 186 | -3.1 | -22.1 |
| `taunts/taunt_suitors_3.mp3` | 4.32 | -18.8 | -1.0 | 28 | 0 | -3.1 | -21.9 |

<!-- levels:end -->
