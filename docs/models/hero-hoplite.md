# Hero candidate: hoplite

Try it: `/?hero=hoplite&model=giant` (keyboard fight, Boxer or Hoplite style).

## Source

- Quaternius "Ultimate Modular Men"-era Adventurer rig, the same pack as the `adventurer` candidate (https://quaternius.com).
- Licence: CC0 (per `docs/models.md`). The exact pack page URL was not recorded when the file was downloaded, so only the site is listed.
- Shipped file: `public/models/hero/hoplite.glb`, 1.18 MB (source 1.94 MB). Under the 3 MB cap.

## What was changed in the file

- Backpack node removed.
- 24 clips trimmed to the 11 used: Idle_Sword, Idle_Neutral, Run_Left, Run_Right, Punch_Right, Punch_Left, Kick_Left, Kick_Right, HitRecieve, Wave, Death.
- Left arm baked into a shield-guard pose (forearm out in front) in every clip except Punch_Left and Death, and as the default node rotation, so the shield hand never hangs at the side. The mixer overwrites bone rotations every frame, so gear cannot pose bones itself.
- Rebuilt with a small script (not committed) and `gltf-transform prune`.

## Fit

- `fit: { targetHeight: 1.55, rotationY: Math.PI }`, about 1.8 m rendered next to the 4.6 m giant. Feet on the floor, facing the giant.
- Colours are set in `prepare` by material name: linen tunic, crimson accents, leather browns, bare legs take the skin colour. Flat shaded, no metalness.

## Gear (code-built, `src/render/hero/gear/hopliteGear.tsx`)

Bronze Corinthian helmet with a crimson crest (Head), bronze cuirass (Chest), crimson cape (Chest, sways), linen tunic skirt (Hips), greaves (both lower legs), round bronze shield (left wrist), spear (right wrist). State logic lives in `hopliteState.ts` and is unit-tested.

## Clips per pose

| Pose | Clip | Real or stand-in |
|---|---|---|
| idle | Idle_Sword | real |
| block | Idle_Neutral, shield lifts over the chest while Space is held | stand-in |
| duck | Idle_Neutral squashed to 75% | stand-in (Roll has root motion) |
| dodge left / right | Run_Left / Run_Right | stand-in |
| punch | Punch_Right, spear hidden so the fist is free | real |
| spear thrust | Punch_Right with the spear levelled at the giant | stand-in (reads foreshortened from behind) |
| hook | Punch_Left (acts as a shield bash) | stand-in |
| uppercut / hammer fist | Kick_Right / Kick_Left | stand-in |
| hurt | HitRecieve | real |
| victory | Wave | stand-in |
| defeat | Death, spear hidden | real |

## Verdict

Keep as a candidate. It reads as a hoplite from behind at camera distance (helmet crest, cape, shield, spear, tunic), whole body in frame, no weak spot hidden. Weaknesses: block and duck are stand-ins, the cape hangs slightly crooked in Idle_Sword, a small dark knob shows on the cape in some frames (cause unknown), the hero turns to profile in the Wave clip, and the shield's dark back face shows from behind.

## CREDITS line (for the lead to add)

`| Hoplite hero: Adventurer (Quaternius), backpack removed, trimmed to 11 clips, guard arm baked | public/models/hero/hoplite.glb | https://quaternius.com | CC0 |`

## Screenshots

`docs/screenshots/hero-hoplite-{idle,block,strike,thrust,duck,hurt,victory,defeat}.png` (crops, Hoplite style) and `hero-hoplite-wide.png` (full frame, hero and giant, Boxer style).
