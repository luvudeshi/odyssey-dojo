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
