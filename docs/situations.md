# What each enemy attack stands for

Every attack of every enemy in `src/enemies/defs/` has a line in `src/enemies/situations.ts`: at most 60 characters on what a person might really face, written to fit the move that answers it in the game. An attack you duck is something at head height. An attack you block is something too close to step away from. An attack you dodge is something you step off the line of. `tests/situations.test.ts` fails if an attack has no line, a line that is too long, a line for an attack that no longer exists, or a line that differs from its row below.

The lines are calm on purpose. The game is for all ages, and the point of each line is what to notice and where to move, not what could go wrong.

**How these lines are sourced.** Each line is our own wording. No source was opened again for this file. The "What the source says" column repeats only what [docs/moves.md](moves.md) already records each source as saying (that file's sources were opened and read on 14 November 2026), so this file relies on that record. The full titles and URLs are listed in `docs/moves.md` under "Sources" and linked again at the bottom here. Where a source covers something nearby but not the same thing, the Note column says so.

**Not every attack has a real match.** A Siren's song, Circe's spell and a whirlpool are not things a person meets on the street, and we did not invent an assault to stand for them. Those rows carry a general lesson that fits the counter, and the Note column marks each one as a general lesson.

Get the line for an attack with `situationFor(enemyId, attackId)`; it gives `null` for a pair it does not know.

## Polyphemus (`polyphemus`)

| Attack | Counter | Line | Source checked | What the source says | Note |
|---|---|---|---|---|---|
| Club swing (`club_left`) | `dodge_right` | A wide swing from the side | [England Boxing Coaching Handbook, Part 1][eb], p. 77 "The lead hand hook" and p. 79 "The importance of lateral movement" | A hook arrives from outside the defender's field of vision. Defences built on footwork should step sideways off the path of the attack. | The source covers a swung punch, not a swung object; the line keeps to "a swing". |
| Club swing (`club_right`) | `dodge_left` | A wide swing from the side | [England Boxing Coaching Handbook, Part 1][eb], p. 77 "The lead hand hook" and p. 79 "The importance of lateral movement" | Same passages as the row above. | Same line as the other side: the situation is the same, only the direction you step changes. |
| Grasping hand (`grab`) | `block` | Someone grabs for you | [Physical Self-Defense Strategies][aaf], "Safety Stance"; [Staying Safe][hpd], "When Physical Defense is Necessary" | Hands up with open palms, at least an arm's length from the other person, backing away. Shift your weight to break free of a grab. | A real situation. The game's block is hands held high; the sources describe hands up to keep a reaching person off, and breaking free if held. |
| Boulder throw (`boulder`) | `duck` | Something thrown at your head | [England Boxing Coaching Handbook, Part 1][eb], p. 84 "The duck" | Bend at the knees, not the waist, with hands up and eyes on the other person the whole time. | The source covers ducking a punch, not a thrown object; the line applies the same movement to something coming at head height. |

## Circe (`circe`)

| Attack | Counter | Line | Source checked | What the source says | Note |
|---|---|---|---|---|---|
| Wand stroke (`wand_left`) | `dodge_right` | Someone swings at you with something in their hand | [England Boxing Coaching Handbook, Part 1][eb], p. 79 "The importance of lateral movement" and "Principles of defence" | Defences built on footwork should step sideways off the path of the attack. Someone who keeps moving is far harder to reach. | The source covers an empty-handed punch, not a held object; the line applies the same step off the path. |
| Wand stroke (`wand_right`) | `dodge_left` | Someone swings at you with something in their hand | [England Boxing Coaching Handbook, Part 1][eb], p. 79 "The importance of lateral movement" and "Principles of defence" | Same passages as the row above. | Same line as the other side. |
| Flung cup (`cup`) | `duck` | A cup or bottle thrown your way | [England Boxing Coaching Handbook, Part 1][eb], p. 84 "The duck" | Bend at the knees, not the waist, with hands up and eyes on the other person the whole time. | The source covers ducking a punch, not a thrown object. In the poem the cup is a drugged drink, not a missile; the line follows the game's attack, which is thrown. |
| Spell of swine (`spell`) | `block` | Pressure with words, not hands: keep your guard up | [Physical Self-Defense Strategies][aaf], "Safety Stance"; [Safety Tips][mu] | Hands up with open palms, at least an arm's length from the other person, backing away. Keep your distance and tell the person to get back. | **General lesson, not a real situation.** A spell has no real match. The line names the nearest truthful idea: a threat is not always a blow, and hands up at a distance is the answer the sources give before anything physical. |

## The Sirens (`sirens`)

| Attack | Counter | Line | Source checked | What the source says | Note |
|---|---|---|---|---|---|
| The song (`song`) | `block` | Being talked into staying: keep your guard, keep moving | [Staying Safe][hpd], "When Physical Defense is Necessary"; [Safety Tips][mu] | Getting away, not winning a fight, is the aim. When a way out opens, run to a safe place with people in it. | **General lesson, not a real situation.** A song has no real match. In the poem the danger is stopping to listen, so the line is about not being held in place by talk. The sources cover leaving, not persuasion. |
| Swoop (`swoop_left`) | `dodge_right` | Someone rushes at you from one side | [England Boxing Coaching Handbook, Part 1][eb], p. 79 "Principles of defence" and "The importance of lateral movement" | Someone who keeps moving is far harder to reach, and the feet are what carry you out of range. Step sideways off the path of the attack. | A real situation. |
| Swoop (`swoop_right`) | `dodge_left` | Someone rushes at you from one side | [England Boxing Coaching Handbook, Part 1][eb], p. 79 "Principles of defence" and "The importance of lateral movement" | Same passages as the row above. | Same line as the other side. |
| Talon dive (`talons`) | `duck` | A grab or a swipe at head height | [England Boxing Coaching Handbook, Part 1][eb], p. 84 "The duck" | Bend at the knees, not the waist, with hands up and eyes on the other person the whole time. | The source covers ducking a punch; the line applies the same movement to a hand reaching high. |

## Scylla (`scylla`)

| Attack | Counter | Line | Source checked | What the source says | Note |
|---|---|---|---|---|---|
| Head strike (`head_left`) | `dodge_right` | A sudden lunge at you from one side | [England Boxing Coaching Handbook, Part 1][eb], p. 79 "The importance of lateral movement"; [Staying Safe][hpd], "When Physical Defense is Necessary" | Step sideways off the path of the attack instead of always moving in straight lines. Getting away, not winning a fight, is the aim. | A real situation. |
| Head strike (`head_right`) | `dodge_left` | A sudden lunge at you from one side | [England Boxing Coaching Handbook, Part 1][eb], p. 79 "The importance of lateral movement"; [Staying Safe][hpd], "When Physical Defense is Necessary" | Same passages as the row above. | Same line as the other side. |
| Lunge (`head_high`) | `duck` | A fast swing at head height | [England Boxing Coaching Handbook, Part 1][eb], p. 84 "The duck" | Bend at the knees, not the waist, with hands up and eyes on the other person the whole time. | A real situation: this is what the source's duck is for. |
| Snap (`head_center`) | `block` | A strike from close in, too near to step away from | [England Boxing Coaching Handbook, Part 1][eb], p. 67 "Guard"; [Physical Self-Defense Strategies][aaf], "Roof Block" | A sound guard protects the target area, and hands held too low leave the chin open. A raised forearm block protects the head. | A real situation. |

## Charybdis (`charybdis`)

| Attack | Counter | Line | Source checked | What the source says | Note |
|---|---|---|---|---|---|
| Breaking wave (`surge_left`) | `dodge_right` | Something big coming straight at you: step aside | [England Boxing Coaching Handbook, Part 1][eb], p. 79 "The importance of lateral movement" | Defences built on footwork should step sideways off the path of the attack instead of always moving in straight lines. | **General lesson, not a real situation.** A whirlpool's wave has no real match. The line keeps only the idea the source gives: get off the path, do not back straight up. |
| Breaking wave (`surge_right`) | `dodge_left` | Something big coming straight at you: step aside | [England Boxing Coaching Handbook, Part 1][eb], p. 79 "The importance of lateral movement" | Same passage as the row above. | **General lesson, not a real situation.** Same line as the other side. |
| Spout (`spout`) | `duck` | Something flying at head height: drop under it | [England Boxing Coaching Handbook, Part 1][eb], p. 84 "The duck" | Bend at the knees, not the waist, with hands up and eyes on the other person the whole time. | **General lesson, not a real situation.** A spout of water has no real match. The source covers ducking a punch; the line applies the same movement to anything at head height. |
| Undertow (`undertow`) | `block` | Being pulled off balance: set your feet, guard up | [Self Defense handout][asu], "Wrist Hold" and "Leverage your weight"; [The Mechanics of the Reverse Punch][yk] | Drop into a strong stance and lean in to break a hold; using your weight works whatever your size. Knees slightly bent lower the body and steady it. | **General lesson, not a real situation.** The pull of water has no real match. The line names the nearest truthful idea, a steady base when something drags at you. The sources cover a person's hold and a punching stance, not water. |

## The Suitors (`suitors`)

| Attack | Counter | Line | Source checked | What the source says | Note |
|---|---|---|---|---|---|
| Thrown spear (`spear_left`) | `dodge_right` | Something thrown straight at you | [England Boxing Coaching Handbook, Part 1][eb], p. 79 "The importance of lateral movement" and "Principles of defence" | Step sideways off the path of the attack. Someone who keeps moving is far harder to reach. | The source covers a punch, not a thrown object; the line applies the same step off the line. |
| Thrown spear (`spear_right`) | `dodge_left` | Something thrown straight at you | [England Boxing Coaching Handbook, Part 1][eb], p. 79 "The importance of lateral movement" and "Principles of defence" | Same passages as the row above. | Same line as the other side. |
| Flung ox-hoof (`ox_hoof`) | `duck` | An object flung at your head from across a room | [England Boxing Coaching Handbook, Part 1][eb], p. 84 "The duck" | Bend at the knees, not the waist, with hands up and eyes on the other person the whole time. | The source covers ducking a punch, not a thrown object. In the poem (Book 20) Odysseus gets out of the way of the thrown ox-hoof by moving his head. |
| Sword rush (`sword_rush`) | `block` | Someone charges at you with no room to step away | [England Boxing Coaching Handbook, Part 1][eb], p. 67 "Guard" and p. 73 "The straight lead hand"; [Physical Self-Defense Strategies][aaf], "Roof Block" | A sound guard protects the target area. A straight hand from the front holds up someone rushing in. A raised forearm block protects the head. | A real situation, with the sword left out on purpose: no source recorded in `docs/moves.md` covers a blade, and the line makes no claim about one. |

## Notes

- Six of the 24 lines are general lessons and are marked so above: Circe's spell, the Sirens' song, and all four of Charybdis's attacks (the two waves share one line). Every other line names something a person could really meet.
- Left and right versions of an attack share a line. The situation is the same; only the side you step to changes, and the prompt card already shows that.
- The lines never name a weapon. A club, a wand and a spear become "a swing", "something in their hand" and "something thrown". None of the sources recorded in `docs/moves.md` covers a weapon, so no line claims a way to deal with one.
- Most rows lean on the boxing handbook, which is about punches between two boxers. Where the game's attack is a thrown thing or a rush from a monster, the Note column says the source covers the movement (duck, step aside, guard), not that exact threat.
- This is a game, not a self-defense class. See the safety note in [docs/moves.md](moves.md).

## Sources

The same list as `docs/moves.md`, by the number used there. Only the ones cited above are repeated.

1. England Boxing, *Boxing Coaching Handbook, Part 1*, section 4.4 "Boxing Techniques and Skills". https://www.englandboxing.org/wp-content/uploads/2022/03/EB_Boxing-Coaching-Handbook-Part-1_v8-002.pdf
2. Asian American Federation, developed with the Center for Anti-Violence Education, *Physical Self-Defense Strategies* (one page). https://www.aafederation.org/wp-content/uploads/2021/09/English-Physical-Self-Defense-One-Pager-1.pdf
3. Marquette University Police Department, *Safety Tips*. https://www.marquette.edu/university-safety/guides/safety-tips.php
4. City of Hialeah Police Department, *Staying Safe: Tips to Protect Yourself at Home, on the Road, and In Public*. https://www.hialeahfl.gov/844/Personal-Safety-Self-Defense
5. Albany State University Police Department, *Self Defense: Moves for Getting Out of or Defending Against Common Holds or Attacks*. https://www.asurams.edu/docs/asu-police/forms/S.D..pdf
9. Yoshukai Karate International, *The Mechanics of the Reverse Punch: Platform, Delivery, Power*, essay by Ricky Copeland, Kyoshi (5 April 2025). https://www.yoshukai.org/?p=3034

[eb]: https://www.englandboxing.org/wp-content/uploads/2022/03/EB_Boxing-Coaching-Handbook-Part-1_v8-002.pdf
[aaf]: https://www.aafederation.org/wp-content/uploads/2021/09/English-Physical-Self-Defense-One-Pager-1.pdf
[mu]: https://www.marquette.edu/university-safety/guides/safety-tips.php
[hpd]: https://www.hialeahfl.gov/844/Personal-Safety-Self-Defense
[asu]: https://www.asurams.edu/docs/asu-police/forms/S.D..pdf
[yk]: https://www.yoshukai.org/?p=3034
