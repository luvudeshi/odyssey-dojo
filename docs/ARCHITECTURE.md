# Odyssey Fighter: plan and architecture

HackUTA 2026. Theme: Homer's Odyssey. Judged on Robustness (does it work), Theme and Creativity. One judge plays on our laptop for about 3 minutes, then 2 minutes of questions. **Deadline: 12 PM Sunday.**

Tasks live in [GitHub issues](https://github.com/toyeshhm/odyssey-fighter/issues). How to claim one and report on it: [COORDINATION.md](COORDINATION.md).

## The game

A full-body 3D fight training game. Your webcam tracks your body. You follow Odysseus's route home, fight the monsters he met in the order he met them, and learn real fighting moves as you go.

1. **Meet your god.** The camera looks at you and names the Olympian you take after. That god grants you one power.
2. **Pick a fighting style.** Boxer (jab, cross, hook), Hoplite (spear thrust, overhead strike) or Pankration (kicks and knees).
3. **Follow the quest map.** Cyclops, Circe, the Sirens, Scylla, Charybdis, then the suitors in Ithaca. Each fight you win opens the next.
4. **Fight.** Every exchange has two beats:
   - **Defend.** The monster winds up and a prompt says what stops it: BLOCK, DUCK, DODGE LEFT, DODGE RIGHT.
   - **Strike.** A weak spot lights up and a prompt names a strike. A faint ghost figure shows the pose to hit. The better you throw it, the more damage it does.
5. **Learn as you play.** Each prompt shrinks as you get the move right, and each move says what it is for in real self-defense.
6. **Finish it.** Each monster ends on one big taught move. Polyphemus: drive the stake into his eye.
7. **Bring a friend.** A second player steps into frame, or joins your room from another laptop. Strike together for double damage.

Every move also has a key, so the game runs with no camera and no network. That is the demo fallback.

**The judged demo is the Polyphemus fight.** It gets the polish. Everything else exists to make the quest real around it.

## Status: where we are (updated Saturday 5:35 PM by the lead's agent)

The lead's agent keeps this section true after every batch of merges. The [board](https://github.com/users/toyeshhm/projects/2) has the same items as cards. `main` is green at 829 tests.

### Done, on `main`
- Fight rules: phases, finishing move that cannot be lost, strike quality scaling damage, divine power meter and god moves (#4, #5, #6, #23, #30).
- Calibration with a keyboard escape and the "step back" pause (#8).
- Battle view: third-person camera behind our own character, camera and characters that move (#51).
- The battle world for Polyphemus: the mouth of his cave at dusk, with a graded sunset sky, sea, light shafts and a fire pit (#53, PR #101, #106). The old cave is the fallback.
- Polyphemus is the Quaternius giant by default (toyeshhm's pick), weak spots on his eye and gut; `?model=classic` still works (#11, PR #105).
- The prompt card never drops the move word and its key, defends say HOLD, key hints are monospace (PR #105).
- GLB model pipeline, with gear mounted on bones (PR #91, #100). Hero candidates behind `?hero=<id>`, with the pose ghost (PR #97).
- Title, style select, quest map in Odyssey order, intro line, win and loss screens (#26, #16, PR #60). `/?stop=<enemy id>` jumps to a later stop (PR #112).
- Athena's clips, the phase banner, the teaches line, real sound effects, story narration and monster taunts for every stop (#14, #15, #19, #86, PR #93, #90, #110).
- Styles (Boxer, Hoplite, Karate, Kung Fu, Pankration with kicks), their mythic figures, what each move teaches (#45, #74, #36, #25).
- Six quest stops as data, with pacing, phases and finishers for the later five (#37, #84). Polyphemus data and pacing, the stake thrust (#12, #13).
- AI server: god scan, god card, replay sharing (#43, #62, #64, #65). Demo preflight check, sponsor sections (PR #104, #87).
- Tests: random fights never break the rules, a pose sequence and a close miss per base move, the coach, which body is which for two players (#34, #35, #50 half, #83).
- One prompt card at the right edge; no move list on the fight screen.
- Pitch script and Devpost draft, the asset list, the playtest checklist (#39, #38, #40).

### In progress
| What | Who | Where |
|---|---|---|
| Hero round two: three hoplite candidates on human-proportion figures, `?hero=hoplite|spartan|warrior`; toyeshhm picks from real-fight screenshots | lead's agents, then toyeshhm | #53, #18, PR #108, #111, #114 |
| The five later stops, each a monster and its world: Circe's hall, the Sirens' meadow, Scylla's strait, Charybdis's whirlpool, the hall of Ithaca. A stop opens on the map when its model merges | lead's agents | #27, #53, branches `stop-*` |
| Ghost outline of the move to make (must-have 7) | lead's agent | #24, branch `24-move-ghost` |
| Game menu, settings and pause (structure now, look after toyeshhm's pick) | lead's agent | #52, branch `52-menu-settings-pause` |
| Webcam path run end to end on a fake camera fed from a video, ahead of the real-body test | lead's agent | #7, branch `7-webcam-smoke` |
| Detector fixes, noisy-camera defends, then fight length check and a pose recorder for tonight's tuning | tagrawal029's agent | #81, #82, #115, #116 |
| Music and ambience, then sound for the later stops and a licence report; AI-made fights, adaptive difficulty, online rooms relay (drafts) | luvudeshi's agent | #85, #117, #118, PR #76, #78, #92, #103 |

### Left
- **Must:** toyeshhm picks the hero and the menu look. Every model re-shot in its world and logged as kept, resized or rejected (`docs/models.md`, `docs/models/`). Webcam fight on a real body and detector tuning on the three of us (#7, #17; toyeshhm does the real-body test; the 8 PM checkpoint is one full webcam fight on the demo laptop). Freeze tag at 1 AM. Devpost, demo video, backup recording (#21).
- **Should:** player dressed per style (#18), two players in the fight (#28), online rooms (#29).

### Art direction (toyeshhm, Saturday 4:15 PM)
1. Stylized low-poly look with strong lighting.
2. The Polyphemus fight is in the mouth of his cave at dusk: sunset sky and sea behind the giant, light shafts, a fire pit, boulders.
3. The player is an animated rigged hero that plays real clips when a move is detected, plus a faint ghost outline of the live webcam pose.
4. toyeshhm chooses the look and the models. Agents decide engineering only, and build model choices as candidates behind a URL flag.

## Features

### Must have: frozen at 1 AM Sunday
| # | Feature | Issue |
|---|---|---|
| 1 | Webcam pose drives every move, with a key for each as fallback | #7 |
| 2 | Calibration countdown; "step back, I can't see you" pause | #8 |
| 3 | Style select: Boxer, Hoplite | built |
| 4 | Moves taught in the fight, prompts that fade as you learn; each move says what it teaches | built, #4 |
| 5 | The player's movements shown live on a 3D figure | built, #7 |
| 6 | Damage scales with how well the move is done (GOOD, GREAT, PERFECT) | #23 |
| 7 | Faint ghost outline of the move to make | #24 |
| 8 | Polyphemus in three phases: The Cave, The Club, Blinded | #5, #11, #12 |
| 9 | Finishing move: the stake | #6, #13 |
| 10 | Athena as voice coach, clips made ahead of time so it works offline | #14, #15 |
| 11 | Hit feel: shake, flashes, sparks, a cave arena | #9, #10 |
| 11a | Action-RPG battle view: our own character seen from behind, facing the monster; camera and characters move | #51 |
| 12 | Quest map in Odyssey order, Polyphemus playable, the rest shown ahead | #26 |
| 13 | Title, intro line, win and loss screens | #16 |
| 14 | Detectors tuned on all three of us | #17 |
| 15 | Devpost, demo video, backup recording | #21 |

### Should have: in this order, after the freeze (earlier if it is your own claimed area and touches nothing shared)
| # | Feature | Issue |
|---|---|---|
| 16 | God scan: a webcam snapshot goes to Gemini and comes back as your god; falls back to body measurements in the browser | #20, #2 |
| 17 | Divine power: defends fill a meter, your god's gesture spends it | #30 |
| 18 | Kicks and the Pankration style | #25 |
| 19 | Two players on one camera, double damage | #28 |
| 20 | Scylla, the second stop | #27 |
| 21 | Online rooms: host a fight, a friend joins with a code | #29 |
| 22 | Player figure dressed for the style; real sound effects; Homer's narration and taunts | #18, #19, #2 |

### Stretch
- AI-made fights: describe how you fight in your own words and Gemini builds the fight (#2). Reached from its own menu entry, never in the way of the quest.
- Replay and god card with a QR code (#2).
- More quest stops: Circe, the Sirens, Charybdis, the suitors.
- Difficulty that adapts to the player. Rigged downloaded models.

### Later: agreed, not started (do not begin until toyeshhm says so)

The direction is a fully fleshed-out game with action-RPG style battles. Nothing is waiting here now.

The complete UI redesign (#52) was opened up by toyeshhm on Saturday at 5 PM: the menu, settings and pause are being built, and he picks the look. Sophisticated graphics and real 3D models (#53) moved to "in progress" on Saturday afternoon: looks are the top priority.

## How it fits together

```
webcam -> pose/tracker -> pose/signals (history, baseline, quality) -> moves/defs/* (detectors)
                                                                            |
keyboard -> input/keyboard --------------------------------------> input/poseInput (merge)
remote player -> net/ (rooms) ------------------------------------------->  |
                                                              CombatInput (held, struck + quality + player)
                                                                            v
        enemies/defs/* + styles/defs/* + god power ------------> combat/engine.step()
                                                                            |
                                                  CombatState + CombatEvents each frame
                                                   |            |           |          |
                                             render/Scene    hud/Hud   audio/*    net/ (to guest)

server/ (optional): Gemini and ElevenLabs keys, god reveal, AI fights, room relay.
The game must start and play a full fight with the server off.
```

- **`combat/engine.ts` is pure.** No camera, graphics, clock or network. It takes the state, what the players are doing and the time passed, and returns the new state plus events. That is why keyboard, webcam and a remote player are interchangeable, and why the rules are tested without a browser.
- **Content registers itself.** Moves, styles, enemies and monster models are one file each in a `defs/` or `models/` folder. Adding one never means editing a shared list.
- **Everything visible reads state and events.** Scene, HUD, effects and audio never change the fight.
- **`tests/content.test.ts` guards merges.** It fails if an enemy or style names a move that does not exist.
- **The first base stays.** Every feature above is an addition to it, so nothing was thrown away.

### Contract changes (#4, lead, lands first)
- `EnemySpec`: `phases`, `finisher`, `place`, `book`. `EnemyAttack`: optional `weight`.
- `CombatPhase`: `finisher`. `CombatEvent`: `phaseChanged`, `finished`, `powerUnleashed`; `enemyHit` carries `quality`.
- `CombatInput.struck`: each entry has the move, a 0..1 `quality` and the player (0 or 1).
- `MoveDef`: `ghost` (target pose), `teaches` (one line), optional `quality(history)`.
- `CombatState`: `power` (0..1), `players` (1 or 2). `MonsterProps`: `phaseIndex`, `hitFlash`.

## Folders and owners

| Path | What | Owner |
|---|---|---|
| `src/core/types.ts` | Shared contracts | **Lead** (toyeshhm) |
| `src/combat/`, `src/pose/`, `src/input/` | Fight rules, tracking, input | **Lead** |
| `src/render/`, `src/hud/`, `src/screens/`, `src/App.tsx`, `src/index.css` | Everything you see: arena, monsters' models, player figure, ghost outline, effects, overlays, screens, quest map | **Lead** |
| `server/`, `src/ai/`, `src/audio/`, `src/replay/`, `public/audio/` | Backend, god reveal, AI fights, all sound | luvudeshi (#2) |
| `src/moves/defs/`, `src/styles/defs/`, `src/enemies/defs/` | One file per move, style and monster's data | Whoever holds the issue |
| `src/net/` | Online rooms | Whoever holds the issue |
| `docs/devpost.md`, video, backup run | Submission | Whoever holds the issue |
| `package.json`, `vite.config.ts`, `Makefile`, `index.html`, `.gitignore`, `README.md` | Shared files | PR only |

**The lead's agent keeps the core, the hardest parts and all UI and design.** Teammates' agents take content (moves, styles, monster data), detector tuning, sound, the server and AI features, online rooms and the submission.

## Timeline

| When | Goal |
|---|---|
| Sat by 4 PM | Plan and issues live. Contract changes (#4) merged. |
| Sat 4 to 8 PM | Webcam working on a real body (#7). Phases and finisher in the engine (#5, #6). Arena, hit feel, Athena, Polyphemus model and data in parallel. |
| **Sat 8 PM** | **Checkpoint 1:** one full webcam fight, start to finish, on the demo laptop. |
| Sat 8 PM to Sun 1 AM | Quality scoring, ghost outline, quest map, calibration, tuning. All must-haves merged. |
| **Sun 1 AM** | **Checkpoint 2:** must-haves frozen on a tag. |
| Sun 1 to 7 AM | Should-haves in order. Sleep in shifts. |
| Sun 7 to 10 AM | No new features. Test in the judging room's light. Record the backup run and the demo video. |
| Sun 10 to 11:30 AM | Devpost written and submitted, 30 minutes spare. |

## Approaches we considered

- **2D vase-painting look.** Cheapest to make cohesive. Dropped: we want a real 3D game.
- **Downloaded rigged models from the start.** Looks most finished, but mapping webcam pose onto a rigged character blocks everything else.
- **3D built in code now, models later (chosen).** Each monster's model is one file behind a fixed interface, so swapping one in later touches nothing else.
- **A separate tutorial.** Dropped: prompts and the ghost outline teach inside the fight.
- **A full quest of short fights.** Dropped for the judged build: one deep fight is safer in front of a judge. The quest map keeps the journey.
- **Rewriting the base.** Not needed: every new feature is an addition to the contracts.

Fresh code only. Ideas from earlier projects are fine; no code is copied from them.
