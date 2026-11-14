# Odyssey Fighter: plan and architecture

HackUTA 2026. Theme: Homer's Odyssey. Judged on Robustness (does it work), Theme, Creativity, at a table where a judge plays on a laptop webcam: 3 minutes to present, 2 for questions.

## The game

A full-body 3D fighting game. Your webcam tracks your body. You fight the monsters Odysseus met on his way home, and the game teaches you each move in the middle of the fight.

1. **Pick a fighting style.** Boxer (jab, cross, hook: Odysseus boxes the beggar Irus in Book 18) or Hoplite (spear thrust, overhead strike).
2. **Fight.** Every exchange has two beats:
   - **Defend.** The monster winds up and a red prompt card says what stops it (BLOCK, DUCK, DODGE LEFT, DODGE RIGHT) with a stick-figure diagram. The defense counts if you are holding it when the attack lands.
   - **Strike.** A gold ring marks a weak spot and a gold card names a strike from your style (JAB, LEFT HOOK...). Land it before the window closes.
3. **Learn as you play.** Each time you get a move right, its prompt shrinks: full card with diagram and hint, then just the word, then just the timer. Hits in a row build a combo that adds damage.
4. **Climb the ladder.** Polyphemus, then Scylla, then a boss. Win them all and Ithaca is yours.

Every move also has a key, so the game is playable with no camera. That is the demo fallback.

## Deadline

The opening slides say Devpost is due **11:59 PM Saturday** and judging is 1 PM Sunday. Until an organizer says otherwise, a playable build and a Devpost entry go in by 11:30 PM Saturday. Anything after that is polish.

## Approaches we considered

- **2D vase-painting look.** Cheapest to make cohesive. Dropped: we want it to feel like a real 3D game.
- **3D with downloaded rigged models from the start.** Looks most finished, but mapping webcam pose onto a rigged character is fiddly and blocks everything else.
- **3D built in code now, models later (chosen).** Monsters and the player are made of simple 3D shapes. Each monster's model is one file behind a fixed interface, so swapping in a downloaded model later touches nothing else.
- **A separate tutorial with a 3D teacher.** Dropped for now: prompts inside the fight teach the moves. A tutorial can come later.

Fresh code only. Ideas from our earlier pose-tracking work are fine; no code is copied from it.

## How it fits together

```
webcam -> pose/tracker -> pose/signals (history, baseline) -> moves/defs/* (detectors)
                                                                   |
keyboard -> input/keyboard ----------------------------> input/poseInput (merge)
                                                                   |
                                                         CombatInput (held, struck)
                                                                   v
            enemies/defs/* + styles/defs/* ----------> combat/engine.step()
                                                                   |
                                         CombatState + CombatEvents each frame
                                             |              |            |
                                       render/Scene      hud/Hud     audio/sfx
```

- **`combat/engine.ts` is pure.** No camera, graphics or clock. It takes the state, what the player is doing and the time passed, and returns the new state plus events. Everything visible is drawn from that state. This is why the keyboard and the webcam are interchangeable and why the rules are tested without a browser.
- **Content registers itself.** Moves, styles, enemies and monster models are each one file in a `defs/` or `models/` folder. A registry picks up every file in the folder, so adding one never means editing a shared list.
- **`tests/content.test.ts` guards merges.** It fails if an enemy or style names a move that doesn't exist or is the wrong kind, or if two moves share a key.

## Folders

| Path | What | Owner |
|---|---|---|
| `src/core/types.ts` | Shared contracts: every type that crosses a folder boundary | **Lead** |
| `src/combat/` | Fight rules | **Lead** |
| `src/pose/` | Webcam tracking, pose history, shared measurements | **Lead** |
| `src/input/` | Keyboard and pose turned into combat input | **Lead** |
| `src/screens/`, `src/App.tsx` | Screen flow and the per-frame loop | **Lead** |
| `src/moves/defs/` | One file per move: prompt, hint, key, diagram, detector | Anyone |
| `src/styles/defs/` | One file per fighting style | Anyone |
| `src/enemies/defs/` | One file per monster, as data | Anyone |
| `src/render/monsters/models/` | One file per monster's 3D model | Anyone |
| `src/render/` (rest), `src/hud/`, `src/audio/` | Arena, player figure, overlays, sound | Anyone, one person per file at a time |
| `tests/` | Engine and content tests | Whoever changes the code |

## Working together

- Branch from `main`, one feature per branch, open a PR. The lead merges.
- `make check` must pass before you open the PR.
- Stay inside the files your task names. If you need a change to `src/core/types.ts` or anything marked **Lead**, ask first: those are the files everyone else depends on.
- Tune move detectors at `http://localhost:5173/?debug`, which shows every detector's live confidence. A move fires at 0.7.

## Tasks to pick up

Each is self-contained and lands in its own files. Put your name next to one in the team chat before you start.

**Moves** (`src/moves/defs/`, copy `jab.ts` or `block.ts`)
- [ ] Uppercut for Boxer: wrist rises fast with the elbow bent. Add it to `styles/defs/boxer.ts` and to enemy weak spots.
- [ ] Shield bash for Hoplite: left forearm across the chest, then pushed forward.
- [ ] Tune every detector on a real webcam with `?debug`: thresholds in `pose/signals.ts` and each move file are first guesses.

**Monsters**
- [ ] Scylla's 3D model (`render/monsters/models/Scylla.tsx`, copy `Polyphemus.tsx`): six necks that strike on `head_left`, `head_right`, `head_high`, `head_center`. Her data already exists.
- [ ] Boss: data file plus model. Antinous and the suitors, or Poseidon. Faster warnings, more health.
- [ ] Charybdis or the Sirens as a fourth fight.
- [ ] Give Polyphemus a club, a hit reaction and an idle sway.
- [ ] Swap a monster for a free rigged model (Quaternius, Poly Pizza), with credit in the README.

**Look and feel**
- [ ] Arena dressing: sea, cave walls, torches, a sky. One arena per enemy if time allows.
- [ ] Hit feedback: screen shake, a flash on the monster, sparks at the weak spot.
- [ ] Player figure: thicker limbs, a helmet, a shield or gloves that match the chosen style.
- [ ] Title screen and style-select art.

**Sound** (`src/audio/sfx.ts`)
- [ ] Replace the placeholder tones with real clips in `public/audio/`.
- [ ] Athena as coach: ElevenLabs lines generated ahead of time ("Hands up!", "Now, his eye!") played on `telegraph` and `opening` events.
- [ ] Monster taunts and a Homer-style line at the start and end of each fight, from each enemy's `taunts`.

**Robustness**
- [ ] "Step back so the camera sees you" pause when the body leaves the frame.
- [ ] A calibration moment before the first fight ("stand still"), with a visible countdown.
- [ ] Test in the judging room's lighting; record a backup video of a full run.

**Submission**
- [ ] Devpost page, screenshots and the demo video.

## Stretch goals (only after the base game is solid)

- **God scan:** the webcam picks which Olympian you are and that god grants a special power on a gesture.
- **AI-generated fights:** describe a fighting style in your own words and get a custom moveset and arena.
- **Replay and god card** with a QR code.
- **Difficulty that adapts** to how well you are doing.
