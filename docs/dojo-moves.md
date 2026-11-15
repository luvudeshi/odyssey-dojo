# More moves and styles for the Training Dojo

> **Safety note.** This game is practice for two things: reacting in time and keeping your distance. It is no replacement for a class with an instructor and a partner. In a real situation the first choice is always to leave: get to a safe place with people in it. Nothing here is a reason to stay and fight.

Part of issue #33. These moves and styles are for the Training Dojo only. They live in `src/coach/extra/` and are **not** in the game's registries (`src/moves/registry.ts`, `src/styles/registry.ts`), so no fight ever asks for them. `tests/dojoExtraMoves.test.ts` fails if one of them turns up in the game, if a move has no line, guide or tip, or if a line differs from its row below.

**Not tried on a camera.** Every detector here was written against made-up pose frames, the same kind the other detector tests use. None has been tried on a real body in front of a real webcam, and every threshold is a first guess. The kicks need the whole body in the picture, feet included.

## The moves

Each `teaches` line is our own wording, at most 90 characters, checked against the source next to it. The lines are about protecting yourself and getting away, not about hurting anyone.

| Move | `teaches` | Source checked | What the source says | What the camera needs to see |
|---|---|---|---|---|
| Roundhouse kick (`roundhouse_kick`) | A kick swung in from the side reaches low while you stay out of hand range. | [Self Defense handout][asu], "Position of attacker determines where you will strike" and "Knee" | Do not step in closer to use a hand when a kick can reach. The knee can be kicked from the side, without much risk of the foot being caught. The source covers a low kick from the side, not the roundhouse by name: [Fundamentals][sk] lists the roundhouse (mawashi-geri) among its kicks but does not describe it. How the kick is done: source not checked. | Whole body. One knee lifted out to the side of its hip with the lower leg folded, then, inside half a second, that leg straight with the foot high and round in front of the body. |
| Side kick (`side_kick`) | A kick out to the side keeps someone at leg length without stepping in closer. | [Fundamentals][sk], "Yoko-geri"; [Self Defense handout][asu], "Position of attacker determines where you will strike" | The side kick is done by raising the knee, then kicking out to the side. Do not step in closer to use a hand when a kick can reach. | Whole body. One knee lifted and folded, then, inside half a second, that leg straight with the foot off the floor and far out to the side of its hip. |
| Low kick (`low_kick`) | A low, quick kick to the shin is hard to catch, and you can snap your foot straight back. | [Physical Self-Defense Strategies][aaf], "Front Kick"; [Self Defense handout][asu], "Knee" | Kick quickly with the ball of the foot at the knee or shin and pull the foot back with a quick snap. The knee can be kicked without much risk of the foot being caught. | Whole body. One foot flicked forward off the floor to about shin height with the leg kept straight and the knee kept down. A knee lifted first makes it a front kick, not this. |
| Elbow strike (`elbow_strike`) | Too close to swing a fist, your elbow is a hard point that can make room to leave. | [Safer Strikes][pm]; [Self Defense handout][asu], "Use your elbows, knees, and head" | An elbow is a tool for close range, and one of the strikes that spare the hand a bare-knuckle punch puts at risk. Elbows and knees are the body's hard, bony points. | Waist up. One arm folded tight with the elbow lifted to shoulder height, and the elbow itself swung across to the front of the chest. |
| Palm heel strike (`palm_heel`) | The heel of your open hand is sturdier than your knuckles and less likely to get hurt. | [Physical Self-Defense Strategies][aaf], "Palm Heel Strike"; [Safer Strikes][pm] | Use the palm, with the fingers back and the thumb tucked in. A palm strike is very unlikely to break the hand. | Waist up. One hand pushed out fast from a bent arm, ending in front of the body at face height, above the shoulders. The camera cannot tell an open hand from a fist, so the height is what counts. |
| Wrist release (`wrist_release`) | Do not pull back from a wrist grab: fold your elbow in toward their arm instead. | [Self Defense handout][asu], "Wrist Hold" | Instead of pulling back, drop into a strong stance, lean forward and bend the elbow all the way toward the other person's forearm, until they can no longer hold the wrist. | Waist up. One arm held out in front, below shoulder height, for a moment (the grabbed wrist), then the elbow folded forward so the hand comes in to its own shoulder. |
| High block (`high_block`) | A forearm raised level with your forehead takes a blow coming at your head. | [Physical Self-Defense Strategies][aaf], "Roof Block"; [Fundamentals][sk], "Jodan age-uke" | A forearm in line with the forehead protects the head from a strike from the front or from above. The rising block sweeps up a punch aimed high. | Waist up. One forearm lying level across the picture at forehead height, elbow up and out to the side, and the other hand kept below the shoulders. |
| Low block (`low_block`) | An arm swept down and out moves a low kick aside before it reaches you. | [Fundamentals][sk], "Gedan-barai" | The low block stops an attack aimed at the lower body. The fist starts by the ear on the other side, then comes down. | Waist up, down to the hips. One hand brought up to the other shoulder, then swept down and out, ending low and clear of its own hip with the arm straight. |

### Two things changed from the first plan

- **The wrist release folds the elbow in. It does not pull the hand back.** The first idea was a sharp pull of the hand toward the body. The source says the opposite, in so many words, so the move and its detector follow the source.
- **The low kick is the plain kick to the shin from the Asian American Federation page**, where it is called a front kick. The game already has a `front_kick` (knee up, foot out at hip height), so this one has its own name.

### Moves we looked at and left out

| Candidate | Why it is not here |
|---|---|
| Push kick (teep) | Seen from the front it is the game's `front_kick`: knee up, then the foot straight out. One camera cannot tell a push from a snap. |
| Backfist | It is the path of the game's `knife_hand`: the hand goes across the body, then whips out to its own side at head height. The camera cannot see which side of the hand leads. |
| Outside parry | A small sweep of one hand across the face. It is too close to the start of a `hook` and to a hand simply coming up to guard to tell apart with made-up frames. The high block and the low block cover defending with one arm. |

### Where the game's moves also count

The Dojo asks for one move at a time, so these overlaps do not matter there. They are the reason these moves cannot be put into a fight as they are.

- `front_kick` also counts on a roundhouse kick and on a side kick. It checks a lifted knee and then a high, straight leg, not which way the foot went.
- `jab` and `cross` also count on a palm heel strike. They read a fast straight arm anywhere near shoulder height.
- `jab` and `cross` also count at the start of a wrist release if the arm is pushed out fast. Reached out slowly, as a grabbed arm would be, it is not a punch.

The other way round is clean: no extra move counts while any of the game's 26 moves is done right (the test plays every one).

## The styles

These are offered by the Dojo next to the game's five styles. A list may mix the game's moves with the moves above.

| Style | Line | Moves |
|---|---|---|
| Taekwondo kicks (`taekwondo_kicks`) | Kicks first: keep people at leg length, where hands cannot reach. | `front_kick`, `roundhouse_kick`, `side_kick`, `low_kick`, `knee` |
| Self-defense basics (`self_defense`) | Plain moves for getting free and getting away. | `palm_heel`, `elbow_strike`, `knee`, `hammer_fist`, `wrist_release`, `low_kick`, `high_block` |
| Muay Thai (`muay_thai`) | Elbows, knees and low kicks for when someone is close. | `elbow_strike`, `knee`, `low_kick`, `roundhouse_kick`, `front_kick`, `jab`, `cross` |
| Karate basics (`karate_basics`) | High and low blocks with karate kicks and hand strikes. | `reverse_punch`, `knife_hand`, `front_kick`, `side_kick`, `high_block`, `low_block` |

The style names say which art a set of moves is most at home in. They are not a claim that this is how a school of that art teaches them. Which moves each art teaches first: source not checked.

`high_block` and `low_block` are defends, not strikes. They sit in the same list because the Dojo trains every move the same way.

## What a screen needs to show these moves

Everything is exported from `src/coach/extra/index.ts`.

| Export | What it is | How the game's own moves get the same thing |
|---|---|---|
| `EXTRA_MOVES`, `extraMove(id)` | The eight moves, and a lookup by id. | `MOVES` in `src/moves/registry.ts`. `startDojo` and `currentMove` in `src/coach/dojo.ts` take a lookup as their last argument. |
| `EXTRA_STYLES` | The four styles. | `STYLES` in `src/styles/registry.ts`. |
| `EXTRA_GUIDES`, `extraGuideFor(move)` | The looping outline figure and the short instruction. | `guideFor(move)` in `src/coach/guide.ts`, which returns null for these moves. |
| `EXTRA_MEASURES` | What each detector checks, for the live checklist. | `MEASURES` in `src/moves/measures.ts`. Pass `{ ...MEASURES, ...EXTRA_MEASURES }` as the last argument of `liveChecks`. |
| `EXTRA_TIPS`, `judgeExtraRep(move, frames, baseline)` | One tip per move, and `judgeRep` with that tip put in. | `PRACTICE_TIPS` and `judgeRep` in `src/coach/practice.ts`. |
| `EXTRA_NEEDS_LEGS` | The three kicks, which need the legs in view. | `KICK_IDS` in `src/moves/legSignals.ts`. |

Each move's detector is its list of conditions and nothing else: it counts when every condition holds. So the checklist and the detector cannot disagree.

## Sources

The first two were opened and read in full on 15 November 2026. The last two were read on the same day through an automatic summary of the page, not line by line.

1. Asian American Federation, developed with the Center for Anti-Violence Education, *Physical Self-Defense Strategies* (one page). https://www.aafederation.org/wp-content/uploads/2021/09/English-Physical-Self-Defense-One-Pager-1.pdf
2. Albany State University Police Department, *Self Defense: Moves for Getting Out of or Defending Against Common Holds or Attacks*. https://www.asurams.edu/docs/asu-police/forms/S.D..pdf
3. Nihon Karate-do Shotokai (a karate organisation based in Tokyo), *Fundamentals*, sections on blocking and kicking. https://www.shotokai.jp/en_keiko/en_fundamentals/
4. Police Magazine, *Safer Strikes*, by Det. Mike Siegfried, academy instructor with the San Bernardino County Sheriff's Department (5 August 2010). https://www.policemag.com/articles/safer-strikes

## Notes

- Sources 1 and 2 are written for people already under attack, and source 4 for police officers, so they also name the parts of the body to aim at. None of that is used here. We took only their points about keeping distance, covering the head, protecting your own hand, breaking a grip and getting away, and wrote them in our own words. This is the same rule `docs/moves.md` follows.
- We found no source we could check for Taekwondo or Muay Thai technique, so no line here rests on one.
- This is a game, not a self-defense class. The lines point at ideas a real course teaches with a partner and an instructor.

[aaf]: https://www.aafederation.org/wp-content/uploads/2021/09/English-Physical-Self-Defense-One-Pager-1.pdf
[asu]: https://www.asurams.edu/docs/asu-police/forms/S.D..pdf
[sk]: https://www.shotokai.jp/en_keiko/en_fundamentals/
[pm]: https://www.policemag.com/articles/safer-strikes
