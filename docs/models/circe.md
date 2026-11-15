# Circe stop: model log

Quest stop 2 (book 10), `/?stop=circe`. Everything here was looked at in the running keyboard fight; screenshots are `docs/screenshots/circe-*.png`. Nothing in this stop is a downloaded model: the figure, the hall and the yard are built in code (three.js geometry, flat shaded, vertex coloured), so there is no GLB to fail to load. The one downloaded file is the sky.

## Rows

| Piece | Source | Licence | Size | Scale / rotation used | Verdict |
|---|---|---|---|---|---|
| Circe (robe, head, hair, diadem, two arms, wand, goblet, magic) | Ours, `src/render/monsters/circe/` | Ours | 0 KB | 2.9 m model units times 1.12 = about 3.2 m, faces +z | Kept. See the first row of "Tried and dropped" for why she is not a downloaded character |
| Her telegraphs (arc left, arc right, green ring overhead, orb and floor sigil) | Ours, same folder | Ours | 0 KB | metres, in her space | Kept. One per attack, each readable from the camera |
| Courtyard (marble tiles, crimson carpet with gold edge, stone slab) | Ours, `src/render/arena/circe/hall.ts` | Ours | 0 KB | 10.5 m wide, 27 m long, top at y = 0 | Kept |
| Portico (6 columns, entablature, frieze, pediment, back wall, doorway glow) | Ours, same file | Ours | 0 KB | laid out at z = -7..-12, moved back 6 m by the arena | Kept. First version sat 6 m closer and filled the frame; moved back |
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

None to add. Nothing was added to `public/`; the HDRI above is already credited:
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

## Alternate looks (owner picks): `?look=a` and `?look=b`

Nothing changes without the flag. Both looks use the same Quaternius Witch as Circe and the same Doric columns; they differ in robe colour, trees and ground. Files are in `public/models/circe/` and `public/textures/circe/`, about 5 MB in all. Screenshots: `docs/screenshots/circe-look-{base,a,b}-{wide,defend,strike,extra}.png`. Code: `src/render/monsters/models/Circe.tsx` (the figure), `src/render/arena/arenas/Circe.tsx` and `src/render/arena/circe/LookProps.tsx` (the courtyard). `hall.ts` and `yard.ts` only gained options (code columns, code wolves and pigs can be left out, tree spots exported); the base look is unchanged.

| Look | Circe | Courtyard |
|---|---|---|
| base | code-built figure | code columns, trees, wolves, pigs |
| a | Witch, purple robe | Doric columns, Quaternius pines, common trees and willows, bushes and rocks, modelled wolves and pigs, code hall and lions |
| b | Witch, robe recoloured sea green (the base colour) | as a with willows and common trees first, and the grass takes the Ground037 texture |

### Pieces

| Piece | Source | Author | Licence | Size | Verdict |
|---|---|---|---|---|---|
| Witch (`witch.glb`, 24 clips) | https://poly.pizza/m/QBEOV9ZUT8 | Quaternius | CC-BY 3.0 (Poly Pizza page; Quaternius's own pack page says CC0, credit anyway) | 1.6 MB | Kept, fitted to 3.0 m, faces +z. Clips: Idle_Neutral, HitRecieve, Death, and for windups Punch_Right (wand_left), Punch_Left (wand_right), Wave (cup), Interact (spell). Weak spots at 2.0 and 2.2 m land on her torso |
| Doric Greek Column (`doric.glb`) | https://poly.pizza/m/5VD5-v8NBZ4 | Victor Vina | CC-BY 3.0 | 87 KB | Kept, 6.3 m, six of them on the portico. White marble, the Greek look the base lacks |
| Wolf (`wolf.glb`) | https://quaternius.com/packs/ultimateanimatedanimals.html | Quaternius | CC0 | 0.6 MB | Kept, 1.5 m, idle clip, in the code wolves' places |
| Pig (`pig.glb`) | https://poly.pizza/m/TNvG3QUFlp (Quaternius Farm Animal Pack) | Quaternius | CC0 | 160 KB | Kept, 0.72 m, idle clip, four in the pen |
| Pine, Common tree, Willow, Bush, Rock Moss | https://quaternius.com/packs/ultimatenature.html | Quaternius | CC0 (pack page says CC0) | 106, 159, 109, 21, 7 KB | Kept, trees at 0.62 of the code trees' heights. Darker and busier than the code trees at dusk |
| Ground037 colour map | https://ambientcg.com/view?id=Ground037 | ambientCG | CC0 | 2.1 MB, 1024 px | Used in b only; barely visible under the dusk lighting, so b's gain here is small |
| Medieval woman (Quaternius modular women pack, Poly Pizza single y9KWOVG21R) | page URL not recorded by the searcher | Quaternius | CC-BY 3.0 per the searcher, not re-checked | 1.6 MB | Rejected. Seen in the fight: a rogue in black trousers and a short top, not a sorceress. Not shipped |
| KayKit Pillar | https://poly.pizza/m/1nt8n3rVKU | Kay Lousberg | CC0 | 23 KB | Rejected. Seen in the fight: squat grey hexagonal blocks, worse than the code columns. Not shipped |
| Lion, Doric-like columns and others found by singles search | not identified to a page I could read | unknown | unclear | n/a | Not used: licence not verified. The lions stay code-built |
| KayKit Mage, Quaternius Animals (Fox, Husky), Formal and Medieval modular women, wall and tower kit | candidates on disk | | CC0 | | Not used: Mage is chibi, the modular women have no clips, the medieval walls are not Greek |

### Credit rows

```
| Witch | https://poly.pizza/m/QBEOV9ZUT8 | Quaternius | CC-BY 3.0 |
| Doric Greek Column | https://poly.pizza/m/5VD5-v8NBZ4 | Victor Vina | CC-BY 3.0 |
| Wolf (Ultimate Animated Animals) | https://quaternius.com/packs/ultimateanimatedanimals.html | Quaternius | CC0 |
| Pig (Farm Animal Pack) | https://poly.pizza/m/TNvG3QUFlp | Quaternius | CC0 |
| Pine, Common tree, Willow, Bush, Rock Moss (Ultimate Nature Pack) | https://quaternius.com/packs/ultimatenature.html | Quaternius | CC0 |
| Ground037 (1K colour) | https://ambientcg.com/view?id=Ground037 | ambientCG | CC0 |
```

### Honest notes

Her attacks read less clearly than the code figure: the Witch clips are generic punches, a wave and an interact, not a wand sweep, so left and right differ by arm but the cup (arm up) looks like a wave and the spell has no forward thrust. The Witch has no wand or goblet.
