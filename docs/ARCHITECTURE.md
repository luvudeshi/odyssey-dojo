# Odyssey Dojo: plan and architecture

HackUTA 2026. Theme: Homer's Odyssey. Judged on Robustness (does it work), Theme and Creativity. One judge plays on our laptop for about 3 minutes, then 2 minutes of questions. **Deadline: 12 PM Sunday.**

Tasks live in [GitHub issues](https://github.com/toyeshhm/odyssey-dojo/issues). How to claim one and report on it: [COORDINATION.md](COORDINATION.md).

## The game

A full-body 3D fight training game. Your webcam tracks your body. You follow Odysseus's route home, fight the monsters he met in the order he met them, and learn real fighting moves as you go.

1. **Pick your hero.** Odysseus, Zeus, Poseidon, Athena or Achilles. Each hero brings one power. (A webcam god scan that named your Olympian was built and taken out, PR #392.)
2. **Pick a fighting style.** Boxer (jab, cross, hook), Jiu-jitsu (double palm, rising palm, knife hand), Karate, Kung Fu or Taekwondo (kicks and knees).
3. **Follow the quest map.** Cyclops, Circe, the Sirens, Scylla, Charybdis, then the suitors in Ithaca. Every stop is open from the start.
4. **Fight.** Every exchange has two beats:
   - **Defend.** The monster winds up and a prompt says what stops it: BLOCK, DUCK, DODGE LEFT, DODGE RIGHT.
   - **Strike.** A weak spot lights up and a prompt names a strike. A faint ghost figure shows the pose to hit. The better you throw it, the more damage it does.
5. **Learn as you play.** Each prompt shrinks as you get the move right, and each move says what it is for in real self-defense.
6. **Finish it.** Each monster ends on one big taught move. Polyphemus: drive the stake into his eye.
7. **Bring a friend.** A second player steps into frame, or joins your room from another laptop. Strike together for double damage.

Every move also has a key, so the game runs with no camera and no network. That is the demo fallback.

**The judged demo is the Polyphemus fight.** It gets the polish. Everything else exists to make the quest real around it.

## Status: where we are (updated Sunday 3:30 AM, checked against `main` at PR #341)

A few lines below were brought up to date on 15 November (Multiplayer, accounts, the god scan pick, waist-up). [FEATURES.md](FEATURES.md) is the current list.

The lead's agent keeps this section true after every batch of merges. The [board](https://github.com/users/toyeshhm/projects/2) has the same items as cards. Every PR number below is merged.

### Done, on `main`
- **The game is Odyssey Dojo** on screen, in the docs, in storage keys and file names (PR #296, #298). It reads as self-defense training: the tagline is "Learn real self-defense, one monster at a time." (PR #334), and the cards, the Dojo and the result screen say what each guard and move is for (PR #339).
- **Main menu** on a painted storm scene with four bronze shields: Story mode, Multiplayer, Training Dojo, Account (PR #281, #293, #296, #328, #334, #338). A Keyboard or Camera setting decides how Story mode starts (PR #314).
- **Quest:** all six stops are open from the map, each with its own monster, arena and sound: Polyphemus, Circe, the Sirens, Scylla, Charybdis, the Suitors (PR #296). A stop on the quest map, now a painted storm, starts its fight (PR #281, #328). A reload keeps the beaten stops (PR #320). The Sirens, Scylla and Charybdis got a last move, and the Sirens a second attack in their first phase (PR #318).
- **Fight:** phases, a finishing move that cannot be lost, strike quality scaling damage, divine power with a 3D effect and a sound for each god (PR #280, #289), the guard shield as Athena's aegis (PR #285, #294), a real dodge (PR #305), a leap to the weak spot (PR #279), the boulder throw (PR #270). Jab, cross and hook read on either hand (PR #272). The hero strikes a pose for each god power (PR #330).
- **Fight HUD in the Obsidian Rift look:** lava health bars, glass power disc, action cards, score (PR #323). The prompt card has a 3D mannequin that acts out the move (PR #275).
- **Training Dojo** as an obsidian forge hall: an outline of each move, a grade and points for every try, what to work on at the end (PR #273, #325). The end screen says what the session changed in the fights (PR #292).
- **Multiplayer** is one screen with four cards: host a room, join a room, two players on one camera, and a FaceTime call (PR #296, #326, #327, #436). A guest who reloads gets the same room and seat back (PR #331). The FaceTime call, in `src/facetime/`, puts a friend's iPhone into the fight; its card always shows, its Call button works only when the server has its phone settings, and hang-up closes the room (PR #319, #321, #336). The game answered one real call on 15 November (`docs/facetime.md`, "Run so far").
- **Account** is the hall of the hero: name, achievement badges with progress, an unlock notice after a fight, twelve more achievements (PR #290, #304, #317, #324).
- **Sound:** menu, fight and last-stop music by Shane Ivers (PR #301, #333); an unlock chime and a sound for each kind of defend (PR #299); a war horn on a phase change (PR #315); Homer's lines run to their end as a fight starts and before a stop (PR #306, #316); Homer's closing line for the homecoming (PR #291); Scylla's taunt for each phase (PR #282).
- **Hosting:** a kit to run the game on Vultr over https, in `deploy/vultr/` (PR #332, `docs/deploy-vultr.md`). Not run on a real instance.
- **Accounts and the Hall of heroes on Tiger Data** (PR #322): the server routes, the database code and the tests. Off unless `DATABASE_URL` is set (`docs/accounts.md`). The sign-in and the hall board are on the Account screen.
- **Built, not on a screen:** a defense-first progress panel with its saved history (PR #341), a module with tests. The god scan's character pick (PR #340) went out with the scan (PR #392); players pick a hero themselves.
- Earlier, still true: calibration with a keyboard escape, the live camera panel, balance and adaptive difficulty, detectors that hold for any body size and a 30 degree turn, five styles (Boxer, Jiu-jitsu, Karate, Kung Fu, Taekwondo), 26 moves each with a line on what it is for, the AI server (god scan, rooms relay, replay sharing), the Muse's "How do you fight?" screen, reached only at `?ai=1` (PR #307), the demo runbook (PR #286) and credits for every shipped asset (PR #283).

### Still open
- **Must:** one full webcam fight on a real body on the demo laptop, and detector tuning from real traces (#7, #17). The Devpost page, the demo video and the backup recording (#21, #130).
- **Not finished:** waist-up play is wired into the fight (`src/moves/waistUp.ts`, PR #419) but not tried on a real webcam, and a smoke run on Windows (#193).
- **Not tried on real hardware:** a FaceTime call, the Vultr host, a database on the demo laptop.

### Not on `main`
Branches that are not merged are not described here: other HUD looks, boss cutscenes, a shared menu look for every screen, a single Polyphemus model and lenient webcam detection.

### Art direction (toyeshhm, Saturday 4:15 PM)
1. Stylized low-poly look with strong lighting.
2. The Polyphemus fight is in the mouth of his cave at dusk: sunset sky and sea behind the giant, light shafts, a fire pit, boulders.
3. The player is an animated rigged hero that plays real clips when a move is detected, and the live camera panel shows the tracked body. The move ghost is off (7:00 PM).
4. toyeshhm chooses the look and the models. Agents decide engineering only, and build model choices as candidates behind a URL flag.
5. Hero (Saturday 5:20 PM): the spartan. His gear is not always out: the shield rides on his back and his hands are free to punch and block; the spear is drawn only for a spear move.
6. Interface (Saturday 6:19 PM, replacing the Saturday 5:20 PM black-figure pottery; since Sunday 4 AM the screens have been restyled one by one, see Status, and the pebble kit still supplies the buttons and panels): pebble mosaic, his pick from ten boards. The whole interface is laid in small river pebbles on a dark ground, as on the floors of Pella and Olynthos, with thin lead strips and a wave scroll along the borders. In the fight only edge pieces are laid: stone-by-stone health bars, one prompt card at the right edge (a rounded slate shield for DEFEND, a pointed warm spearhead for STRIKE). Move words, keys and timers stay plain type. The kit is `src/ui/pebble/`, its notes `docs/ui-pebble.md`. Fight screen only (7:04 PM): the HUD and prompt card in the star-chart look, the camera panel in pebble mosaic.

## Features

### Must have: frozen at 1 AM Sunday
| # | Feature | Issue |
|---|---|---|
| 1 | Webcam pose drives every move, with a key for each as fallback | #7 |
| 2 | Calibration countdown; "step back, I can't see you" pause | #8 |
| 3 | Style select: Boxer, Jiu-jitsu, Karate, Kung Fu, Taekwondo | built |
| 4 | Moves taught in the fight, prompts that fade as you learn; each move says what it teaches | built, #4 |
| 5 | The player's movements shown live on a 3D figure | built, #7 |
| 6 | Damage scales with how well the move is done (GOOD, GREAT, PERFECT) | #23 |
| 7 | Faint ghost outline of the move to make | #24 |
| 8 | Polyphemus in three phases: The Cave, The Club, Blinded | #5, #11, #12 |
| 9 | Finishing move: the stake | #6, #13 |
| 10 | Athena as voice coach, clips made ahead of time so it works offline | #14, #15 |
| 11 | Hit feel: shake, flashes, sparks, a cave arena | #9, #10 |
| 11a | Action-RPG battle view: our own character seen from behind, facing the monster; camera and characters move | #51 |
| 12 | Quest map in Odyssey order, every stop open | #26 |
| 13 | Title, intro line, win and loss screens | #16 |
| 14 | Detectors tuned on all three of us | #17 |
| 15 | Devpost, demo video, backup recording | #21 |

### Should have: in this order, after the freeze (earlier if it is your own claimed area and touches nothing shared)
| # | Feature | Issue |
|---|---|---|
| 16 | God scan: a webcam snapshot goes to Gemini and comes back as your god; falls back to body measurements in the browser. Built, then taken out of the game (PR #392) | #20, #2 |
| 17 | Divine power: defends fill a meter, your god's gesture spends it | #30 |
| 18 | Kicks and the Taekwondo style | #25 |
| 19 | Two players on one camera, double damage | #28 |
| 20 | Scylla, the second stop | #27 |
| 21 | Online rooms: host a fight, a friend joins with a code | #29 |
| 22 | Player figure dressed for the style; real sound effects; Homer's narration and taunts | #18, #19, #2 |

### Stretch
- AI-made fights: describe how you fight in your own words and Gemini builds the fight (#2). Built: reached only at `?ai=1`. The main menu's "Ask the Muse" button (PR #409) was taken out on 15 November at the owner's word.
- Replay and god card with a QR code (#2).
- More quest stops: Circe, the Sirens, Charybdis, the suitors.
- Difficulty that adapts to the player. Rigged downloaded models.

### Later

Nothing is agreed and waiting. The direction is a fully fleshed-out game with action-RPG style battles.

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

server/ (optional): Gemini and ElevenLabs keys, god reveal, AI fights, room relay, FaceTime rooms, accounts on Tiger Data.
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
