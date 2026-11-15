# The Suitors: models, props and terrain

Quest stop THE SUITORS (Odyssey book 22). Antinous, 3.4 m, in dark purple and gold, with four more suitors behind him,
in Odysseus's megaron. The lead adds the CREDITS.md and docs/models.md lines; they are given at the bottom.

| Piece | Source | Licence words | Size and use | Verdict |
|---|---|---|---|---|
| Mannequin with 11 clips (`public/models/suitors/suitor.glb`) | Quaternius, Universal Base Characters (https://quaternius.itch.io/universal-base-characters) and Universal Animation Library 2 (https://quaternius.itch.io/universal-animation-library-2) | Both pages say "CC0 License"; the pack's License.txt reads "CC0 1.0 Universal ... Public Domain Dedication" | 2.53 MB (limit 3 MB). Mesh 1.83 m, bone box 1.57 m, 13.7k triangles (5.7k body, 8.0k joints), faces +Z. Antinous is fitted to 3.4 m (scale 1.86); the other four to 2.2 to 2.35 m. No rotation. Palette set per figure by tweaking `M_Main` and `M_Joints` | Kept, resized. The animation file was trimmed from the full pack to 11 clips to fit the budget. The four small suitors hide the joint spheres (8.0k triangles each) to save frame cost |
| UAL1 "warrior" clips grafted onto the mannequin | Quaternius UAL1 | CC0 | Dropped | Rejected: its bones are named DEF-*, the mannequin's are not, so only 2 channels matched |
| Death clip | none in UAL2 | n/a | Hit_Knockback, then a code fall of the root to -pi/2 about x | Kept. No death clip exists in the pack |
| Helm, cuirass, tunic, skirt, cloak, pauldrons, spear, sword, ox-hoof, cup, round shield, table shield | Built in code (`src/render/monsters/suitors/gear.tsx`) | Ours | Drawn in mesh units, wrapped in a scale of height/1.83, mounted on bones through BoneMount | Kept |
| Stand-in figure | Built in code (`Figure.tsx`) | Ours | Shown while the GLB loads, and instead of it if the load fails | Kept |
| Hall shell: floor, walls, painted frieze, two doors, ceiling beams, red tapering columns, courtyard | Built in code (`src/render/arena/suitors/hall.ts`) | Ours | 22 m by 28 m, 7.4 m ceiling, one merged vertex-coloured mesh (10.1k triangles) | Kept |
| Feast tables and benches (knocked over), amphorae, cups, bread, apples, plates, bones, the twelve axes, the great bow and its stone, the hearth ring, torch brackets | Built in code (`props.ts`) | Ours | One merged mesh, 5.5k triangles. Nothing solid in the fight zone or the camera zone (tested) | Kept |
| Hearth fire, torch flames, night sky with moon, two point lights | Built in code (`Fire.tsx`) | Ours | Unlit cone sprites and a canvas texture | Kept |
| Sky HDRI | none | n/a | The hall is lit by lights only, so there is no HDRI to fail | Not used |

Cost, measured in headless Chrome at 1440 by 810 in the real fight: 174 draw calls and 99k triangles per frame on high
(shadow pass included), 122 and 55k with `q` low. The cave mouth is 124 and 30k on high, 54 and 17k on low. Draw calls
run higher because five dressed figures carry about eight gear meshes each.

## Review fixes

- Defeat pose (confirmed): the knockback clip already lays the body on its back, and the code added a further quarter
  turn about x on top, which pushed the torso under the floor and left only the bent legs showing. The extra turn and
  lift are gone; the clip alone lies every figure down (`b-death-b`, `docs/screenshots/suitors-defeated.png`).
- Weak-spot ring drift (partly true, not changed): the ring is a fixed point in the monster's space. It sits on the
  helm and throat in the idle and guard poses (checked at phase 1 and 2). It only drifts while the hit flinch plays,
  which is under a second after a landed hit. A ring that tracked the head bone would need a change in the shared
  Scene, so it is left.
- Frame cost: still not timed on a real laptop; the draw-call figures above stand.
- Licence: both itch.io pages were read on 2026-11-14. Base Characters says "Creative Commons Zero v1.0 Universal"
  and "(CC0 License)"; Animation Library 2 says "CC0 License".

## CREDITS.md line to add

| Mannequin and animations (Quaternius, Universal Base Characters and Universal Animation Library 2), trimmed to 11 clips | `public/models/suitors/suitor.glb`, the suitors in the great hall | https://quaternius.itch.io/universal-animation-library-2 | CC0 |

## docs/models.md line to add

| The Suitors | suitor.glb (Quaternius UAL2 mannequin, 2.53 MB), dressed in code, with a code-built hall | docs/models/suitors.md |

## Look comparison: `?look=a` and `?look=b` (owner picks; do not merge before he does)

Without the flag nothing changes. The flag is read inline in `src/render/monsters/models/Suitors.tsx` and `src/render/arena/arenas/Suitors.tsx` (and passed to `propSolids` in `props.ts`). Alternate figures live in `src/render/monsters/suitors/alt.tsx` and `altCast.tsx`, alternate furniture in `src/render/arena/suitors/AltProps.tsx`. Screenshots from the running fight are in `docs/screenshots/suitors-look-*`. All licences were read on their pages on 2026-11-14 (Gobkit itch page, polyhaven.com/license, the KayKit GitHub README and LICENSE.txt).

- **a** = KayKit men (Barbarian as Antinous, Knight and Barbarian as the four others) in the code-built hall with KayKit furniture.
- **b** = Gobkit men (King as Antinous, Heavy Warrior, Knight Captain, Palace Halberdier, Prince) in the code-built hall with a Poly Haven stone fire pit and twelve Poly Haven axes.

| Piece | Source URL, author | Licence | Size | Verdict |
|---|---|---|---|---|
| KayKit Knight and Barbarian, trimmed from 76 to 16 clips (`kay_Knight.glb`, `kay_Barbarian.glb`) | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0, Kay Lousberg | CC0 1.0 | 1.0 MB each (3.5 MB before trimming) | Kept in a. Stocky chibi proportions, medieval armour and beards, not Greek. Held weapons and shields are nodes in the file and are switched by phase (mug, axe and round shield, great axe). Fit: bone box x 0.57 gives the mesh height |
| KayKit Rogue | same pack | CC0 1.0 | 3.6 MB | Rejected: hooded, crossbow, no use |
| Gobkit King, Heavy Warrior, Knight Captain (`gob_*.glb`) | https://gobkit.itch.io/gobkit-free-character-pack-vol-3, Gobkit | CC0 1.0 | 0.4 to 0.47 MB each | Kept in b. Toy-like, crowned king reads as a smug noble but is fairy-tale, not Greek. Weapons are baked into the mesh, so only the Attack clip is used for every attack. Fit: bone box x 0.38, foot lift 0.014 |
| Gobkit Prince, Palace Halberdier | https://gobkit.com/freebies/human013/gobkit-human013-pack.zip, Gobkit (licence from the vendor manifest and the pack's LICENSE.txt, no itch page read) | CC0 1.0 | 0.6 MB each | Kept in b |
| Gobkit Footman, Peasant Militia, Court Crossbowman | same packs | CC0 1.0 | 0.35 to 0.6 MB | Tried and dropped: same look as the kept ones, no extra value |
| KayKit Dungeon Remastered: long tablecloth feast table, stool, chair, wall torch, shield banner, decorated kegs | https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0, Kay Lousberg | CC0 1.0 | 0.03 to 0.14 MB each, 0.5 MB total | Kept in a, resized (table x 0.62, torch x 1.1, banner x 0.9, keg x 0.42). Replaces the knocked-over tables and benches. Dungeon styling, grey-brown, not a megaron; torches read oddly at the trident-like bracket |
| KayKit pillar_decorated, column | same pack | CC0 1.0 | 0.06 MB | Rejected: the code-built red tapering columns are better Mycenaean |
| Poly Haven Stone Fire Pit | https://polyhaven.com/a/stone_fire_pit, Sebastian Platen | CC0 | 1.5 MB (1k diffuse and ARM maps; the normal map was left out) | Kept in b, scaled x 2.3. Photo-scanned, heavier than the low-poly neighbours |
| Poly Haven Wooden Axe, 12 copies | https://polyhaven.com/a/wooden_axe | CC0 | 1.4 MB (shared by all copies) | Kept in b, scaled x 1.7, replaces the sign-post axes. Real axes, a single-bit felling axe rather than the Homeric double axe |
| Poly Haven Kite Shield, goblets, bowl, candlestick, marble bust | polyhaven.com | CC0 | not downloaded for the final looks | Rejected: medieval shield; goblets and bust too small to read at fight distance |
| Quaternius Medieval Village MegaKit, Kenney Castle Kit | quaternius.com, kenney.nl | CC0 | n/a | Not tried: no direct download found, and both are medieval shells that would replace a hall that already works |

Known flaws: a fallen figure whose GLB fails to load shows nothing under a flag (no stand-in); a code-built crested helm on the KayKit head bone did not show and was dropped; the weak-spot ring sits just above the bald KayKit heads, not on a helm.

## Credit rows

| KayKit Character Pack: Adventurers, Knight and Barbarian trimmed to 16 clips (Kay Lousberg) | `public/models/suitors/kay_*.glb`, alternate suitors (`?look=a`) | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 | CC0 |
| KayKit Dungeon Remastered: feast table, stool, chair, torch, banner, kegs (Kay Lousberg) | `public/models/suitors/kkd_*.glb`, alternate hall (`?look=a`) | https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 | CC0 |
| Gobkit Free Character Packs: King, Heavy Warrior, Knight Captain, Prince, Palace Halberdier (Gobkit) | `public/models/suitors/gob_*.glb`, alternate suitors (`?look=b`) | https://gobkit.itch.io/gobkit-free-character-pack-vol-3 | CC0 |
| Stone Fire Pit and Wooden Axe (Sebastian Platen and Poly Haven contributors) | `public/models/suitors/ph/`, alternate hall (`?look=b`) | https://polyhaven.com/a/stone_fire_pit | CC0 |
