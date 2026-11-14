# What each move teaches

Every move in `src/moves/defs/` carries a `teaches` line: one sentence, at most 90 characters, on what the move is for in a real situation. The lines are about protecting yourself and getting away, not about hurting anyone. `tests/teaches.test.ts` fails if a move has no line or a line that is too long.

Each line is our own wording, checked against the source next to it. The sources were opened and read on 14 November 2026; their full titles and URLs are listed under the table.

| Move | `teaches` | Source checked | What the source says |
|---|---|---|---|
| Block (`block`) | Hands high protects your head while you look for a way out | [England Boxing Coaching Handbook, Part 1][eb], p. 67 "Guard"; [Physical Self-Defense Strategies][aaf], "Roof Block" | A sound guard protects the target area, and hands held too low leave the chin open. A raised forearm block protects the head. |
| Jab (`jab`) | A quick lead hand keeps someone at arm's length so they cannot crowd you | [England Boxing Coaching Handbook, Part 1][eb], p. 73 "The straight lead hand" | It is the range finder and a key part of defence: it stops a rushing opponent from getting set. |
| Cross (`cross`) | Strength comes from your feet and hips, not your arm, so stay balanced and ready to move | [England Boxing Coaching Handbook, Part 1][eb], p. 72 "Principles of punching" and p. 75 "The straight rear hand" | The body drives the punch from the floor through the hips. A good base and balance are essential, and an "arm punch" is listed as an error. |
| Hook (`hook`) | Swings come from the side, out of view, so always bring your hand back to your face | [England Boxing Coaching Handbook, Part 1][eb], p. 77 "The lead hand hook" and p. 67 "Guard" | A hook arrives from outside the defender's field of vision. The hand returns to guard afterwards, and hands held away from the face leave an opening for a hook. |
| Duck (`duck`) | Bend your knees, not your waist, to drop under a swing and still see what is coming | [England Boxing Coaching Handbook, Part 1][eb], p. 84 "The duck" | Bend at the knees, not the waist, with hands up and eyes on the other person the whole time. |
| Dodge left (`dodge_left`) | Step off the line of a rush: a moving target is hard to reach and free to get away | [England Boxing Coaching Handbook, Part 1][eb], p. 79 "Principles of defence"; [Safety Tips][mu] | A moving target is much harder to hit, and footwork takes you out of the direct line of attack. When a way out opens, run to a safe place with people in it. |
| Dodge right (`dodge_right`) | Moving sideways, not straight back, takes you out of reach and toward an exit | [England Boxing Coaching Handbook, Part 1][eb], p. 79 "The importance of lateral movement"; [Staying Safe][hpd], "When Physical Defense is Necessary" | Move sideways out of the line of attack instead of always in straight lines. The goal is to get away, not to fight. |
| Overhead strike (`overhead_strike`) | The padded bottom of your fist protects your hand if you must strike to break away | [Safer Strikes][pm]; [Staying Safe][hpd], "When Physical Defense is Necessary" | The "bottom fist" (hammer fist) lands with the fleshy base of a closed fist and is taught as a safer alternative to hitting with the knuckles. Escape rather than engage. |
| Spear thrust (`spear_thrust`) | Two open hands out front keep someone at arm's length while you back away | [Physical Self-Defense Strategies][aaf], "Safety Stance"; [Safety Tips][mu] | Hands up with open palms, at least an arm's length from the other person, backing away. Keep your distance and tell the person to get back. |
| Stake thrust (`stake_thrust`) | Use your body weight, not just arm strength, to break a grip and get free | [Self Defense handout][asu], "Wrist Hold" and "Leverage your weight"; [Staying Safe][hpd], "When Physical Defense is Necessary" | Drop into a strong stance and lean in to break a hold; using your weight works whatever your size. Shift your weight to break free of a grab. |

## Sources

1. England Boxing (the national governing body for amateur boxing in England), *Boxing Coaching Handbook, Part 1*, section 4.4 "Boxing Techniques and Skills". https://www.englandboxing.org/wp-content/uploads/2022/03/EB_Boxing-Coaching-Handbook-Part-1_v8-002.pdf
2. Asian American Federation, developed with the Center for Anti-Violence Education, *Physical Self-Defense Strategies* (one page). https://www.aafederation.org/wp-content/uploads/2021/09/English-Physical-Self-Defense-One-Pager-1.pdf
3. Marquette University Police Department, *Safety Tips*. https://www.marquette.edu/university-safety/guides/safety-tips.php
4. City of Hialeah Police Department, *Staying Safe: Tips to Protect Yourself at Home, on the Road, and In Public*. https://www.hialeahfl.gov/844/Personal-Safety-Self-Defense
5. Mike Siegfried (detective and academy instructor, San Bernardino County Sheriff's Department), "Safer Strikes", *Police Magazine*, 5 August 2010. https://www.policemag.com/articles/safer-strikes
6. Albany State University Police Department, *Self Defense: Moves for Getting Out of or Defending Against Common Holds or Attacks*. https://www.asurams.edu/docs/asu-police/forms/S.D..pdf

## Notes

- Sources 5 and 6 are written for police officers and for people already under attack, so their tone is harsher than ours. We took only the mechanics from them (which part of the hand is safest to hit with, how body weight breaks a hold) and kept our own wording about getting away.
- The spear thrust, overhead strike and stake thrust are stage moves with a spear and a stake. Their lines name the nearest real idea: hands out to hold distance, a hammer fist, and body weight against a grip. They do not claim the game's motion is a taught technique.
- This is a game, not a self-defense class. The lines point at ideas a real course teaches with a partner and an instructor.

[eb]: https://www.englandboxing.org/wp-content/uploads/2022/03/EB_Boxing-Coaching-Handbook-Part-1_v8-002.pdf
[aaf]: https://www.aafederation.org/wp-content/uploads/2021/09/English-Physical-Self-Defense-One-Pager-1.pdf
[mu]: https://www.marquette.edu/university-safety/guides/safety-tips.php
[hpd]: https://www.hialeahfl.gov/844/Personal-Safety-Self-Defense
[pm]: https://www.policemag.com/articles/safer-strikes
[asu]: https://www.asurams.edu/docs/asu-police/forms/S.D..pdf
