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
