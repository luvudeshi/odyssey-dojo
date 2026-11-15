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

## The hero: the spartan

The owner picked the spartan, and it is the hero with no URL flag (`?hero=` is gone; any value is ignored). Code is in `src/render/hero/`: `defs/spartan.tsx` (file, fit, which clip plays for each action), `heroClips.ts` (the pure action-to-clip rules, `tests/heroClips.test.ts`), `gearRule.ts` (which gear is in his hands, `tests/hero-gear.test.ts`), `gear/` (helmet, cuirass, cape and greaves from `spartanGear.tsx`; shield, spear and stake from `carriedGear.tsx`) and `Hero.tsx`. The GLB is preloaded at import, so he is normally there the moment a fight starts.

- Both the keyboard and the webcam go through `battle` (`held`, `struckMove`/`struckAt`, `playerHitAt`, `styleId`, the combat phase), so both trigger clips.
- A strike clip is scrubbed by the fight clock, not played freely: it starts so the contact frame lands 80 ms after the engine reports the strike. Hurt is scrubbed the same way. Block and idle loop; duck holds the crouch loop; dodge, victory and defeat play once.
- The code-built bronze figure shows until the GLB has loaded, or for good if it fails to load. After that it is a faint blue ghost (25% opacity, offset to his left) only while a live webcam frame arrives, and hidden for keyboard play.
- Add `&debug` and read `window.__heroGroup`, `window.__battle`, `window.__now`, `window.__poseRef`, `window.__camera` to drive him from a browser test.

### Gear: nothing in his hands at rest

A fighter punches and blocks with bare fists. At rest the round bronze shield is slung on his back, over the cape, and both hands are empty. No style carries a spear now (the Hoplite style did; Jiu-jitsu took its place), so the spear is neither slung nor held. `heldGear` (pure, `gearRule.ts`) says what is in his hand: the stake only for `stake_thrust` (the Polyphemus finisher, any style), nothing otherwise and nothing while he blocks, ducks, dodges, is hit, wins or loses. The item scales up in the right hand as its clip starts and scales away when the clip ends, and the slung spear hides while the other is in his hand. Block is both fists up in front of the face (the prompt card says "Bring both fists up to cover your face"); idle is a boxer's guard with both fists at chin height.

Arms: the pack's clips were authored for sword and shield, so the arm tracks of `Guard_Idle`, `Guard_Block`, `Dodge_L` and `Dodge_R` were overwritten in the GLB with constant fists-up poses solved by two-bone IK (fist targets in front of the chin, elbows down). `Dodge_*` borrow the idle guard. Hurt, victory, death and the strike clips keep their own arms. The GLB (757 KB) is the same file otherwise.

### Framing

The camera is `src/render/cameraShots.ts` (and the first-frame numbers in `Scene.tsx`). Base shot: position (1.4, 2.15, 4.9) looking at (0.8, 1.5, -1.6), fov 52. The strike shot used to push in and look 60% toward the weak spot, which dropped his feet out of the bottom of the frame; it now sits further back (z 6.4, y 2.9) and looks 25% toward the weak spot, still with a narrower lens. The finisher and victory orbit has radius 7 and sweeps 0.9 rad (it was 6 and 1.1) and looks lower, and the hit kick is smaller. `tests/hero-framing.test.ts` projects his feet (both boots, stance depth included), shoulders and helmet through the camera for rest, defend (dodging, knocked back), strike (hit landing), finisher, won and lost at 34 moments, and fails if any is outside 94% of the frame. A second test projects every enemy's weak spots in the strike shot and fails if his body covers one. Known: Polyphemus's raised club still leaves the top of the frame on a windup (unchanged).

### Model log

Checked in the running fight (keyboard play, `/`, 1440x810; `docs/screenshots/hero-spartan-default-*.png`).

| Name | Source | Licence | Size | Fit used | Clips used | Verdict |
|---|---|---|---|---|---|---|
| Spartan: Universal Animation Library 1 and 2 mannequin and clips (Quaternius), flat-shaded matte skin, gear built in code | https://quaternius.com/animviewer.html (UAL1 Standard, UAL2 Standard; `License.txt` in both) | CC0 1.0 | 757 KB | `targetHeight` 1.544 (bone box; renders the 1.83 m mesh at about 1.8 m), `rotationY` pi, `offset` z 0.8 (steps him back from the camera so his feet and a crouch stay in frame), adult proportions (head about 1/7.5 of the height) | Guard_Idle, Guard_Block, Crouch_Idle_Loop, Dodge_L/R, Punch_Jab (default strike), Punch_Cross, Melee_Hook, Sword_Regular_A (overhead strike), Sword_Regular_B (thrusts, stretched to 0.55 s, contact at 0.5 s), Hurt, Victory, Death01. UAL1 clips were copied onto the UAL2 skeleton by bone name (identical rest transforms), scale tracks and every translation except the pelvis dropped. Guard_Idle, Guard_Block, Dodge_L/R, Hurt and Victory are stand-ins built from Sword_Idle (pelvis turned 55 degrees toward the giant, lean for the dodges, flinch, arms in a V), with the arms re-solved as above | kept: the hero |

Review notes: his round shield is a matte bronze (the first, shinier one blew out to white when he ducked under the camera). Not verified: a spear thrust caught at full extension in the finisher camera; fists in the webcam path (clips are the same, the pose input is the keyboard's); Dodge_* with the baked guard at full lean (checked at one moment).

### Rejected heroes

Removed from the repo (files, tests, screenshots and URL ids), with the reason:

- Knight (KayKit Adventurers, CC0): big head, bulky, the owner's words.
- Adventurer (Quaternius, CC0): a modern backpacker, not Greek, and no block or duck clip.
- Hoplite (Adventurer re-dressed): the square cape hid the body.
- Warrior: the owner preferred the spartan.
- Universal Base Character (bare mannequin, never shipped): realistic and bare-chested, clashes with the low-poly cave. Screenshot kept: `docs/screenshots/hero-base-idle-rejected.png`.

`/?model=<id>` swaps Polyphemus for a candidate: `dev` (CC0 test robot), `giant`, `classic` (table in `src/render/models/candidates.ts`; the default look is unchanged without the flag). Add `&debug` and read `window.__modelDebug` (`clip`, `time`, `scrub`, `loop`, `clips`) to see what the mixer is playing.

`RiggedModel` also takes `tweakMaterial(material)`, run once on each instance's own copy of every material, to recolour or flat-shade a pack. `BoneMount` (`src/render/models/boneMount.tsx`) parents a prop to a bone and cancels the bone's scale (the Quaternius rigs carry a 100x armature) so the prop is sized in metres. GLTFLoader strips dots from node names, so the bone `Arm.R_end` is anchored as `ArmR_end`. A node ending `_end_end` is not a bone and sits in the wrong place; anchor to `_end`.

## Polyphemus candidates

The giant is the default. Try the others with the keyboard: `http://localhost:5173/?model=giant`, `?model=classic`, `?model=dev` (add `&debug` to read `window.__modelDebug`). Screenshots from a full keyboard fight (a bot played each one to the end) are in `docs/screenshots/polyphemus-<id>-{idle,attack,hit,blinded,death}.png`.

Ranking: 1. `giant`, 2. `classic`. No other confirmed-CC0 giant is on disk (the Bestiary has only an Imp and a Puglin, and the sea-monster and tentacle files are for Scylla), so there is no third candidate.

## Model log

| Name | Source | Licence | Size | Target height / scale / rotation | Clips used | Verdict |
|---|---|---|---|---|---|---|
| giant (Quaternius Giant) | https://poly.pizza/m/BldaiPtyJa | CC0 | 245 KB | 4.6 m (about 2.6 hero heights), scale from bone box (x1.19 here), rotationY 0 (already faces +z), feet on the floor | Idle, Attack (scrubbed by windup, used for all four attack ids), HitRecieve, Death, Walk (Blinded idle); speed 1 / 1.15 / 1.5 per phase | Kept as the lead candidate. Blocky but reads as a stylized giant, animates for real, feet on the ground. Needed: warm tint and flat shading (pack is bright and shiny), a big code-built eye covering its two eyes, a code-built club on `ArmR_end` from the Club phase, a stake in the eye when Blinded. Jump rejected for the boulder: the pose at the end of the windup looked like standing. Club swings do not differ left and right (one Attack clip). |
| classic (hand-built Polyphemus) | `src/render/monsters/models/Polyphemus.tsx`, restyled in `classicPolyphemus.tsx` | Ours | 0 KB | 5 m, no fit needed | none: arms swing by windup, falls over on defeat | Fallback, resized by hand. Flat-shaded, darker skin (the first tint was washed out by the cave light), cloth, club, stake. Weak-spot rings sit exactly on eye and gut. Looks like a doll next to the giant; arms are two capsules. |
| polyphemusProps (eye, stake, club) | built in code | Ours | 0 KB | metres | none | Kept. The first club colour was invisible against the dark rock behind it; lightened. |

Weak spots (changed): measured on the scaled giant in the running fight (`window.__giantEye`, `window.__giantRoot` under `&debug`). The eye prop sits at about y 3.87, z 1.35 in the monster's frame, not 4.3, so the eye is `[0, 3.75, 1.45]` (ring just in front of the eye disc) and the gut is `[0, 2.5, 0.8]` (the torso front is at about z 0.55). Hit sparks use the same positions. Shots: `docs/screenshots/giant-default-strike-eye-p0.png`, `-strike-gut-p0.png`, `-strike-eye-p2.png`.

The giant is now the default Polyphemus with no flag. `?model=classic` keeps the code-built one, `?model=dev` the test robot, anything else gets the giant (`polyphemusChoice`). The GLB is preloaded at import; until it has loaded, or if it fails, the code-built model shows, so there is no blank or T-pose. Checked with a full keyboard fight, all three phases, windups, hits, Blinded, the finisher and the fall (`docs/screenshots/giant-default-*.png`). The eye was a pale plate with a tiny hexagon pupil; it is now amber with a tall dark slit pupil and a lower glow (`docs/screenshots/giant-eye-slit.png`). Known: the giant looks pale and flat while the finisher camera is close and in death; the club is a thin stick from behind; the pack has one Attack clip, so left and right club swings look alike.

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
| Hero (boxer, then the knight) | existing in repo, not mine | n/a | n/a | about 1.8 m | existing | not changed | Boxer seen in every shot; the knight was only seen at idle and has since been removed (the spartan is the hero now). Both stood on the floor, face the giant, scale right. Nothing sits between the camera and the hero. |
| Polyphemus | existing in repo, not mine | n/a | n/a | about 5 m | existing | not changed | Seen with `?model=giant` (GLB) through idle, every windup (club left/right, grab, boulder), strikes, Blinded, finisher, death and loss. Head and raised club clear the roof (7 m). The giant turns pale peach for about 0.4 s when the killing blow lands (a 70-unit point light from HitEffects plus the hit flash); the rest of the finisher it is dark rust (re-checked in `cave-mouth-finisher.png`). Left as deliberate impact feedback. |

Not brought in and not tested in the fight: the Poly Haven photoscans (boulder_01, stone_fire_pit, antique_ceramic_vase_01, rock_face_01, namaqualand_cliff_02, mountainside, marble_bust) and the small_harbour_sunset HDRI. Photo textures on large shapes break the flat-shaded look, so the set pieces are built in code instead.

Cost: measured before the sky change at about 172 draw calls and 30.9k triangles at high, 54 calls and 17.3k at low. The dome adds one draw call and the HDRI background is gone, so it should be about the same; not re-measured.

Not tested: a low-quality finisher shot, the knight past idle, close-range sheep, the live webcam path. The Bloom threshold change (0.85 to 1.0) is shared by every arena and was only looked at here. The 404 console errors seen in every run predate this change and were not traced.

Review fixes: the sea ripple now uses smooth noise and fades at grazing angles (no checker tiles in the finisher orbit); with the HDRI blocked the hero keeps light from a hand-built fallback environment (`cave-mouth-no-hdri.png`), though it is dimmer than with the HDRI.
