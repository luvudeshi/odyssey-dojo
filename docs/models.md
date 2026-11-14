# Dropping in GLB models

Any rigged, animated GLB can stand in for a monster or the hero. Code is in `src/render/models/`.

Files go under `public/models/` (never a CDN). Each GLB under 5 MB; Draco works: the decoder is served from `public/draco/` (copied from three), never gstatic. Every model you ship gets a row in `CREDITS.md` (name, author, URL, licence). Only licences that allow use in a game (CC0, CC-BY with credit) are fine.

## A monster

Create `src/render/monsters/models/<Name>.tsx` (the registry picks up any file exporting `model`):

```tsx
import { monsterFromGlb } from "../../models/monsterFromGlb";
import type { MonsterModel } from "../registry";
import { model as primitive } from "./Polyphemus"; // any primitive model works as the fallback

export const model: MonsterModel = {
  enemyId: "polyphemus",
  Component: monsterFromGlb(
    {
      url: "/models/polyphemus.glb",
      fit: { targetHeight: 5, rotationY: 0, offset: [0, 0, 0] },
      clips: {
        idle: "Idle",
        windup: { default: "Swing", byAttackId: { boulder: "Throw" } }, // scrubbed by props.windup
        attack: "Slam", // optional, used if the windup clip is missing
        hit: "Hurt",
        death: "Die",
        byPhase: { 1: { idle: "Enraged" } }, // optional overrides per phaseIndex
        timeScale: 1,
      },
      anchors: { Head: <mesh>{/* glowing eye */}</mesh> }, // optional, parented to the bone named "Head"
    },
    primitive.Component,
  ),
};
```

- Clip names are the GLB's animation names. A missing clip falls back to idle; a missing or broken file shows the fallback model.
- `fit` scales the model to `targetHeight`, centres it and puts the feet on the floor. `rotationY` turns a model that does not face +Z, about its centre. The height comes from bone positions, so feet can sit slightly low; add `footOffset` (model units) to lift them.
- A windup clip is not played by the clock: its time is `props.windup * duration`, so the swing lands when the engine says the attack lands.
- Anchors inherit the model's scale; size anything you parent accordingly.
- Hit flash tints the model's emissive red.

## The hero

`heroFromGlb(config, Fallback)` takes the same `url`, `fit`, `anchors`, and `clips: { idle, block, duck, dodgeLeft, dodgeRight, strike, hurt, victory, defeat }` (only `idle` is required). It returns a component taking `{ action }`. It is exported but not wired into `PlayerFigure` yet.

## Trying it

`/?model=dev` swaps Polyphemus for the CC0 test robot. Add `&debug` and read `window.__modelDebug` (`clip`, `time`, `scrub`, `loop`, `clips`) to see what the mixer is playing.

## The hero, as candidates

`?hero=<id>` swaps the bronze figure for an animated GLB hero (`knight`, `adventurer`). Code is in `src/render/hero/`: `candidates.ts` (file, fit, tint, which clip plays for each action), `heroClips.ts` (the pure action-to-clip rules, tested in `tests/heroClips.test.ts`) and `Hero.tsx`. Without the flag nothing changes.

- Both the keyboard and the webcam go through `battle` (`held`, `struckMove`/`struckAt`, `playerHitAt`, the combat phase), so both trigger clips.
- A strike clip is scrubbed by the fight clock, not played freely: it starts so the contact frame lands 80 ms after the engine reports the strike. Hurt is scrubbed the same way. Block and idle loop (duck holds a frozen crouch frame or squashes the model); dodge, victory and defeat play once.
- The old pose-driven figure becomes a faint blue ghost (25% opacity) only while a live webcam frame arrives, offset to the hero's left. It is hidden for keyboard play. It is the full bronze figure until the GLB has loaded, or if it fails to load.
- Add `&debug` and read `window.__heroGroup`, `window.__battle`, `window.__poseRef` to drive the hero from a browser test.

### Model log

Checked in the running fight (`?hero=<id>&debug`, keyboard play) at 1440x810. Screenshots are in `docs/screenshots/hero-*`.

| Name | Source | Licence | Size | Fit used | Clips used | Verdict |
|---|---|---|---|---|---|---|
| Knight (KayKit Adventurers 1.0) | https://kaylousberg.itch.io/kaykit-adventurers | CC0 | 2.5 MB (from 3.6 MB: other shields, offhand sword and 2H sword removed, 19 of 78 clips kept) | targetHeight 1.1 (bone height; the chibi head and helmet add height on top), rotationY pi, cape tinted crimson, helmet bronze | Idle, Blocking, Jump_Land (duck stand-in, frozen at 0.3 so it holds the crouch), Dodge_Left/Right, 1H Slice_Horizontal (default strike), Chop (overhead), Slice_Diagonal (hook, uppercut), Stab (thrusts), Hit_A, Cheer, Death_A | kept as candidate, resized. Round shield and sword are the pack's own and sit on the hand slots cleanly. Strikes read from behind; block and duck are subtle from the over-the-shoulder camera because the big head hides the arms |
| Adventurer (Quaternius) | https://quaternius.com (poly.pizza listing; the exact page URL was not recorded with the download, CC0 taken from the candidate licence check) | CC0 | 1.6 MB (16 of 24 clips kept) | targetHeight 1.5 (bone height, about 1.75 m rendered), rotationY pi, no tint | Idle_Sword, Idle_Neutral (block stand-in), Idle_Neutral (block and duck stand-in; duck squashes the model to 75%, because Roll has root motion and tumbled into the floor), Run_Left/Right (dodge stand-in), Punch_Right (default strike), Punch_Left, Kick_Left/Right (hook, uppercut, hammer fist), Sword_Slash (thrusts), HitRecieve, Wave (victory stand-in), Death | kept as candidate, resized. Proportions fit the monster and cave best, but it is a modern backpacker in olive clothes, not Greek, and has no block or duck clip |
| Universal Base Character, male (Quaternius) with UAL1 and UAL2 clips | https://quaternius.itch.io/universal-base-characters | CC0 | 2.3 MB packed (4K textures to 512 webp) | targetHeight 1.75 | UAL2 binds by bone name (Sword_Regular_A/B, Melee_Hook, Sword_Block, Hit_Knockback, Idle_Shield_Loop); UAL1 does not (its bones are Blender `DEF-` names with a different rest pose, so rotations cannot be copied by name) | rejected, not shipped. The clips work, but the model is a realistic bare-chested mannequin that clashes with the stylized low-poly cave, and the pack's death, punch and idle clips are the UAL1 ones that cannot bind. Screenshot kept: `docs/screenshots/hero-base-idle-rejected.png` |

The cave and the primitive Polyphemus are untouched by this PR. Packing used `@gltf-transform` from a temp folder (not added to package.json): removed unused accessory meshes and clips, pruned, deduped.

`/?model=<id>` swaps Polyphemus for a candidate: `dev` (CC0 test robot), `giant`, `classic` (table in `src/render/models/candidates.ts`; the default look is unchanged without the flag). Add `&debug` and read `window.__modelDebug` (`clip`, `time`, `scrub`, `loop`, `clips`) to see what the mixer is playing.

`RiggedModel` also takes `tweakMaterial(material)`, run once on each instance's own copy of every material, to recolour or flat-shade a pack. `BoneMount` (`src/render/models/boneMount.tsx`) parents a prop to a bone and cancels the bone's scale (the Quaternius rigs carry a 100x armature) so the prop is sized in metres. GLTFLoader strips dots from node names, so the bone `Arm.R_end` is anchored as `ArmR_end`. A node ending `_end_end` is not a bone and sits in the wrong place; anchor to `_end`.

## Polyphemus candidates

Try each with the keyboard: `http://localhost:5173/?model=giant`, `?model=classic`, `?model=dev` (add `&debug` to read `window.__modelDebug`). Screenshots from a full keyboard fight (a bot played each one to the end) are in `docs/screenshots/polyphemus-<id>-{idle,attack,hit,blinded,death}.png`.

Ranking: 1. `giant`, 2. `classic`. No other confirmed-CC0 giant is on disk (the Bestiary has only an Imp and a Puglin, and the sea-monster and tentacle files are for Scylla), so there is no third candidate.

## Model log

| Name | Source | Licence | Size | Target height / scale / rotation | Clips used | Verdict |
|---|---|---|---|---|---|---|
| giant (Quaternius Giant) | https://poly.pizza/m/BldaiPtyJa | CC0 | 245 KB | 4.6 m (about 2.6 hero heights), scale from bone box (x1.19 here), rotationY 0 (already faces +z), feet on the floor | Idle, Attack (scrubbed by windup, used for all four attack ids), HitRecieve, Death, Walk (Blinded idle); speed 1 / 1.15 / 1.5 per phase | Kept as the lead candidate. Blocky but reads as a stylized giant, animates for real, feet on the ground. Needed: warm tint and flat shading (pack is bright and shiny), a big code-built eye covering its two eyes, a code-built club on `ArmR_end` from the Club phase, a stake in the eye when Blinded. Jump rejected for the boulder: the pose at the end of the windup looked like standing. Club swings do not differ left and right (one Attack clip). |
| classic (hand-built Polyphemus) | `src/render/monsters/models/Polyphemus.tsx`, restyled in `classicPolyphemus.tsx` | Ours | 0 KB | 5 m, no fit needed | none: arms swing by windup, falls over on defeat | Fallback, resized by hand. Flat-shaded, darker skin (the first tint was washed out by the cave light), cloth, club, stake. Weak-spot rings sit exactly on eye and gut. Looks like a doll next to the giant; arms are two capsules. |
| polyphemusProps (eye, stake, club) | built in code | Ours | 0 KB | metres | none | Kept. The first club colour was invisible against the dark rock behind it; lightened. |

Weak spots: the giant's body fits the existing positions (eye `[0, 4.1, 0.95]`, gut `[0, 2, 1.1]`) without a data edit: the gut ring lands on his belt and the eye ring on his face, slightly below the big eye (his eye centre is about 4.3 m). No data was changed.

## Cave mouth at dusk: model log

Every model or set piece brought into the fight, looked at in the running Polyphemus battle (keyboard fight, headless Chrome, 1440x810; screenshots in `docs/screenshots/cave-mouth-*.png`). Scale reference: hero about 1.8 m, Polyphemus about 5 m.

| Name | Source | Licence | Size | Target height / scale / rotation | Clips used | Verdict | Why |
|---|---|---|---|---|---|---|---|
| Dusk sky dome | built in code, `cave/Sky.tsx` | ours | 1 sphere, 1 shader | graded dome pinned to the camera; sun painted at `SUN.visual` (11 degrees up) so it shows through the mouth | none | replaced the HDRI background | The Qwantani Dusk HDRI background blew out to white at any exposure that kept its sun, and was the reason the sky never read as sunset. The dome is hand-graded (orange horizon, rose, violet overhead, cloud bars, sun glow) in linear colour. The HDRI is kept only for reflections at intensity 0.3. Bloom threshold went from 0.85 to 1.0 so the sky no longer bleeds. |
| Cave shell (roof, walls) | built in code, `cave/solids.ts` | ours | 1 merged mesh | hall 12.5 x 9.5 m, pinches to 11.5 x 8.6 m at the lip, roof stays above 8 m over the camera | none | resized | First pass left stalactite tips inside the giant's reach; the roof and teeth were raised so nothing hangs below 7 m over the fight. |
| Floor and ledge | built in code | ours | 1 merged mesh | flat inside the fight zone, ledge slopes to the sea at y=-1.5 | none | resized | Was rendered white because the winding faced down; flipped. Hero and giant both stand on it, with contact shadows. |
| Boulders (about 60 pieces) | built in code, `mouthLayout.ts` | ours | merged | 0.25 m stones up to 3 m wall boulders, none inside the fight or camera zones (unit test) | none | kept | Faceted flat shading matches the low-poly look. |
| Stalactites (about 38) | built in code | ours | merged | 1.2 to 3.8 m long, hung from the roof | none | resized | Nothing hangs below 7 m over the fight now (the raised club and arms reach about 6.5 m); covered by a test. |
| Fire pit, flames, embers | built in code, `cave/Fire.tsx` | ours | cones + point light | pit at x=-6.3, z=-2.4 | flicker only | resized | At x=-5.6 it touched the fight zone; moved out. |
| Clay jars (5) | built in code (lathe) | ours | merged | 1.8 to 2.6 m tall, so they read as giant's jars next to the 1.8 m hero | none | resized | First version was hero sized and looked like pots; scaled up to giant scale. |
| Shepherd pen: posts and rails | built in code | ours | merged | posts 2 m, rails at 0.8 and 1.6 m | none | resized | Was knee high; raised so the fence reads against a 5 m giant. |
| Sheep (4) | built in code | ours | merged | scaled x1.5, three fleece lumps, dark head and legs | none | redone, still small | The first sheep were pale cream and clipped to white blobs under the orange sun. Now earth-toned wool with a dark face; they read as grey woolly animals behind the fence, though at the screen edge they are still small. |
| Sea | built in code shader, `cave/Sea.tsx` | ours | 1 quad | y=-1.5, runs to the horizon, reflects the same sky function as the dome | shader time | resized | Now mirrors the dusk sky so the horizon is seamless. Earlier: checker pattern showed at the horizon; ripple tilt softened and faded with distance. Low quality drops the ripples. |
| Light shafts, dust motes | built in code | ours | 6 beams | high only | pulse | kept | Gone on low as required. |
| Hero (boxer, knight) | existing in repo, not mine | n/a | n/a | about 1.8 m | existing | not changed | Boxer seen in every shot, knight (`?model=giant&hero=knight`) at idle only (`cave-mouth-knight.png`). Both stand on the floor, face the giant, scale right. Nothing sits between the camera and the hero. |
| Polyphemus | existing in repo, not mine | n/a | n/a | about 5 m | existing | not changed | Seen with `?model=giant` (GLB) through idle, every windup (club left/right, grab, boulder), strikes, Blinded, finisher, death and loss. Head and raised club clear the roof (7 m). The giant looks pale and bright against the sunset during the finisher and fall; that is its material, owned by another agent. |

Not brought in and not tested in the fight: the Poly Haven photoscans (boulder_01, stone_fire_pit, antique_ceramic_vase_01, rock_face_01, namaqualand_cliff_02, mountainside, marble_bust) and the small_harbour_sunset HDRI. Photo textures on large shapes break the flat-shaded look, so the set pieces are built in code instead.

Cost: measured before the sky change at about 172 draw calls and 30.9k triangles at high, 54 calls and 17.3k at low. The dome adds one draw call and the HDRI background is gone, so it should be about the same; not re-measured.

Not tested: a low-quality finisher shot, the knight past idle, close-range sheep, the live webcam path. The Bloom threshold change (0.85 to 1.0) is shared by every arena and was only looked at here. The 404 console errors seen in every run predate this change and were not traced.
