# Credits

Every file in the game's `public` folder has a row here. There are three kinds:

- Art we downloaded: skies, textures and models. All of it is CC0 (public domain).
- Things the team made: the voices, sounds and music (generated with ElevenLabs) and the icons (drawn in code).
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

Their gear, the hall and its props are built in code (`src/render/monsters/suitors/`, `src/render/arena/suitors/`). Circe, the Sirens and Scylla are built in code too and ship no model file. Their logs are in `docs/models/`.

## Charybdis

The whirlpool is built in code. The anglerfish, tentacles and scenery are downloaded; the log is `docs/models/charybdis.md`.

| Asset | Used for | URL | Licence |
|---|---|---|---|
| Anglerfish, Tentacle, Rock_4, Rock_6, Rock_Moss_4, CommonTree_5, CommonTree_Dead_3, Viking_boat, Sail_ship, by Quaternius | Charybdis and her strait, `public/models/charybdis/*.glb` | https://quaternius.com | CC0 |
| Rock Moss Set 01, by Kless Gyzen | Rocks of the tentacle look (`?look=b`), `public/models/charybdis/rocks/` | https://polyhaven.com/a/rock_moss_set_01 | CC0 |
| three.js Water and Sky examples | Sea and sky of the Charybdis stop | https://github.com/mrdoob/three.js | MIT |

## Icons

| Asset | File | Source | Licence |
|---|---|---|---|
| Ship, owl, palmette and laurel ornaments of the pottery look | `public/ui/ship.svg`, `public/ui/owl.svg`, `public/ui/palmette.svg`, `public/ui/laurel.svg` | SVG shapes written in code for PR #134 | Drawn by the team |
| Eye icon in the browser tab | `public/favicon.svg` | Four plain SVG shapes, added by the lead in PR #105 | Drawn by the team |

## Circe

| Asset | Used for | URL | Licence |
|---|---|---|---|
| "Doric Greek Column" by Victor Vina, via Poly Pizza | `public/models/circe/doric.glb`, the six marble columns of Circe's portico | https://poly.pizza/m/5VD5-v8NBZ4 | CC BY 3.0, credit: Victor Vina |

## The Suitors

| Asset | Used for | URL | Licence |
|---|---|---|---|
| KayKit Dungeon Remastered: long tablecloth feast table, stool, chair and food platter (Kay Lousberg) | `public/models/suitors/kkd_*.glb`, the feast tables in the great hall | https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 | CC0 |
| Wooden Axe (1K diffuse and ARM maps, Poly Haven) | `public/models/suitors/ph/wooden_axe/`, the twelve axes for the bow contest | https://polyhaven.com/a/wooden_axe | CC0 |

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
| Homer's 11 lines before and after the stops of the quest | `public/audio/narration/` | ElevenLabs text to speech, model `eleven_v4`, voice George. Made with `npx tsx server/tools/genClips.ts story` | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see below |
| 13 taunts of the later monsters | `public/audio/taunts/` | ElevenLabs text to speech, model `eleven_v4`, voices Lily (Circe), Jessica (the Sirens), Harry (Scylla), Brian (Charybdis) and Liam (the suitors). Made with `npx tsx server/tools/genClips.ts story` | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see below |
| 11 fight sound effects, one for each combat event | `public/audio/sfx/` | ElevenLabs sound effects. Made with `npx tsx server/tools/genClips.ts sfx` | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see below |

The voices, and the speech model where a row gives one, are the ones written down when the clips were made: PR #55 and PR #68 for Athena, PR #90 for the voices of the eight clips beside hers, and `docs/narration-lines.md` for the narration and the taunts. The sound effects model is the one `server/ai/elevenlabs.ts` names. The MP3 files do not record any of this.

The ElevenLabs Terms of Service apply to these clips as they do to the music. What the terms say is at the end of the next section. These clips are not CC0 and not CC BY.

## Music and ambience

Generated by the team on 2026-11-14 with our own ElevenLabs account (Creator plan, a paid plan), by running `npx tsx server/tools/genClips.ts music`. The prompts are in `server/tools/genClips.ts`. They describe instruments and mood only, and name no artist, film, game or existing piece. The four files total 1.2 MB.

| Clip | File | Source | Licence |
|---|---|---|---|
| Cave ambience, looped on the menu | `public/audio/music/menu.mp3` | ElevenLabs sound effects endpoint (`POST /v1/sound-generation`, model `eleven_text_to_sound_v3`, `loop: true`) | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service, see below |
| Battle music, looped during a fight | `public/audio/music/fight.mp3` | ElevenLabs music endpoint (`POST /v1/music`, model `music_v1`, instrumental only) | Generated by the team with ElevenLabs; our use is under the ElevenLabs Terms of Service and Music Terms, see below |
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
