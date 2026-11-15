# Circe stop: model log

Quest stop 2 (book 10), `/?stop=circe`. Everything here was looked at in the running keyboard fight; screenshots are `docs/screenshots/circe-*.png`. The figure, the yard and the rest of the hall are built in code (three.js geometry, flat shaded, vertex coloured). The downloaded files are the sky and the six marble columns (`public/models/circe/doric.glb`, below); if the column file fails to load the portico stands without them.

## Rows

| Piece | Source | Licence | Size | Scale / rotation used | Verdict |
|---|---|---|---|---|---|
| Circe (robe, head, hair, diadem, two arms, wand, goblet, magic) | Ours, `src/render/monsters/circe/` | Ours | 0 KB | 2.9 m model units times 1.12 = about 3.2 m, faces +z | Kept. See the first row of "Tried and dropped" for why she is not a downloaded character |
| Her telegraphs (arc left, arc right, green ring overhead, orb and floor sigil) | Ours, same folder | Ours | 0 KB | metres, in her space | Kept. One per attack, each readable from the camera |
| Courtyard (marble tiles, crimson carpet with gold edge, stone slab) | Ours, `src/render/arena/circe/hall.ts` | Ours | 0 KB | 10.5 m wide, 27 m long, top at y = 0 | Kept |
| Portico (entablature, frieze, pediment, back wall, doorway glow) | Ours, same file | Ours | 0 KB | laid out at z = -7..-12, moved back 6 m by the arena | Kept. First version sat 6 m closer and filled the frame; moved back |
| Six Doric columns | "Doric Greek Column" by Victor Vina, https://poly.pizza/m/5VD5-v8NBZ4, `src/render/arena/circe/Columns.tsx` | CC BY 3.0 | 87 KB | 6.3 m, on the platform at z = -8.6 (hall space), x = -8.9 to 8.9 | Kept. White marble, the Greek look the code-built columns lacked (owner's pick, 2026-11-14) |
| Great loom with warp threads and woven cloth | Ours, same file | Ours | 0 KB | metres | Kept |
| Table with the cups of green wine, amphora | Ours, same file | Ours | 0 KB | metres | Kept |
| Braziers (stand, bowl, flame, warm light) | Ours, `Braziers.tsx`, `yard.ts` | Ours | 0 KB | 1.45 m stand | Kept. First legs read as black spikes; replaced by a flat foot |
| Two lions, two wolves | Ours, `yard.ts` | Ours | 0 KB | about 1.4 m seated | Kept. Wolves first stood at the right edge behind the prompt card and in shadow; moved beside the steps and lightened |
| Pig pen with four pigs (the crew) | Ours, `yard.ts` | Ours | 0 KB | pigs about 0.8 m | Kept. Pink lightened, they were lost in the fence shadow |
| Moly in a pot (white flowers) | Ours, `yard.ts` | Ours | 0 KB | 0.9 m | Kept. Sits by the carpet at the hero's left |
| Grass, hills, about 100 low-poly trees | Ours, `yard.ts` | Ours | 0 KB | trees 9 to 18 m | Kept. First greens went black against the sun; lightened |
| Evening sky HDRI `public/hdri/qwantani_dusk_2_puresky_1k.hdr` | https://polyhaven.com/a/qwantani_dusk_2_puresky | CC0 (Poly Haven) | 1.1 MB, already shipped for the cave | yaw 1.87 rad so its sun sits behind the hall | Kept. Already in `CREDITS.md`, no new line needed |

## Tried and dropped

| Piece | Source | Licence | Verdict and why |
|---|---|---|---|
| Gobkit "Priestess" GLB | https://gobkit.com/freebies (pack file `Priestess.glb`, its LICENSE.txt: "Creative Commons CC0 1.0 Universal (Public Domain Dedication)") | CC0 | Rejected. Seen in the fight at 2.9 m: a chibi with a head a third of her height, a mitre, white robes and a huge sword fused into the mesh, which cannot be hidden (one mesh). Read as a knight, not a sorceress. Clips Idle, Attack, Special, Hit, Death worked but there is only one attack clip, so the four attacks could not be told apart |
| KayKit Adventurers "Mage", Quaternius base characters | candidates on disk | CC0 | Not used. Same chibi proportions, or a bare bodysuit that needs a robe built over it; a code-built figure gave full control of each windup |

## CREDITS.md lines

The columns have their own row in `CREDITS.md` (section Circe). The HDRI above is already credited:
`| Qwantani Dusk 2 Puresky (1K HDRI) | ... | https://polyhaven.com/a/qwantani_dusk_2_puresky | CC0 |`

## How each attack reads (hero stands behind the camera, Circe faces it)

| Attack | Defence | What you see |
|---|---|---|
| `wand_left` | dodge right | wand arm flung out and up on the left of the screen, body leans and turns left, bright arc sweeps in from the left |
| `wand_right` | dodge left | wand arm swept across her body to the right of the screen, lean and arc to the right |
| `cup` | duck | goblet raised over her head, green wine glows, a green ring spins above her head |
| `spell` | block | both hands thrust forward, an orb of magic swells in front of her chest, a sigil ring burns on the floor |

Phases change her colours (sea green, violet, crimson), the glow of the wand, and in the last phase her eyes and hair light up. A hit rocks her back and washes her red. Beaten, she kneels (drops 0.95 m into the hem), bows, lowers her arms and the glows go out.

## Performance

Average per frame over 180 frames in the keyboard fight (headless Chrome, Metal), counted by wrapping the WebGL draw calls:

| Stop | Quality | Draw calls | Triangles |
|---|---|---|---|
| Cave mouth (polyphemus) | high | 124 | 30,254 |
| Circe | high | 96 | 40,474 |
| Cave mouth | low (`q`) | 54 | 17,263 |
| Circe | low (`q`) | 75 | 25,186 |

Circe has fewer draw calls on high and about 35% to 45% more triangles; the trees and hall are merged vertex-coloured meshes. Frame time was pinned at 17 ms (vsync) in both, so no GPU timing was measured.
