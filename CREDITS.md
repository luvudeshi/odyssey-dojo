# Credits

Every file in the game's `public` folder has a row here. There are three kinds:

- Art we downloaded: skies, textures and models. All of it is CC0 (public domain) except one model: the columns of Circe's hall are CC BY 3.0, and their row carries the credit that licence asks for.
- Things the team made: the voices, sounds and music (generated with ElevenLabs), and the icons and the browser tab emblem (drawn in code).
- Bundled software: the pose tracker and the mesh decoder, which Google publishes under the Apache License 2.0. They are at the end of this file.

`make credits` checks that no file is missing. `docs/licences.md` has the full list and says which sources were opened to check each licence.

## Skies and textures

CC0 (public domain) from Poly Haven, https://polyhaven.com. The authors are the ones each asset's page names.

| Asset | Used for | URL | Licence |
|---|---|---|---|
| Small Cave (1K HDRI), by Andreas Mischok | Cave reflections and ambient light, `public/hdri/small_cave_1k.hdr` | https://polyhaven.com/a/small_cave | CC0 |
| Qwantani Dusk 2 Puresky (1K HDRI), by Greg Zaal (photography) and Jarod Guest (processing) | Sunset sky seen through the cave mouth and soft dusk light, `public/hdri/qwantani_dusk_2_puresky_1k.hdr` | https://polyhaven.com/a/qwantani_dusk_2_puresky | CC0 |
| Rock Surface (1K diffuse, normal GL, roughness), by Amal Kumar | Cave walls, `public/textures/rock_surface_*` | https://polyhaven.com/a/rock_surface | CC0 |
| Rocky Trail (1K diffuse, normal GL, roughness), by Amal Kumar | Cave floor, `public/textures/rocky_trail_*` | https://polyhaven.com/a/rocky_trail | CC0 |

The cave arena and hit effects start from work by tagrawal029 (branch `feat/arena-effects-screens`).

The cave mouth at dusk (`src/render/arena/cave/`) is built in code: no other files ship with it.

## Development test model

| Asset | Used for | URL | Licence |
|---|---|---|---|
| RobotExpressive.glb, by Tomás Laulhé (Quaternius), with changes by Don McCurdy, via the three.js examples | Development test model only, `public/models/dev/RobotExpressive.glb`, shown with `?model=dev` to test the GLB pipeline. Not game art | https://github.com/mrdoob/three.js/tree/r187/examples/models/gltf/RobotExpressive | CC0 |

## Hero

| Asset | Used for | URL | Licence |
|---|---|---|---|
| Universal Animation Library 1 and 2 mannequin and clips, by Quaternius, trimmed, with authored stand-in poses | `public/models/hero/spartan.glb`, the player's hero | https://quaternius.com/packs/universalanimationlibrary.html and https://quaternius.com/packs/universalanimationlibrary2.html, and the same packs at https://quaternius.itch.io/universal-animation-library and https://quaternius.itch.io/universal-animation-library-2 (all four pages say CC0). Viewer: https://quaternius.com/animviewer.html | CC0 |

His helmet, cuirass, cape, greaves, shield, spear and stake are built in code (`src/render/hero/gear/`): no other files ship with him.

## Polyphemus

| Asset | Used for | URL | Licence |
|---|---|---|---|
| Giant, by Quaternius, via Poly Pizza | `public/models/polyphemus/giant.glb`, Polyphemus | https://poly.pizza/m/BldaiPtyJa | CC0 |

## The Suitors

| Asset | Used for | URL | Licence |
|---|---|---|---|
| Universal Base Characters mannequin and Universal Animation Library 2 clips, by Quaternius, trimmed to 11 clips | `public/models/suitors/suitor.glb`, the suitors in the great hall | https://quaternius.com/packs/universalbasecharacters.html and https://quaternius.com/packs/universalanimationlibrary2.html, and the same packs at https://quaternius.itch.io/universal-base-characters and https://quaternius.itch.io/universal-animation-library-2 (all four pages say CC0) | CC0 |
| KayKit Dungeon Remastered 1.0, by Kay Lousberg: long feast table with a tablecloth, stool, chair and food platter, unchanged | `public/models/suitors/kkd_*.glb`, the feast tables in the great hall | https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 (its `LICENSE.txt` says CC0) | CC0 |
| Wooden Axe (1K), by Ulan Cabanilla, from Poly Haven. The diffuse and ARM maps and the mesh are unchanged; the `.gltf` was edited to leave out the normal map | `public/models/suitors/ph/wooden_axe/`, the twelve axes for the bow contest | https://polyhaven.com/a/wooden_axe | CC0 |

The suitors' gear and the hall itself are built in code (`src/render/monsters/suitors/`, `src/render/arena/suitors/`). Circe, the Sirens and Scylla are built in code too and ship no model file of their own; the columns of Circe's hall are downloaded and have their own section below. The logs are in `docs/models/`.

## Charybdis

The whirlpool is built in code. The anglerfish, tentacles and scenery are downloaded; the log is `docs/models/charybdis.md`.

| Asset | Used for | URL | Licence |
|---|---|---|---|
| Anglerfish, by Quaternius, via Poly Pizza | `public/models/charybdis/Anglerfish.glb`, the fish that lunges out of the whirlpool | https://poly.pizza/m/MRjSlwCjHM | CC0 |
| Tentacle, by Quaternius, via Poly Pizza | `public/models/charybdis/Tentacle.glb`, the arms on the whirlpool's rim | https://poly.pizza/m/BR1vpIvvvv | CC0 |
| Viking Boat, by Quaternius, via Poly Pizza | `public/models/charybdis/Viking_boat.glb`, a wrecked boat on the water | https://poly.pizza/m/J7SCPiNoSy | CC0 |
| Sail Ship, by Quaternius, via Poly Pizza | `public/models/charybdis/Sail_ship.glb`, a wrecked ship on the water | https://poly.pizza/m/cIzO4MBPqI | CC0 |
| Rock_4, Rock_6, Rock_Moss_4, CommonTree_5 and CommonTree_Dead_3, by Quaternius. The model log names the Ultimate Nature Pack as their source | `public/models/charybdis/Rock_4.glb`, `public/models/charybdis/Rock_6.glb`, `public/models/charybdis/Rock_Moss_4.glb`, `public/models/charybdis/CommonTree_5.glb`, `public/models/charybdis/CommonTree_Dead_3.glb`, the sea stacks, the cliffs and the fig tree | https://quaternius.com/packs/ultimatenature.html | CC0 |
| Rock Moss Set 01 (1K), by Kless Gyzen, from Poly Haven, unchanged | Rocks of the tentacle look (`?look=b`), `public/models/charybdis/rocks/` | https://polyhaven.com/a/rock_moss_set_01 | CC0 |

The sea and the sky of the Charybdis stop use the Water and Sky examples of three.js (https://github.com/mrdoob/three.js, MIT). They are code from the `three` npm package, compiled into the game: no file under `public` comes from them, and the water's normal map is made in code.

## Icons

| Asset | File | Source | Licence |
|---|---|---|---|
| Ship, owl, palmette and laurel ornaments of the pottery look | `public/ui/ship.svg`, `public/ui/owl.svg`, `public/ui/palmette.svg`, `public/ui/laurel.svg` | SVG shapes written in code for PR #134 | Drawn by the team |
| The ship between Scylla and Charybdis, the picture behind the main menu | `public/ui/menu-scylla.webp` | Painted on the team's laptop on 2026-11-14 with the FLUX.2 Klein 4B model run locally through mflux (model licence Apache 2.0), from our own prompt, which names no artist or existing work. Rain, lightning and mist are CSS in `src/screens/menuScene.css` | Generated by the team |
| Pebble mosaic emblem in the browser tab | `public/favicon.svg` | Written by our own script, `npx tsx scripts/gen-pebble-favicon.ts`, which draws the emblem of `src/ui/pebble/brand.ts` as SVG stones (PR #218). It replaced the eye icon of PR #105 | Drawn by the team |

The pebble mosaic logo and emblem on the screens are drawn by the same code while the game runs (`src/ui/pebble/`). The guard shield, the power effects and Polyphemus's thrown boulder are drawn in code too (`src/render/effects/`). None of them ships a file.

## Circe

| Asset | Used for | URL | Licence |
|---|---|---|---|
| "Doric Greek Column" by Victor Viña, via Poly Pizza | `public/models/circe/doric.glb`, the six marble columns of Circe's portico | https://poly.pizza/m/5VD5-v8NBZ4 | CC BY 3.0. Credit: "Doric Greek Column" by Victor Viña, CC BY 3.0, via Poly Pizza |

The licence is Creative Commons Attribution 3.0, https://creativecommons.org/licenses/by/3.0/. The game scales the column and stands six copies of it on the portico.

## Voices and sound effects

Generated by the team on 2026-11-14 with our own ElevenLabs account (Creator plan, a paid plan). On that day the four folders held 93 clips, 4.8 MB in all. 85 of them were made with `server/tools/genClips.ts`, which reads `ELEVENLABS_API_KEY` from `.env`. The row for the other eight says how they differ.

- The speech clips came from the ElevenLabs text to speech endpoint (`POST /v1/text-to-speech/<voice id>`), as MP3 at 128 kbps. The tool tries model `eleven_v4` first and `eleven_multilingual_v2` second. The voices are from this account's ElevenLabs voice list (`GET /v2/voices`), picked by name in `server/ai/voices.ts`.
- The sound effects came from the ElevenLabs sound effects endpoint (`POST /v1/sound-generation`, model `eleven_text_to_sound_v3`), as MP3 at 128 kbps. The prompts are in `server/tools/genClips.ts`. They describe a sound only, and name no artist, film, game or existing recording.
- The lines spoken are in `src/audio/athenaLines.ts`, `src/audio/storyLines.ts` and `src/audio/narrationLines.ts`. The tables in `docs/athena-lines.md` and `docs/narration-lines.md` show them.
- To make a missing clip, run the command in its row. Add `--force` to make every clip of that command again.

A row that names a folder covers every clip in it. A clip added to one of these folders must be made the same way, or get a row of its own.

| Clips | Files | Source | Licence |
|---|---|---|---|
| Athena's 50 coaching lines | `public/audio/athena/` | ElevenLabs text to speech, model `eleven_v4`, voice Sarah. Made with `npx tsx server/tools/genClips.ts athena`. The 13 newest (the two kick calls, the 10 phase lines for the later stops and `phase_any`) were made with the same command on the same day. The voice and model the tool picked for those 13 were not written down; it tries Sarah and `eleven_v4` first. One of them, `call_knee.mp3`, was made again later the same day with the same command, because a speech to text check heard its first word as "Me" (`docs/audio-heard.md`). The tool logged voice Sarah and model `eleven_v4` for that take | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see below |
| Homer's first 4 lines and Polyphemus's 4 taunts, kept beside Athena's | `public/audio/athena/homer_*.mp3` and `public/audio/athena/taunt_polyphemus_*.mp3` | ElevenLabs text to speech, voices George (Homer) and Callum (Polyphemus). Recorded once, for PR #90. The model was not written down, and `genClips.ts` has no command that makes these eight again | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see below |
| Homer's 12 lines: 11 before and after the stops of the quest, and his closing line for the homecoming (`homer_homecoming.mp3`, made on 14 November 2026 with the same command, voice and model) | `public/audio/narration/` | ElevenLabs text to speech, model `eleven_v4`, voice George. Made with `npx tsx server/tools/genClips.ts story` | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see below |
| 15 taunts of the later monsters | `public/audio/taunts/` | ElevenLabs text to speech, model `eleven_v4`, voices Lily (Circe), Jessica (the Sirens), Harry (Scylla), Brian (Charybdis) and Liam (the suitors). Made with `npx tsx server/tools/genClips.ts story`. The two newest, `taunt_scylla_2.mp3` and `taunt_scylla_3.mp3`, were made later the same day with the same command; the tool logged voice Harry and model `eleven_v4` for both | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see below |
| 17 sound effects: 11 fight sound effects, one for each combat event, the chime for an unlocked achievement (`unlock.mp3`), one sound for each kind of defend (`defendBlock.mp3`, `defendDodge.mp3`, `defendDuck.mp3`, `defendJump.mp3`) and the war horn of a phase change (`phaseSting.mp3`) | `public/audio/sfx/` | ElevenLabs sound effects. Made with `npx tsx server/tools/genClips.ts sfx`. The chime and the four defend sounds were made later the same day with the same command, are 9 KB to 18 KB each (62 KB in all) and are as the endpoint returned them. The chime and the dodge are each the fifth take and the duck the second. The war horn was made on 2026-11-15 with the same command, is 27 KB, is as the endpoint returned it and is the third take of four. The prompts in `server/tools/genClips.ts` are the ones that made the files, and the notes beside them say what the other takes were | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see below |

The voices, and the speech model where a row gives one, are the ones written down when the clips were made: PR #55 and PR #68 for Athena, PR #90 for the voices of the eight clips beside hers, and `docs/narration-lines.md` for the narration and the taunts. The sound effects model is the one `server/ai/elevenlabs.ts` names. The MP3 files do not record any of this.

The ElevenLabs Terms of Service apply to these clips as they do to the music. What the terms say is at the end of the next section. These clips are not CC0 and not CC BY.

## Music and ambience

The three looping tracks are by Shane Ivers (Silverman Sound Studios), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). The two battle tracks were downloaded on 2026-11-14 and the menu track on 2026-11-15, each from its own page, which states the licence, then re-encoded from 320 to 128 kbps with its tags removed. The game loops each one by mixing its ending into its opening. The three files total 7.5 MB.

The two stings were generated by the team on 2026-11-14 with our own ElevenLabs account (Creator plan, a paid plan), by running `npx tsx server/tools/genClips.ts music`. The prompts are in `server/tools/genClips.ts`. They describe instruments and mood only, and name no artist, film, game or existing piece.

| Clip | File | Source | Licence |
|---|---|---|---|
| Menu music, looped on every screen outside a fight | `public/audio/music/menu.mp3` | https://www.silvermansound.com/free-music/the-rise-of-heroes | "The Rise Of Heroes" by Shane Ivers, is licensed under CC BY 4.0. Music: The Rise Of Heroes by Shane Ivers - https://www.silvermansound.com |
| Battle music, looped during a fight | `public/audio/music/fight.mp3` | https://www.silvermansound.com/free-music/passage-of-arms | "Passage Of Arms" by Shane Ivers, is licensed under CC BY 4.0. Music: Passage Of Arms by Shane Ivers - https://www.silvermansound.com |
| Battle music for the last stop, looped | `public/audio/music/boss.mp3` | https://www.silvermansound.com/free-music/the-fall-of-heroes | "The Fall Of Heroes" by Shane Ivers, is licensed under CC BY 4.0. Music: The Fall Of Heroes by Shane Ivers - https://www.silvermansound.com |
| Win sting | `public/audio/music/win.mp3` | ElevenLabs music endpoint (`POST /v1/music`, model `music_v1`, instrumental only) | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service and Music Terms, see below |
| Loss sting | `public/audio/music/loss.mp3` | ElevenLabs music endpoint (`POST /v1/music`, model `music_v1`, instrumental only) | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service and Music Terms, see below |

What the terms say, as read on 2026-11-14 (both pages were last updated 9 October 2026):

- [ElevenLabs Terms of Service](https://elevenlabs.io/terms-of-use): between the user and ElevenLabs, the user keeps the rights in their output (section 4(c)). Paid subscribers may use the services for commercial purposes, within the Prohibited Use Policy (section 1(c)). The page does not mention sound effects by name.
- [ElevenLabs Music Terms](https://elevenlabs.io/music-terms): on the Creator plan, music output may be used commercially online and offline, except in film, TV, radio and "Studio Games". Games under the page's indie revenue limits are allowed. No attribution is required on paid plans. The Creator plan is for individual use. The user is responsible for clearing output before publishing it.

These terms cover our own use in this game. They are not an open licence: the clips are not CC0, and this file does not grant anyone else the right to reuse them.

## Sounds of the later stops

Generated by the team on 2026-11-14 with our own ElevenLabs account (Creator plan, a paid plan), by running `npx tsx server/tools/genClips.ts stops`. Every clip came from the ElevenLabs sound effects endpoint (`POST /v1/sound-generation`, model `eleven_text_to_sound_v3`). Nothing was downloaded from anywhere else. The prompts are in `server/tools/stopClips.ts`. They describe a sound only, and name no artist, film, game or existing piece. Which clip plays when is in `src/audio/stopSounds.ts`.

The five ambience clips were asked for with `loop: true` as 30 seconds of MP3 at 96 kbps, and are 360,847 bytes each. The twenty short clips are MP3 at 128 kbps, between 0.7 and 2.5 seconds and 12 KB to 41 KB each. The 25 files total 2.2 MB, and the game loads only the clips of the stop being fought.

| Clip | File | Source | Licence |
|---|---|---|---|
| Circe: hall fire and forest night, looped | `public/audio/stops/circe/ambience.mp3` | ElevenLabs sound effects, `loop: true` | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Circe: wand crackle | `public/audio/stops/circe/wand.mp3` | ElevenLabs sound effects | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Circe: pig squeal | `public/audio/stops/circe/squeal.mp3` | ElevenLabs sound effects | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Circe: struck | `public/audio/stops/circe/hurt.mp3` | ElevenLabs sound effects | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Circe: her spell breaks | `public/audio/stops/circe/defeat.mp3` | ElevenLabs sound effects | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Sirens: calm sea and a wordless song, looped | `public/audio/stops/sirens/ambience.mp3` | ElevenLabs sound effects, `loop: true` | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Sirens: one sung note, no words | `public/audio/stops/sirens/note.mp3` | ElevenLabs sound effects | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Sirens: swoop of wings | `public/audio/stops/sirens/swoop.mp3` | ElevenLabs sound effects | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Sirens: struck | `public/audio/stops/sirens/hurt.mp3` | ElevenLabs sound effects | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Sirens: wave slap on the hull | `public/audio/stops/sirens/wave.mp3` | ElevenLabs sound effects | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Scylla: strait wind and water on rock, looped | `public/audio/stops/scylla/ambience.mp3` | ElevenLabs sound effects, `loop: true` | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Scylla: snarl of many heads | `public/audio/stops/scylla/snarl.mp3` | ElevenLabs sound effects | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Scylla: snap of jaws | `public/audio/stops/scylla/snap.mp3` | ElevenLabs sound effects | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Scylla: struck | `public/audio/stops/scylla/hurt.mp3` | ElevenLabs sound effects | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Scylla: howl | `public/audio/stops/scylla/howl.mp3` | ElevenLabs sound effects | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Charybdis: roaring whirlpool, looped | `public/audio/stops/charybdis/ambience.mp3` | ElevenLabs sound effects, `loop: true` | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Charybdis: gulp of the sea | `public/audio/stops/charybdis/gulp.mp3` | ElevenLabs sound effects | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Charybdis: spout | `public/audio/stops/charybdis/spout.mp3` | ElevenLabs sound effects | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Charybdis: wave crashing down | `public/audio/stops/charybdis/crash.mp3` | ElevenLabs sound effects | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Charybdis: struck | `public/audio/stops/charybdis/hurt.mp3` | ElevenLabs sound effects | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Suitors: a hall with a hearth and a crowd of men, looped | `public/audio/stops/suitors/ambience.mp3` | ElevenLabs sound effects, `loop: true` | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Suitors: thrown spear | `public/audio/stops/suitors/throw.mp3` | ElevenLabs sound effects | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Suitors: drawn sword | `public/audio/stops/suitors/sword.mp3` | ElevenLabs sound effects | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Suitors: jeering men, no words | `public/audio/stops/suitors/jeer.mp3` | ElevenLabs sound effects | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Suitors: struck | `public/audio/stops/suitors/hurt.mp3` | ElevenLabs sound effects | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |

As with the music, these terms cover our own use in this game. The clips are generated, not CC0 and not CC BY.

## Sounds of the gods' powers

Generated by the team on 2026-11-14 with our own ElevenLabs account (Creator plan, a paid plan), by running `npx tsx server/tools/genClips.ts power`. Every clip came from the ElevenLabs sound effects endpoint (`POST /v1/sound-generation`, model `eleven_text_to_sound_v3`), as MP3 at 128 kbps. Nothing was downloaded from anywhere else. The prompts are in `server/tools/powerClips.ts`. They describe a sound only, and name no artist, film, game or existing piece. `src/audio/powerSound.ts` plays the clip of the player's god when the power goes off.

The six clips are 1.2 to 2.2 seconds and 20 KB to 36 KB each, 177 KB in all, and the game loads only the clip of the god in the fight. The files are as the endpoint returned them. Artemis's clip is the second of three takes: the prompt in `server/tools/powerClips.ts` is the one that made it, and the notes beside it say what the other two takes were.

| Clip | File | Source | Licence |
|---|---|---|---|
| Zeus, thunderbolt: a crack of thunder | `public/audio/power/zeus.mp3` | ElevenLabs sound effects | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Poseidon, trident sweep: a wave crashing | `public/audio/power/poseidon.mp3` | ElevenLabs sound effects | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Athena, aegis push: a bronze shield ringing out | `public/audio/power/athena.mp3` | ElevenLabs sound effects | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Hermes, swift dash: a rush of wind and wings | `public/audio/power/hermes.mp3` | ElevenLabs sound effects | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Artemis, moon arrow: a bowstring and an arrow | `public/audio/power/artemis.mp3` | ElevenLabs sound effects | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |
| Apollo, sun burst: a blaze swelling | `public/audio/power/apollo.mp3` | ElevenLabs sound effects | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see above |

As with the music, these terms cover our own use in this game. The clips are generated, not CC0 and not CC BY.

## Bundled software and model files

These files are not art. They are code and one machine-learning model, published by Google under the Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0). They are copied in unchanged so the game runs with no network.

Each file is named here. A new file in one of these two folders needs its own row: the check does not take a folder as a credit for software.

| Software | Files | Source | Licence |
|---|---|---|---|
| Draco mesh decoder by Google (the glTF build, as shipped in `three` 0.187.0 under `examples/jsm/libs/draco/gltf/`). It unpacks compressed models | `public/draco/draco_decoder.js`, `public/draco/draco_decoder.wasm`, `public/draco/draco_wasm_wrapper.js` | https://github.com/google/draco | Apache-2.0 |
| MediaPipe Tasks Vision 1.2.3 runtime by Google (the `wasm` folder of the npm package `@mediapipe/tasks-vision`). It runs the pose tracker in the browser | `public/mediapipe/wasm/vision_wasm_internal.js`, `public/mediapipe/wasm/vision_wasm_internal.wasm`, `public/mediapipe/wasm/vision_wasm_module_internal.js`, `public/mediapipe/wasm/vision_wasm_module_internal.wasm` | https://github.com/google-ai-edge/mediapipe | Apache-2.0 |
| Pose Landmarker (lite) model by Google (BlazePose GHUM 3D; model card authors Valentin Bazarevsky, Ivan Grishchenko and Eduard Gabriel Bazavan). It finds the player's body in the camera picture | `public/mediapipe/pose_landmarker_lite.task` | https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task and its model card, https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf | Apache-2.0 |

What was checked on 2026-11-14:

- The three Draco files have the same SHA-256 as the files in `node_modules/three/examples/jsm/libs/draco/gltf/`. The README in the folder above them says "Apache License 2.0" and links to Google's repository, whose `LICENSE` file is the Apache License 2.0.
- The four runtime files have the same SHA-256 as the `wasm` folder of `@mediapipe/tasks-vision` 1.2.3. That package's `package.json` says `"license": "Apache-2.0"`. The package has no licence file of its own. The `LICENSE` file of Google's MediaPipe repository is the Apache License 2.0.
- The model file has the MD5 that Google's server reports for the address above. The model card says "Licensed under Apache License, Version 2.0".
- The `mediapipe` folder is not in git. `make setup` fills it (`scripts/vendor-pose.sh`), and it ships with the built game.

The npm packages the game is built from (three.js, React and the rest) are compiled into its JavaScript. They are not files under `public`, and this file does not list them.
