# Scylla: models, props and terrain

Everything for the Scylla stop is built in code. Nothing is downloaded, so there is no licence to follow and nothing that can fail to load; the "GLB or HDRI failed" fallback is the code-built `ScyllaStandIn` (a cylinder neck and cone head set in front of the cave) that the model's error boundary shows if the real body throws.

CREDITS lines: none needed (no third-party assets).

| Piece | Source | Licence | Size | Scale / rotation | Verdict | Reason |
|---|---|---|---|---|---|---|
| Scylla body (`src/render/monsters/scylla/`) | code-built: six instanced Bezier necks, 14 segments each | own work | 84 instanced segments, 3 draws | world metres, placed by `MonsterRig` at z -4 and un-rotated inside | used | reads as six necks out of the cave; one draw for all necks |
| Scylla heads (`headGeometry.ts`) | code-built: skull, jaw, eyes, three tooth rows on each jaw | own work | about 450 triangles a head, 6 heads, 3 looks (phases) | 1.15 scale, face the hero | used | three rows of teeth read from the camera |
| Neck and jaw weak-spot positions | `src/enemies/defs/scylla.ts`, computed from `pose.ts` | own work | n/a | local frame (world z + 4) | used | the rings sit on the outstretched neck and the snapping jaw, checked in `tests/scylla.test.ts` |
| Cliff wall (`arena/scylla/cliff.ts`) | code-built flat-shaded grid with the cave mouth cut out | own work | 3,178 triangles | cliff face at z -11 | used | sheer rock face with strata |
| Cave hollow | code-built unlit half-ellipsoid | own work | 380 triangles | behind the mouth | used | dark cave interior |
| Rim boulders and foot rubble | code-built icosahedra | own work | 1,652 triangles | around the mouth and at the cliff foot | used | frames the mouth |
| Black ship (`arena/scylla/ship.ts`) | code-built: deck planks, hull, rails, bow post, oars, shields, amphorae, chest, rope, spears | own work | 2,478 triangles | deck 6.6 m wide, hero on it at z 1.2 | used | the hero stands on a ship deck |
| Sea and Charybdis (`arena/scylla/Water.tsx`) | code-built animated plane, foam strip, rotating whirlpool rings, a distant fig-tree rock | own work | about 4,000 triangles | whirlpool at x -17, z -19 | used | dark water with a churn far off. Sea animation is off in low quality |
| Sky (`arena/scylla/Sky.tsx`) | code-built vertex-coloured dome and a sun disc | own work | 28 x 14 sphere | radius 160 | used | dusk sky for the horizon |

Frame cost on `/?stop=scylla` (headless Chrome on Metal, WebGL draw calls counted): about 56 draw calls and 14,000 triangles a frame in high quality, 38 calls and 9,800 in low (`q`). The cave mouth (`/?stop=polyphemus`) measured 59 calls and 16,700 triangles with the same method.
