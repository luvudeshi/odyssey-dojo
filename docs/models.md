# Dropping in GLB models

Any rigged, animated GLB can stand in for a monster or the hero. Code is in `src/render/models/`.

Files go under `public/models/` (never a CDN). Each GLB under 5 MB; Draco is not required. Every model you ship gets a row in `CREDITS.md` (name, author, URL, licence). Only licences that allow use in a game (CC0, CC-BY with credit) are fine.

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
- `fit` scales the model to `targetHeight`, centres it and puts the feet on the floor. `rotationY` turns a model that does not face +Z.
- A windup clip is not played by the clock: its time is `props.windup * duration`, so the swing lands when the engine says the attack lands.
- Anchors inherit the model's scale; size anything you parent accordingly.
- Hit flash tints the model's emissive red.

## The hero

`heroFromGlb(config, Fallback)` takes the same `url`, `fit`, `anchors`, and `clips: { idle, block, duck, dodgeLeft, dodgeRight, strike, hurt, victory, defeat }` (only `idle` is required). It returns a component taking `{ action }`. It is exported but not wired into `PlayerFigure` yet.

## Trying it

`/?model=dev` swaps Polyphemus for the CC0 test robot. Add `&debug` and read `window.__modelDebug` (`clip`, `time`, `scrub`, `loop`, `clips`) to see what the mixer is playing.
