# Hero candidate: spartan

| Field | Value |
|---|---|
| Try it | `http://localhost:5421/?hero=spartan&model=giant` (Boxer and Hoplite styles) |
| Source | Quaternius, Universal Animation Library (UAL1 Standard) and Universal Animation Library 2 (UAL2 Standard), https://quaternius.com/animviewer.html |
| Licence | CC0 1.0 (License.txt in both packs) |
| File | `public/models/hero/spartan.glb`, 757 KB |
| Rig | UAL2 mannequin, flat-shaded in code to matte skin; gear built in code (`src/render/hero/gear/spartanGear.tsx`) |
| Fit | `targetHeight` 1.544 (bone box), renders the 1.83 m mesh at about 1.8 m; `rotationY` pi |
| Proportion | adult, head about 1/7.5 of the height |

## Clips per pose

UAL1 and UAL2 mannequins share identical rest transforms, so UAL1 clips were copied onto the UAL2 skeleton by bone name. Scale tracks and every translation except the pelvis were dropped.

| Pose | Clip | Source |
|---|---|---|
| idle | Guard_Idle | stand-in: Sword_Idle (UAL1) with the pelvis turned 55 degrees toward the giant and the arms drawn into a guard |
| block | Guard_Block | stand-in: same base, left arm raised so the shield covers the head |
| duck | Crouch_Idle_Loop | UAL1 |
| dodgeLeft, dodgeRight | Dodge_L, Dodge_R | stand-in: Sword_Idle with a lean about the forward axis, held after 0.18 s |
| punch | Punch_Jab; cross: Punch_Cross; hook: Melee_Hook | UAL1, UAL2 |
| thrust | Sword_Regular_B | UAL2, stretched to 0.55 s, contact at 0.5 s |
| overhead_strike | Sword_Regular_A | UAL2 |
| hurt | Hurt | stand-in: Sword_Idle with a back-and-arms flinch, 0.5 s |
| victory | Victory | stand-in: arms raised in a V |
| defeat | Death01 | UAL1 |

Stand-ins were authored in code from the pack's poses (the pack has no shield-block, sideways dodge or victory with a shield and spear).

## Verdict

Reads as a hoplite from behind: Corinthian helmet and crest, crimson cape, round bronze shield on the left arm, spear in the right hand, cuirass, chiton and greaves. The spear points at the giant's gut on a thrust and does not cover the eye. Weak points: the mannequin has no face or hands detail, the idle stance is a crouched, three-quarter turn, and the feet sit very near the bottom edge of the frame.

## CREDITS line

`| Universal Animation Library 1 and 2 mannequin and clips (Quaternius), trimmed and with authored stand-in poses | public/models/hero/spartan.glb, the ?hero=spartan candidate | https://quaternius.com/animviewer.html | CC0 |`
