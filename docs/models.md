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
- A strike clip is scrubbed by the fight clock, not played freely: it starts so the contact frame lands 80 ms after the engine reports the strike. Hurt is scrubbed the same way. Block, duck and idle loop; dodge, victory and defeat play once.
- The old pose-driven figure becomes a faint blue ghost (25% opacity) only while a live webcam frame arrives, offset to the hero's left. It is hidden for keyboard play. It is the full bronze figure until the GLB has loaded, or if it fails to load.
- Add `&debug` and read `window.__heroGroup`, `window.__battle`, `window.__poseRef` to drive the hero from a browser test.

### Model log

Checked in the running fight (`?hero=<id>&debug`, keyboard play) at 1440x810. Screenshots are in `docs/screenshots/hero-*`.

| Name | Source | Licence | Size | Fit used | Clips used | Verdict |
|---|---|---|---|---|---|---|
| Knight (KayKit Adventurers 1.0) | https://kaylousberg.itch.io/kaykit-adventurers | CC0 | 2.5 MB (from 3.6 MB: other shields, offhand sword and 2H sword removed, 19 of 78 clips kept) | targetHeight 1.1 (bone height; the chibi head and helmet add height on top), rotationY pi, cape tinted crimson, helmet bronze | Idle, Blocking, Jump_Land (duck stand-in), Dodge_Left/Right, 1H Slice_Horizontal (default strike), Chop (overhead), Slice_Diagonal (hook, uppercut), Stab (thrusts), Hit_A, Cheer, Death_A | kept as candidate, resized. Round shield and sword are the pack's own and sit on the hand slots cleanly. Strikes read from behind; block and duck are subtle from the over-the-shoulder camera because the big head hides the arms |
| Adventurer (Quaternius) | https://quaternius.com (poly.pizza listing; the exact page URL was not recorded with the download, CC0 taken from the candidate licence check) | CC0 | 1.6 MB (16 of 24 clips kept) | targetHeight 1.5 (bone height, about 1.75 m rendered), rotationY pi, no tint | Idle_Sword, Idle_Neutral (block stand-in), Roll (duck stand-in), Run_Left/Right (dodge stand-in), Punch_Right (default strike), Punch_Left, Kick_Left/Right (hook, uppercut, hammer fist), Sword_Slash (thrusts), HitRecieve, Wave (victory stand-in), Death | kept as candidate, resized. Proportions fit the monster and cave best, but it is a modern backpacker in olive clothes, not Greek, and has no block or duck clip |
| Universal Base Character, male (Quaternius) with UAL1 and UAL2 clips | https://quaternius.itch.io/universal-base-characters | CC0 | 2.3 MB packed (4K textures to 512 webp) | targetHeight 1.75 | UAL2 binds by bone name (Sword_Regular_A/B, Melee_Hook, Sword_Block, Hit_Knockback, Idle_Shield_Loop); UAL1 does not (its bones are Blender `DEF-` names with a different rest pose, so rotations cannot be copied by name) | rejected, not shipped. The clips work, but the model is a realistic bare-chested mannequin that clashes with the stylized low-poly cave, and the pack's death, punch and idle clips are the UAL1 ones that cannot bind. Screenshot kept: `docs/screenshots/hero-base-idle-rejected.png` |

The cave and the primitive Polyphemus are untouched by this PR. Packing used `@gltf-transform` from a temp folder (not added to package.json): removed unused accessory meshes and clips, pruned, deduped.
