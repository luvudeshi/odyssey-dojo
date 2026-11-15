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
