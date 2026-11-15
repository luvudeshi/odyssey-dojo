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

## Status: where we are (updated Saturday 6:35 PM by the lead's agent)

The lead's agent keeps this section true after every batch of merges. The [board](https://github.com/users/toyeshhm/projects/2) has the same items as cards. `main` is green at over 1,600 tests.

### Done, on `main`
- Fight rules: phases, finishing move that cannot be lost, strike quality scaling damage, divine power meter and god moves, a 3 second pause after a phase change so Athena's line is heard (#4, #5, #6, #23, #30, PR #176).
- Calibration with a keyboard escape and the "step back" pause (#8). Fake-camera smoke test; the pose model runs once per camera frame (PR #146).
- All six quest stops, each with its own monster, arena and sound: Polyphemus in the mouth of his cave at dusk (Quaternius giant), Circe, the Sirens, Scylla, Charybdis, the Suitors (#27, #53, PR #136 to #140, #147, #149). toyeshhm has accepted Scylla's look; the others are playable while alternates are built.
- Hero: the spartan with stowed gear (toyeshhm's pick), who follows the player's body in real time (PR #142, #159). Body tracking has only run on made-up frames and a fake camera.
- Live camera panel with the tracked skeleton on the fight screen (PR #153).
- Interface: black-figure pottery on the title, style select, quest map, intro, HUD, prompt card, win and loss (PR #134). Being replaced, see In progress.
- Gold move ghost (PR #133). toyeshhm decides whether it stays once he sees it with and without.
- Sound: Athena's calls for every move and a phase line for every stop, story narration, monster taunts, music and effects, hooked up in the game (PR #144, #149, #167). God scan as a step before the style menu (PR #144).
- Balance: a first-time player wins the first fight (toyeshhm's ruling), the five later stops retuned, adaptive difficulty (PR #135, #164, #76).
- Detectors hold for any body size and distance and for a player turned 30 degrees; the baseline carries a 3D shoulder width and torso length (PR #137, #168).
- Built but not yet shown in the game: the 15 second warm-up skill check (PR #165, #166), the real situation each attack stands for and the story ending of each stop (PR #169, #170), AI-made fights engine half (PR #78).
- Styles (Boxer, Hoplite, Karate, Kung Fu, Pankration with kicks), their mythic figures, what each move teaches (#45, #74, #36, #25).
- AI server: god scan, god card, replay sharing, rooms relay (#43, #62, #64, #65, PR #103).
- Tools: frame rate check, licence report with audio credits, smoke run of every stop, demo preflight, pose recorder (PR #141, #143, #162, #175, #104, #116).
- Rules for agents: nobody sits blocked or idle, and every post from gatik-g gets a reply and, if worth building, a task (PR #152).

### In progress
| What | Who | Where |
|---|---|---|
| Pebble mosaic interface (toyeshhm's pick, Saturday 6:19 PM, replacing black-figure pottery) on every screen, the HUD and the prompt card. Carries the situation line on the defend card, "what you practised" and the ending on the result screen, and an optional warm-up button before the first fight | lead's agents | #171, #50, branches `pebble-*`, landing as one PR |
| Alternate models and terrain for Circe, Charybdis and the Suitors behind `?look=`, for toyeshhm to pick from real-fight screenshots | lead's agents | #53, PRs from `look-*`, held until he picks |
| Fixes from the QA sweep: each stop plays its own sounds, wording per enemy, Polyphemus and Scylla windups that read apart, weak-spot rings on the right place, the move ghost behind one switch with on and off screenshots | lead's agents | branches `qa-*` |
| Camera panel: no flash after resume, caption agrees with the step-back pause | lead's agent | branch `camera-view-followup` |
| Online rooms: host and join screens, guest fight, touch buttons, re-merged with the review fixes | lead's agent | #29, PR #150 |
| Webcam fight on a real body, and traces for tuning | toyeshhm | #7, #17 |
| A beginner's floor at the later stops, the pure parts of training mode, jab and cross for narrow shoulders | tagrawal029's agent | #127, #172, #178 |
| Licence gaps to zero, https tunnel for room guests with limits, offline check, voice fixes. Finishing work in hand, then paused by luvudeshi | luvudeshi's agent | #154, #155, #156, PR #177 |

### Left
- **Must:** one full webcam fight on a real body on the demo laptop (the 8 PM checkpoint) and detector tuning from real traces (#7, #17). The pebble mosaic interface merged and checked on every screen. The lead's fix list (#179). Freeze tag at 1 AM.
- **Should:** training mode, after the freeze (#172). Frame rate measured on the demo laptop at every stop. Player dressed per style (#18).
- **On hold by toyeshhm:** the Devpost draft (#130). Demo video and backup recording, Sunday 7 to 10 AM (#21).
- **Stretch, kept and not cut (toyeshhm, 6:19 PM):** AI-made fights screen (PR #92), god card and share panel (PR #109), two players on one camera (#28).

### Art direction (toyeshhm, Saturday 4:15 PM)
1. Stylized low-poly look with strong lighting.
2. The Polyphemus fight is in the mouth of his cave at dusk: sunset sky and sea behind the giant, light shafts, a fire pit, boulders.
3. The player is an animated rigged hero that plays real clips when a move is detected, plus a faint ghost outline of the live webcam pose.
4. toyeshhm chooses the look and the models. Agents decide engineering only, and build model choices as candidates behind a URL flag.
5. Hero (Saturday 5:20 PM): the spartan. His gear is not always out: the shield rides on his back and his hands are free to punch and block; the spear is drawn only for a spear move.
6. Interface (Saturday 6:19 PM, replacing the Saturday 5:20 PM black-figure pottery): pebble mosaic, his pick from ten boards. The whole interface is laid in small river pebbles on a dark ground, as on the floors of Pella and Olynthos, with thin lead strips and a wave scroll along the borders. In the fight only edge pieces are laid: stone-by-stone health bars, one prompt card at the right edge (a rounded slate shield for DEFEND, a pointed warm spearhead for STRIKE). Move words, keys and timers stay plain type. The kit is `src/ui/pebble/`, its notes `docs/ui-pebble.md`.

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
