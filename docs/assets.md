# Free 3D models, textures and skies we are allowed to use

A shortlist for the dark Greek cave and the sea (task #38). Nothing here is in the repo yet: this file only points. Every entry was checked on 14 November 2026.

## How to read this list

- **Licence** is what the asset's own page (or the site's own record for that asset) states. CC0 needs no credit. CC BY needs the credit line shown in [Credit lines to paste](#credit-lines-to-paste), in the README, the Devpost page and any credits screen.
- **Size** is the download named in the Format column. "Not shown" means the page gives no size; it is not a guess.
  - Sketchfab: the size of Sketchfab's converted GLB, as Sketchfab's public API reports it for that model. Sketchfab also offers glTF and the original upload. Downloading needs a free Sketchfab login.
  - Poly Haven: sizes from Poly Haven's public file list for that asset.
  - Poly Pizza and quaternius.com show no sizes.
- **Looks were not inspected.** Entries were judged from titles, descriptions, tags and polygon counts. Open the page's 3D viewer before settling on one.
- The game must run with no network, so anything we use has to be copied into `public/` and loaded from there, never hot-linked. `three` 0.187 already ships `GLTFLoader`, `HDRLoader` and `DRACOLoader` under `three/addons/loaders`, so no new dependency is needed.
- Monster models plug in behind `MonsterProps` in `src/render/monsters/models/` (lead-owned). The current Polyphemus is posed from `windup`, so a rigged model whose bones we rotate in code fits better than one that only has canned clips.

## Best picks for the Polyphemus cave fight

1. **The boss: [Cyclops Rig](https://sketchfab.com/3d-models/cyclops-rig-e5cc86878c314f5bae6d7268bb7541d9) by DM-913** (entry 2, CC BY 4.0, 14.0 MB GLB). The best original, rigged, one-eyed giant found. If a credit line or 14 MB is a problem, try the CC0 [Giant](https://poly.pizza/m/BldaiPtyJa) by Quaternius (entry 1) first.
2. **The cave walls: [Rock Boulder Cracked](https://polyhaven.com/a/rock_boulder_cracked)** (entry 29, CC0, 2.6 MB for three 1k maps). Tagged "cave" by Poly Haven. Lower the roughness for wet stone.
3. **Torch fire and hit sparks: [Kenney Particle Pack](https://kenney.nl/assets/particle-pack)** (entry 38, CC0, 80 sprites at 512 x 512). Small, tintable and made for additive particles. The Unity Labs flipbooks (entry 39) are the step up if we want realistic flame.
4. **The two props the fight is about: [Spiked Log Club](https://sketchfab.com/3d-models/spiked-log-club-66f77300b2b646ae9cb3d6efc197ee94)** (entry 14, 1.0 MB) for phase two and **[Wooden Stake](https://sketchfab.com/3d-models/wooden-stake-2e681ca0346249b382513278382ffba8)** (entry 15, 0.05 MB) for the finisher. Both CC BY 4.0.

## Giants and cyclops-like creatures

| # | Asset | Licence | Format | Size | Rigged / animated | Credit |
|---|---|---|---|---|---|---|
| 1 | [Giant](https://poly.pizza/m/BldaiPtyJa) by Quaternius, on Poly Pizza | CC0 ("Public Domain (CC0)") | FBX, glTF | Not shown | Tagged Animated; clip list not shown | None required |
| 2 | [Cyclops Rig](https://sketchfab.com/3d-models/cyclops-rig-e5cc86878c314f5bae6d7268bb7541d9) by DM-913 | CC BY 4.0 | GLB | 14.0 MB | Rigged, 1 animation clip, 11,316 faces | Required, line 2 |
| 3 | [Mountain Orge](https://sketchfab.com/3d-models/mountain-orge-f18e6fb4a07b445095b5fcb5bec7fa7a) by SamThePie | CC BY 4.0 | GLB | 8.7 MB | Rigged, 13 clips (the author says Mixamo animations), 17,309 faces | Required, line 3 |
| 4 | [Ultimate Monsters](https://quaternius.com/packs/ultimatemonsters.html) by Quaternius (also a [Poly Pizza bundle](https://poly.pizza/bundle/Ultimate-Monsters-Bundle-5oyGWAmOB6)) | CC0 | FBX, OBJ, Blend, glTF | Not shown | 50 animated monsters (attack, death, run, walk). Includes Yeti, Orc, Demon, Dragon. No cyclops | None required |

- Entry 2 has a lighter sibling by the same author, also CC BY 4.0: [Lesser Cyclops Variant Rig](https://sketchfab.com/3d-models/lesser-cyclops-variant-rig-40d31731af1b46b59addd81ed5750db0), 6.1 MB GLB, rigged, 1 clip, 18,164 faces.
- Entry 3 is an ogre with horns and two eyes: the best clip variety, but it needs its face reworked or hidden to read as Polyphemus.

## Serpents and sea monsters (Scylla)

| # | Asset | Licence | Format | Size | Rigged / animated | Credit |
|---|---|---|---|---|---|---|
| 5 | [Animated Hydra (Dungeons & Dragons)](https://sketchfab.com/3d-models/animated-hydra-dungeons-dragons-16bee345cce94a288015cfc38301b20f) by Yanez Designs | CC BY 4.0 | GLB | 4.1 MB | Rigged, 1 clip, 23,526 faces | Required, line 5 |
| 6 | [Yamata no Orochi](https://sketchfab.com/3d-models/yamata-no-orochi-8f4c0e2c632e401eb5c5381acc3ce789) by tranb95 | CC BY 4.0 | GLB | 4.6 MB | Static. Eight-headed serpent, 137,424 faces (heavy) | Required, line 6 |
| 7 | [Snake](https://poly.pizza/m/x9x0viZs8V) by Quaternius, on Poly Pizza | CC0 | FBX, glTF | Not shown | Tagged Animated. The [Animated Enemies bundle](https://poly.pizza/bundle/Animated-Enemies-a53OJwHrhh), which lists a Snake, names Attack, Idle, Jump and Walk | None required |
| 8 | [Tentacle](https://poly.pizza/m/BR1vpIvvvv) by Quaternius, on Poly Pizza | CC0 | FBX, glTF | Not shown | Tagged Animated | None required |

- Six copies of entry 7 rising from one rock is the cheapest CC0 Scylla.
- Entry 5 is the author's own model of a many-headed hydra; only the title borrows the game's name.

## Greek warriors and animation sets

| # | Asset | Licence | Format | Size | Rigged / animated | Credit |
|---|---|---|---|---|---|---|
| 9 | [PS1/PSX Hoplite Chan](https://sketchfab.com/3d-models/ps1psx-hoplite-chan-996eed76879e45758babf2699a106704) by Seifert | CC BY 4.0 | GLB | 2.2 MB | Rigged, 14 clips, 1,357 faces. Spear, shield, xiphos, bow. Retro low-poly woman hoplite | Required, line 9 |
| 10 | [Low poly - Spartan Soldier](https://sketchfab.com/3d-models/low-poly-spartan-soldier-2c2f5c6e24254636ad75f88d5a0282d9) by MariosTzavis | CC BY 4.0 | GLB | 2.7 MB | Mixamo skeleton, 1 clip, 20,669 faces. Armour and helmet | Required, line 10 |
| 11 | [KayKit Character Pack: Adventurers](https://kaylousberg.itch.io/kaykit-adventurers) by Kay Lousberg | CC0 | FBX, glTF | 12 MB ("Free 2.0") | 5 rigged, animated characters (Knight, Barbarian, Rogue, Mage, Ranger) with 25+ weapons and shields. Not Greek | None required |
| 12 | [KayKit Character Animations](https://kaylousberg.itch.io/kaykit-character-animations) by Kay Lousberg | CC0 | FBX, glTF | 14 MB ("Free 1.1") | 150+ clips for the KayKit rigs: unarmed melee, blocking, dodging, getting hit, death | None required |
| 13 | [Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) by Quaternius | CC0 | FBX, GLB | Not shown | 120+ clips on a universal humanoid rig. The free tier is "60-70%" of the pack | None required |

- Entry 13 pairs with [Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html) (CC0, six rigged but unanimated bodies, FBX / OBJ / glTF, size not shown).

## Club, spear, shield, helmet and stake

| # | Asset | Licence | Format | Size | Rigged / animated | Credit |
|---|---|---|---|---|---|---|
| 14 | [Spiked Log Club](https://sketchfab.com/3d-models/spiked-log-club-66f77300b2b646ae9cb3d6efc197ee94) by MarcinMakes | CC BY 4.0 | GLB | 1.0 MB | Static, 204 faces, hand-painted | Required, line 14 |
| 15 | [Wooden Stake](https://sketchfab.com/3d-models/wooden-stake-2e681ca0346249b382513278382ffba8) by Madison | CC BY 4.0 | GLB | 0.05 MB | Static, 482 faces | Required, line 15 |
| 16 | [Spear](https://poly.pizza/m/fH1zmvjPNx) by Quaternius, on Poly Pizza | CC0 | FBX, glTF | Not shown | Static | None required |
| 17 | [Shield Round](https://poly.pizza/m/lWajrVXcnA) by Quaternius, on Poly Pizza | CC0 | FBX, glTF | Not shown | Static | None required |
| 18 | [Aspis - Greek Shield](https://sketchfab.com/3d-models/aspis-greek-shield-5bf29485d55740ad8535dbd7d3d9c836) by Loch Greer | CC BY 4.0 | GLB | 0.07 MB | Static, 500 triangles, lambda emblem, normal map | Required, line 18 |
| 19 | [PBR Spartan Shield](https://sketchfab.com/3d-models/pbr-spartan-shield-03b51fb57d4747deb71ca22f14971dfb) by Ferocious Industries | CC BY 4.0 | GLB | 10.4 MB | Static, 1,102 triangles, 2K PBR maps | Required, line 19 |
| 20 | [PBR Hoplite Helmet](https://sketchfab.com/3d-models/pbr-hoplite-helmet-a20e96b821444a8d86eea4869fe4bc84) by Ferocious Industries | CC BY 4.0 | GLB | 16.0 MB | Static, 2,878 triangles, 2K PBR maps, bronze | Required, line 20 |

- The CC0 [Ultimate RPG Items Bundle](https://poly.pizza/bundle/Ultimate-RPG-Items-Bundle-h8mhlZ0dG8) by Quaternius lists the same Spear and Shield Round names as entries 16 and 17 (55 models: five shields, a spear, swords, axes; FBX and GLB; size not shown). It has no club, helmet or torch.
- Entry 15 is tagged as a vampire hunter's stake, so it is hand-sized: scale it up for the olive-wood stake.
- Entries 19 and 20 are heavy only because of 2K textures; shrink the maps to 512 before shipping.

## Cave set dressing

| # | Asset | Licence | Format | Size | Rigged / animated | Credit |
|---|---|---|---|---|---|---|
| 21 | [Stalagmites, Collums and Stalacites](https://sketchfab.com/3d-models/stalagmites-collums-and-stalacites-3e06d8e13be64faf85d6ba6a1049b769) by RBG_illustrations | CC BY 4.0 | GLB | 9.5 MB | Static, 4,060 faces | Required, line 21 |
| 22 | [Modular caves](https://sketchfab.com/3d-models/modular-caves-66d33b65d4fc471db78a7e4da2232623) by ToxaGrom | CC BY 4.0 | GLB | 19.1 MB | Static, 13 modules plus an assembled example, 27,828 faces | Required, line 22 |
| 23 | [[FREE] Lowpoly Volcanic Rocks [Asset Pack]](https://sketchfab.com/3d-models/free-lowpoly-volcanic-rocks-asset-pack-4fe6a72f8afa4bafbd03cf384add10f0) by SimplePolygon | CC BY 4.0. The author adds: do not resell the model | GLB | 0.39 MB | Static, 3,761 faces | Required, line 23 |
| 24 | [Rock Moss Set 01](https://polyhaven.com/a/rock_moss_set_01) by Kless Gyzen, Poly Haven | CC0 | glTF with 1k textures | 1.9 MB | Static, 63,127 polygons (decimate before use) | None required |
| 25 | [Stone Fire Pit](https://polyhaven.com/a/stone_fire_pit) by Sebastian Platen, Poly Haven | CC0 | glTF with 1k textures | 2.5 MB | Static, 3,887 polygons. A hearth for the cave | None required |
| 26 | [Dungeon Wall Torch - Low Poly Medieval, CC0](https://sketchfab.com/3d-models/dungeon-wall-torch-low-poly-medieval-cc0-156b8eca745549ee951abd8aa58f2d3f) by Avramania | CC0 | GLB | 0.05 MB | Static, 604 triangles | None required |
| 27 | [Castle Brazier - Low Poly Medieval, CC0](https://sketchfab.com/3d-models/castle-brazier-low-poly-medieval-cc0-4efc54738e9e4d89a68a5b71d83e3038) by Avramania | CC0 | GLB | 0.16 MB | 1 animation clip, 688 triangles | None required |
| 28 | [Low Poly Bone Pile (Downloadable)](https://sketchfab.com/3d-models/low-poly-bone-pile-downloadable-5ec580b41a934cea86d4297980d1378f) by 3dsauce | CC BY 4.0 | GLB | 0.23 MB | Static, 560 faces | Required, line 28 |

## Rock and wet stone textures (PBR)

Poly Haven sizes are the sum of three 1k JPG maps: diffuse, OpenGL normal and the packed AO / roughness / metal map. 2k is about four times larger. ambientCG sizes are the 1K-JPG zip as shown on its page, which holds more maps than we need.

| # | Asset | Licence | Format | Size | Notes | Credit |
|---|---|---|---|---|---|---|
| 29 | [Rock Boulder Cracked](https://polyhaven.com/a/rock_boulder_cracked) by Dario Barresi and Dimitrios Savva, Poly Haven | CC0 | JPG maps (a glTF bundle is also offered) | 2.6 MB at 1k | Tagged cave, cliff, eroded | None required |
| 30 | [Aerial Rocks 02](https://polyhaven.com/a/aerial_rocks_02) by Rob Tuytel, Poly Haven | CC0 | JPG maps | 2.2 MB at 1k | Tagged cave, cliff, moss. Covers 50 m, so it suits big walls | None required |
| 31 | [Rock Wall 02](https://polyhaven.com/a/rock_wall_02) by Rob Tuytel, Poly Haven | CC0 | JPG maps | 0.7 MB at 1k | Tagged coastal, weather-beaten. The lightest set here | None required |
| 32 | [Cobblestone Floor 04](https://polyhaven.com/a/cobblestone_floor_04) by Rob Tuytel, Poly Haven | CC0 | JPG maps | 1.6 MB at 1k | Tagged damp, wet, moss. For the cave floor | None required |
| 33 | [Rock 035](https://ambientcg.com/view?id=Rock035), ambientCG | CC0 | Zip of JPG maps | 9 MB at 1K | Tagged black, cave, cliff. Procedural | None required |
| 34 | [Rock 020](https://ambientcg.com/view?id=Rock020), ambientCG | CC0 | Zip of JPG maps | 8 MB at 1K | Tagged smooth, wet, flat, grey. Approximated from a photo | None required |

## Night and dusk skies (HDRI)

All from Poly Haven, CC0. Sizes are the 1k `.hdr`; the 2k file is about four times larger. 1k is enough for lighting; use 2k only if the sky is seen directly.

| # | Asset | Licence | Format | Size | Notes | Credit |
|---|---|---|---|---|---|---|
| 35 | [The Sky Is On Fire](https://polyhaven.com/a/the_sky_is_on_fire) by Greg Zaal and Rico Cilliers | CC0 | HDR (EXR also offered) | 1.5 MB at 1k, 6.0 MB at 2k | Twilight over the ocean with waves. A promenade and rail are in the lower half | None required |
| 36 | [Kloppenheim 02 (Pure Sky)](https://polyhaven.com/a/kloppenheim_02_puresky) by Greg Zaal and Jarod Guest | CC0 | HDR | 1.4 MB at 1k, 5.6 MB at 2k | Clear night, sky only, no ground. Best behind the cave mouth | None required |
| 37 | [Qwantani Moonrise (Pure Sky)](https://polyhaven.com/a/qwantani_moonrise_puresky) by Greg Zaal and Jarod Guest | CC0 | HDR | 1.3 MB at 1k, 4.9 MB at 2k | Night, sky only, high contrast | None required |

## Fire, spark and smoke sprites

| # | Asset | Licence | Format | Size | Notes | Credit |
|---|---|---|---|---|---|---|
| 38 | [Particle Pack](https://kenney.nl/assets/particle-pack) by Kenney | CC0 ("Creative Commons CC0") | Not stated on the page | Not shown | 80 files, 512 x 512 tiles, tagged particle and vfx. The page does not list the individual sprites, so confirm the flame and spark shapes after download | None required |
| 39 | [VFX image sequences and flipbooks](https://unity.com/blog/engine-platform/free-vfx-image-sequences-flipbooks) by Unity Labs | CC0 ("we release some of these sequences under CC0 license") | Zips of flipbook sheets; EXR and TGA sequences also offered | Not shown | Realistic Flame02, Flame03, SmallFlame01, FireBall01 to 04, WispySmoke01 to 03, explosions. Download links not tested | None required |
| 40 | [Brackeys' VFX Bundle](https://brackeysgames.itch.io/brackeys-vfx-bundle) by Brackeys | CC0 ("Attribution is not required") | Not stated on the page | 26 MB | Particle textures, flipbooks and sprite sheets; the previews show a flame with smoke and sparks | None required |

- Kenney's [Smoke Particles](https://kenney.nl/assets/smoke-particles) (CC0, 70 files, size not shown) goes with entry 38.

## Credit lines to paste

Only the CC BY entries need these. The numbers match the tables.

```text
2.  "Cyclops Rig" (https://sketchfab.com/3d-models/cyclops-rig-e5cc86878c314f5bae6d7268bb7541d9) by DM-913 is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/).
3.  "Mountain Orge" (https://sketchfab.com/3d-models/mountain-orge-f18e6fb4a07b445095b5fcb5bec7fa7a) by SamThePie is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/).
5.  "Animated Hydra (Dungeons & Dragons)" (https://sketchfab.com/3d-models/animated-hydra-dungeons-dragons-16bee345cce94a288015cfc38301b20f) by Yanez Designs is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/).
6.  "Yamata no Orochi" (https://sketchfab.com/3d-models/yamata-no-orochi-8f4c0e2c632e401eb5c5381acc3ce789) by tranb95 is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/).
9.  "PS1/PSX Hoplite Chan" (https://sketchfab.com/3d-models/ps1psx-hoplite-chan-996eed76879e45758babf2699a106704) by Seifert is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/).
10. "Low poly - Spartan Soldier" (https://sketchfab.com/3d-models/low-poly-spartan-soldier-2c2f5c6e24254636ad75f88d5a0282d9) by MariosTzavis is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/).
14. "Spiked Log Club" (https://sketchfab.com/3d-models/spiked-log-club-66f77300b2b646ae9cb3d6efc197ee94) by MarcinMakes is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/).
15. "Wooden Stake" (https://sketchfab.com/3d-models/wooden-stake-2e681ca0346249b382513278382ffba8) by Madison is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/).
18. "Aspis - Greek Shield" (https://sketchfab.com/3d-models/aspis-greek-shield-5bf29485d55740ad8535dbd7d3d9c836) by Loch Greer is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/).
19. "PBR Spartan Shield" (https://sketchfab.com/3d-models/pbr-spartan-shield-03b51fb57d4747deb71ca22f14971dfb) by Ferocious Industries is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/).
20. "PBR Hoplite Helmet" (https://sketchfab.com/3d-models/pbr-hoplite-helmet-a20e96b821444a8d86eea4869fe4bc84) by Ferocious Industries is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/).
21. "Stalagmites, Collums and Stalacites" (https://sketchfab.com/3d-models/stalagmites-collums-and-stalacites-3e06d8e13be64faf85d6ba6a1049b769) by RBG_illustrations is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/).
22. "Modular caves" (https://sketchfab.com/3d-models/modular-caves-66d33b65d4fc471db78a7e4da2232623) by ToxaGrom is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/).
23. "[FREE] Lowpoly Volcanic Rocks [Asset Pack]" (https://sketchfab.com/3d-models/free-lowpoly-volcanic-rocks-asset-pack-4fe6a72f8afa4bafbd03cf384add10f0) by SimplePolygon is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/).
28. "Low Poly Bone Pile (Downloadable)" (https://sketchfab.com/3d-models/low-poly-bone-pile-downloadable-5ec580b41a934cea86d4297980d1378f) by 3dsauce is licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/).
```

If a model is edited (decimated, retextured, re-rigged), add "Changes were made." to its line.

## Checked and rejected

These turn up first in searches and look ideal, but we should not use them.

| Asset | Why not |
|---|---|
| "cyclopses" and "cyclopes ( rigged )" by toro ardido modelos 3d (Sketchfab, tagged polyphemus, 20 clips) | Marked CC BY, but the descriptions say the models come from Dragon Quest and Dark and Light. The uploader cannot license another studio's game assets |
| "Frost Giant" by the same uploader (11 clips) | Description says it is from Baldur's Gate: Dark Alliance |
| "Cyclops" by keianhzo (Sketchfab) | The X-Men character, not a giant |
| "Titanus Scylla 2.0" by SpiderBight; "Hydra" by Breniak; "Sea Serpent" by SpiderBight | Non-commercial licences (CC BY-NC or BY-NC-SA) |
| "Achilles' Helmet" and "Spartan Helmet" by Anthony Schmidt; "Ultra low poly spartan shield" by Orpind | CC BY-NC and CC BY-NC-ND |
| "Coiled Basilisk Snake [MESHY]" by Ethan Cox | AI-generated mesh and textures, by the author's own description |
| [Bestiary - Dungeon Monsters Kit](https://quaternius.com/packs/bestiarydungeonmonsterskit.html) by Quaternius | Not CC0: it uses the Quaternius Asset License, which forbids redistributing the files as assets, so committing them to a shared repo is a risk. The page also names none of the seven monsters and marks the kit as not animated |
| "Club" by Poly by Google (Poly Pizza) | Tagged "party" under Scenes: a nightclub, not a weapon |
| OpenGameArt fire sheets (N64 Fire, Animated particle effects #2) | The site refused automated requests, so the licences could not be confirmed. Check by hand before using |
