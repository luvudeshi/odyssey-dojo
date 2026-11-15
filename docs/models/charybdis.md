# Charybdis: model log

Every piece of the Charybdis stop is built in code (three.js geometry and shaders). No model file, texture or HDRI is
downloaded or shipped, so nothing needs a licence entry in `CREDITS.md` and there is no file that can fail to load.
Every piece below was looked at in the running keyboard fight at `/?stop=charybdis`; screenshots are in
`docs/screenshots/charybdis-*.png`.

CREDITS lines: none needed. (No third-party asset is used.)

| Piece | Source | Licence | Size | Scale / placement | Verdict |
|---|---|---|---|---|---|
| Whirlpool funnel (monster body) | code: `src/render/monsters/charybdis/shapes.ts`, `waterMaterial.ts` | ours | about 540 triangles | upright oval mouth 4.7 m wide, 5 m tall, centre 1.4 m up, opens toward the camera, foot under the water | kept |
| Fangs and foam lip | code, same file | ours | 16 cones merged, one torus | on the mouth's rim, grow per phase | kept (first try looked like floating shards; a lip ring and deeper roots fixed it) |
| Eye in the throat | code | ours | 10x8 sphere + pupil | 0.42 m, 2.15 m behind the mouth | kept |
| Crest wave | code | ours | 90 triangles | arches over the top of the mouth, about 3.3 m up, rears and leans on `spout` | kept |
| Side walls (surge) | code | ours | the crest's mesh, two copies | 3.4 m either side, rise to 4.5 m, one per surge | kept |
| Spout column | code | ours | 96 triangles | out of the throat, up to 7 m | kept |
| Undertow rings | code | ours | 3 thin tori | converge into the throat | kept |
| Water, sky, rain | code: `src/render/arena/charybdis/` | ours | water 8k triangles + a flat far plane | dish dug at z=-4; deck at y=0, sea at y=-0.26 | kept |
| Raft (keel, mast, planks, lashings) | code | ours | about 700 triangles | deck top at y=0, 4.6 m wide, hero stands at z 0.5 to 1.9 | kept; the mast and keel were shortened and darkened after the first shots (a bright end blade in the corner) |
| Rock and fig tree | code | ours | rock 900, tree 1.6k triangles | left, behind the whirlpool, tree leans out over the water | kept |
| Scylla's cliff | code | ours | about 1.3k triangles | far right, x=34, z=-78, fogged | kept; it is a silhouette, not Scylla herself |
| Wreckage (planks, barrels, oars) | code | ours | 16 pieces plus 5 circling | outside the fight, camera path and raft (tested) | kept |

Frame cost in the real fight (draw calls and triangles per frame, counted by wrapping the WebGL draw calls): cave
mouth 124 calls and 165k triangles; Charybdis 86 calls and 60k on high; low quality (`q`): cave 54 and 64k,
Charybdis 66 and 52k.

## Alternate looks (`?look=a`, `?look=b`), owner picks

The table above is the base look and is unchanged. Two alternates sit behind a URL flag, read inline in the monster
and arena files: `/?stop=charybdis&look=a` and `...&look=b`. Both keep the code-built funnel (water, crest, fangs,
every attack's tell, weak spots) and add downloaded models on top. Do not merge before the owner picks. Screenshots:
`docs/screenshots/charybdis-base/`, `charybdis-a/`, `charybdis-b/` (wide, defend, strike, extra at 1440x810).

| Piece | Look | Source | Author | Licence | Size | Verdict |
|---|---|---|---|---|---|---|
| Anglerfish.glb (rigged, Attack, Death, Swimming_Normal) | a | https://quaternius.com (Ultimate Animated Animals pack, GitHub mirror) | Quaternius | CC0, Quaternius asset licence | 180 KB | kept: lunges out of the throat, faces camera, maw marker sits on its mouth |
| Tentacle.glb (rigged, Idle and Attack clips) | a, b | https://quaternius.com (Sea Creatures pack, GitHub mirror) | Quaternius | CC0, Quaternius asset licence | 300 KB | kept: 8 arms (a), 10 arms (b), sized 1.9 to 4 m, bases hidden behind the foam rim; arms join the attack matching their side |
| Rock_4, Rock_6, Rock_Moss_4 | a | https://quaternius.com (Ultimate Nature pack, GitHub mirror) | Quaternius | CC0 | 32 KB total | kept as sea stacks and cliffs, tinted toward dusk |
| CommonTree_5, CommonTree_Dead_3 | a, b | same pack | Quaternius | CC0 | 152 KB | kept: tree on the fig rock |
| Viking_boat, Sail_ship | a, b | https://quaternius.com (pirate / medieval packs) | Quaternius | CC0 | 308 KB | kept: broken ships on the water, tinted warm |
| rock_moss_set_01 (gltf, bin, 1K textures) | b | https://polyhaven.com/a/rock_moss_set_01 | Kless Gyzen | CC0 | 1.9 MB | kept: scanned rocks for the fig rock and cliffs. Not used: boulder_01 (5.5 MB, over budget) |
| qwantani_dusk_2_puresky_1k.hdr | b | https://polyhaven.com/a/qwantani_dusk_2_puresky | Poly Haven | CC0 | 1.2 MB (already in the repo) | kept as b's sky |
| three Water.js and Sky.js | a | three.js 0.187 examples, https://threejs.org | three.js authors | MIT | 0 (already installed) | kept: mirror water and physical sky; sun moved off the whirlpool and the sky dimmed after the first shot was blown out white |
| waternormals.jpg (three example) | a | three.js examples | three.js authors | unclear for the image | not shipped | rejected; replaced by a code-made normal map (`waterNormals.ts`, tested) |
| Sea Monster Scene, Kenney Ship Wreck, GiantSquid | none | various | unknown | unclear or provenance not verified | not shipped | rejected: licence or origin could not be confirmed |
| GoblinShark | none | Quaternius animals pack | Quaternius | CC0 | not shipped | tried as the monster, rejected: reads as a shark, not a whirlpool |

Added per look: a about 0.9 MB, b about 2.8 MB, both under the 8 MB budget. Textures are at most 1024 px.
The Quaternius pages and the Poly Haven rock page should be re-checked by the owner before any merge.

### Credit rows

```
| Anglerfish, Tentacle, Rock_4, Rock_6, Rock_Moss_4, CommonTree_5, CommonTree_Dead_3, Viking_boat, Sail_ship | Charybdis alternate looks, `public/models/charybdis/*.glb` | https://quaternius.com | CC0 (Quaternius) |
| Rock Moss Set 01 | Charybdis look b rocks, `public/models/charybdis/rocks/` | https://polyhaven.com/a/rock_moss_set_01 | CC0 (Kless Gyzen, Poly Haven) |
| three.js Water and Sky examples | Charybdis look a sea and sky | https://github.com/mrdoob/three.js | MIT |
```
