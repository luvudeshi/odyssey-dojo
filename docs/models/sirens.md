# The Sirens: models, props and terrain

Every piece of this stop is built in code. No file was downloaded, no GLB, texture or HDRI is loaded, and nothing in `public/` was added. There is therefore nothing for `CREDITS.md` to list and no licence to follow. Every row below is "ours".

Why code and not an asset pack: the Sirens are bird-women with wings that must change shape for each attack (song: open; swoop left or right: one wing rears; talon dive: both wings high, claws out). A rigged GLB would need clips named for four attacks and a defeated pose, and the packs on hand have no bird-woman. Code-built parts on a small rig of groups give each attack its own cue, and the pose is a pure function (`src/render/monsters/sirens/pose.ts`) that `tests/sirens.test.ts` checks without a browser.

Where things live: monster in `src/render/monsters/sirens/` and `src/render/monsters/models/Sirens.tsx`; setting in `src/render/arena/sirens/` and `src/render/arena/arenas/Sirens.tsx`. Sizes are metres; the hero is 1.8 m. All parts are flat-shaded and vertex-coloured, merged into one mesh per kind.

## Models

| Piece | Source URL | Licence | Size | Scale / rotation | Verdict | Built in |
|---|---|---|---|---|---|---|
| Siren body (egg-shaped bird body with plumage points) | none, built in code | ours | about 2.8 m tall to the shoulders, 576 triangles | scale 1 (lead), 0.8 (sister) | used | `monsters/sirens/parts.ts` `bodyGeometry` |
| Siren tail feathers | none, built in code | ours | about 1.4 m long, 168 triangles | on a pivot behind the body, sways | used | `tailGeometry` |
| Siren legs and claws (two) | none, built in code | ours | about 1.2 m, 104 triangles each | mirrored with negative x scale; fold when defeated | used | `legGeometry` |
| Siren torso (woman's chest, gown) | none, built in code | ours | 280 triangles | pivot at hip, bends forward or back | used | `torsoGeometry` |
| Siren head (face, hair, circlet) | none, built in code | ours | about 0.45 m, 288 triangles | pivot at the neck; tilts back on a hit | used | `headGeometry` |
| Siren eyes (two, glowing) | none, built in code | ours | 0.05 m | scale y closes them when defeated | used | `eyeGeometry` |
| Siren mouth | none, built in code | ours | 0.12 m | scale y opens it for the song | used | `mouthGeometry` |
| Siren arms (upper and fore, two each) | none, built in code | ours | 0.7 m each segment | shoulders open outward in the song | used | `upperArmGeometry`, `foreArmGeometry` |
| Siren wings (two, feathered, spar and primaries) | none, built in code | ours | about 3 m span at scale 1, 408 triangles each | left wing is the right wing with scale.x = -1 | used | `wingGeometry` |
| Song rings and notes | none, built in code | ours | rings grow from 0.4 m to 2.3 m across, 4 rings, 6 notes | additive, bloom-lit, spread from the throat toward the hero | used | `SongRings.tsx` |
| Stand-in (sphere, two boxes, head) | none, built in code | ours | about 3 m tall | shown only if the Siren render throws | used as the fallback | `SirenStandIn.tsx` |

## Props

| Piece | Source URL | Licence | Size | Scale / rotation | Verdict | Built in |
|---|---|---|---|---|---|---|
| Boulders (lumpy icospheres, three shades) | none, built in code | ours | 0.5 to 4.8 m, about 32 placed | random yaw; sunk a quarter of their height | used | `arena/sirens/solids.ts` `rockGeometry`, placed by `layout.ts` `rocks` |
| Skull | none, built in code | ours | about 0.3 m | random roll and yaw, scale 0.7 to 1.4 | used | `boneGeometry` |
| Rib cage | none, built in code | ours | about 0.7 m | as above | used | `boneGeometry` |
| Spine | none, built in code | ours | about 0.5 m | as above | used | `boneGeometry` |
| Long bone | none, built in code | ours | about 0.8 m | as above | used | `boneGeometry` |
| Bone heaps (eight, outside the fight) and single bones in the grass | none, built in code | ours | heaps 1.3 to 2.4 m radius | seeded layout | used | `layout.ts` `bones` |
| Wrecked mast with torn sail, red patch and rope | none, built in code | ours | mast 6.2 m, leaning | stands left of the fight at x=-6.6, z=-6.4 | used | `wreckGeometry` |
| Hull ribs, fallen plank and lone oar | none, built in code | ours | ribs 1.7 to 2.6 m | stand right of the fight at x=7.4 to 11, z=-9.2 | used | `wreckGeometry` |
| Flowers (seven colours, instanced) | none, built in code | ours | 0.3 m tall, 26 triangles each, about 240 placed | seeded drifts | used | `flowerGeometry`, `layout.ts` `flowers` |
| Grass tufts (instanced) | none, built in code | ours | 0.5 m, 12 triangles each, about 300 placed | random yaw | used | `tuftGeometry`, `tufts` |
| Black ship | none, built in code | ours | hull 9 m long, mast 8 m with a pale sail, 62 m out to sea | rows slowly across the horizon | used | `arena/sirens/Ship.tsx` |
| Contact shadows (blob under the hero, and under the Sirens on low quality) | none, drawn on a canvas at run time | ours | 1.7 m and 5 m | follow the hero | used | `Meadow.tsx` |

## Terrain and sky

| Piece | Source URL | Licence | Size | Scale / rotation | Verdict | Built in |
|---|---|---|---|---|---|---|
| Meadow islet (flat-shaded triangle grid, vertex colours: grass, dry patches, sand, rock) | none, built in code | ours | 54 m by 47 m, 2232 triangles | dead flat under the fight, rolling beyond, rocky headlands left and right, slopes into the sea | used | `solids.ts` `terrainGeometry`, `layout.ts` `groundHeight` |
| Sea (a sheet of flat triangles that rock gently) | none, built in code | ours | 700 m square, 28 by 28 segments | animated in `useFrame` on high quality only | used | `Sea.tsx` |
| Sky dome (gradient, sun disc, low-poly clouds) | none, built in code | ours | radius 400 m | follows the camera; sour violet in later phases | used instead of an HDRI | `Sky.tsx` |

No HDRI. The scene's `Atmosphere` dims the scene background to 0.42, which would turn a noon HDRI into dusk, so the sky is a dome in the scene instead.

## CREDITS lines

None to add: nothing was downloaded. If this changes, add a row here and a line in `CREDITS.md` first.

## Cost, measured

Counted at the WebGL calls (every draw in a frame, shadow and post-processing passes included), 1440 by 810, same machine, same fight position:

| Scene | Draw calls | Triangles |
|---|---|---|
| Cave mouth (polyphemus), high quality | 124 | 30,254 |
| The Sirens, high quality | 146 | 53,701 |
| Cave mouth, low quality (`q`) | 54 | 17,263 |
| The Sirens, low quality (`q`) | 93 | 37,329 |

The Sirens cost more than the cave mouth, about 1.8 times the triangles on high and 2.2 times on low. A first version had 150,000 triangles; the bones, flowers and sea sheet were cut to get here.

## How to see it

`npm run dev`, then open `/?stop=sirens`, choose "Keyboard only", and pick the Sirens on the map. Add `&debug` for `window.__battle`. Press `q` for low quality. Screenshots are in `docs/screenshots/sirens-*.png`.
