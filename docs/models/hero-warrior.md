# Hero candidate: warrior

Try it: `/?hero=warrior&model=giant` (Boxer and Hoplite both).

## Source

- Model and clips: Quaternius, Universal Animation Library (the Godot "Standard" pack), the mannequin character.
  Page: https://quaternius.itch.io/universal-animation-library . Licence text shipped in the pack
  (`License.txt`): "CC0 1.0 Universal (CC0 1.0) Public Domain Dedication ... Models by @Quaternius". No account needed.
- File: `public/models/hero/warrior.glb`, 744 KB. Trimmed from the pack: 16 clips kept, scale tracks and all translation
  tracks except hips and root dropped, clips resampled, unused accessors removed.
- Gear (helmet, cuirass, skirt, cape, greaves, shield, spear) is built in code, `src/render/hero/gear/warriorGear.tsx`.

CREDITS line: `Hero "warrior": Universal Animation Library mannequin by Quaternius, CC0, https://quaternius.itch.io/universal-animation-library`

## Fit

`targetHeight` 1.63 (bone height, toe to neck; about 1.8 m with the helmet), `rotationY` PI, `offset` [0, 0, 0.8] so the
whole body, feet included, is in frame and the hero stands on the cave floor facing the giant.

## Clips

| Pose | Clip | Note |
|---|---|---|
| idle | Sword_Idle | |
| block | Guard_Hold | baked: last frame of Punch_Enter held over 1 s, so the loop never pops. Fists at the face, shield raised beside it |
| duck | Crouch_Idle_Loop | loops; no hold scrub |
| dodge left / right | Sword_Idle + code lean | STAND-IN: the pack has no side-step. The whole body leans 0.42 rad about the feet while the key is held. Lean sign checked by eye only |
| punch (jab, cross, uppercut) | Punch_Jab, Punch_Cross | scrubbed by the fight clock |
| thrust (spear moves) | Punch_Cross with a code-built spear | STAND-IN: the spear appears only for spear moves and finishers and is aimed at the giant whatever the wrist does |
| hook, overhead strike | Sword_Attack | |
| hurt | Hit_Chest | |
| victory | Dance_Loop, played once | STAND-IN: no dedicated victory clip |
| defeat | Death01 | |

## Verdict

Nothing better than the Quaternius characters was found under a usable licence in the time box, so this is built from
the best of them. It is not a finished hero: the body is a mannequin, the skin is a tint, and several poses are stand-ins.

Looked at and rejected:

- Gobkit freebies (https://gobkit.com/freebies, "CC0 1.0 Universal, public domain", no account): 20 packs, about 160
  characters, 7 clips each. Every one is chibi (head a half to a third of the height), so no adult proportions, and no
  crouch, side-step or block clips.
- CGTrader and similar hoplite or spartan GLBs: paid or royalty-free, not CC0 or CC BY.
- Quaternius Modular Character Outfits, Fantasy (https://quaternius.itch.io/modular-character-outfits-fantasy, CC0):
  263 MB, GLB not confirmed, too heavy for the time left.
- Quaternius Universal Base Characters, Superhero_Male: adult but muscular, high-poly and textured, does not match
  the low-poly look.
- KayKit (too chunky) and the Quaternius Adventurer were already tried by others.
