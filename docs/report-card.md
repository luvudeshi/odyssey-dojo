# The report card at the end of a fight

`src/lessons/reportCard.ts` turns one fight into a report card: one row per move the fight asked for, with a
grade, points and the one thing to work on. It is pure: it reads the fight's events and returns data. It has no
screen, saves nothing and does not touch the fight's score: the points here are shown, never added.

```ts
reportCard(events, feedback?) // -> ReportCard
```

- `events`: the fight's `CombatEvent` list, the same one `lessonsFrom` reads.
- `feedback` (optional): every per-move feedback result the fight showed, as `{ move, grade, points, tip? }`, in any order.

## What it returns

| Field | What it is |
| --- | --- |
| `moves` | One row per move, weakest first: by grade, then quality, then move id. |
| `grade` | The fight's grade: the rows' grades averaged by times asked. Halfway goes to the lower grade. `null` for a fight that asked for nothing. |
| `points` | The rows' points added up. |
| `best` | The row with the highest grade, then the highest quality, then the first move id. |
| `workOnNext` | The weakest row, `moves[0]`. |
| `workOnLine` | That row as one line: "Hook: keep the elbow bent, level with your shoulder". |

Each row has `moveId`, `name`, `kind`, `asked`, `done`, `quality`, `grade`, `points` and `workOn`.

## How a move is counted

| | Strike | Defend |
| --- | --- | --- |
| `asked` | openings that called for it (`opening`), plus the finishing blow | attacks it should have stopped that ran their course (`defended` plus `playerHit`) |
| `done` | times it landed (`enemyHit`, `finished`) | times it stopped the attack (`defended`) |
| `quality` | the quality of each one landed, a miss counting 0, over the times asked; the finishing blow counts 1 | the share stopped |
| `points` | 150, 100 or 25 for each one landed, by its own quality; 0 for a miss | 100 for each attack stopped; 0 for one that landed |

An attack whose warning was still up when the fight ended is not counted, as in `lessonsFrom`.

## Grades

`GRADE_LINES` holds where each grade starts on the 0 to 1 quality: 0.85 and up is EXCELLENT, 0.6 and up is GREAT,
anything lower is NEEDS IMPROVEMENT. `GRADE_POINTS` holds the points: 150, 100 and 25, the Training Dojo's own.
Both are named constants, so they can be pointed at the per-move grade's lines in one place.

## When the fight kept its per-move feedback

A move that has results in `feedback` takes three things from them in place of the above:

- **points**: its results' points added up;
- **grade**: the grade whose points are nearest to its points per time asked (halfway goes to the lower grade);
- **work on**: the tip its results gave most often (a tie goes to the one met first). If none had a tip, the fixed line below.

Any grade word is accepted in a result; only its points and tip are read. Moves with no results are graded from the events as before.

## The work-on lines

One per move in the registry, strikes and defends, at most 48 characters, with no move name (the row shows it).
`tests/reportCard.test.ts` fails when a registry move has no line, when a line is too long, or when a line is left
behind for a move that is gone. A move that is not in the registry gets "Make the whole move, then back to your guard".

| Move | Id | Kind | Work on |
| --- | --- | --- | --- |
| Aegis push | `aegis_push` | strike | Push both palms out together from your chest |
| Block | `block` | defend | Fists up by your cheeks, elbows tucked in |
| Chain punch | `chain_punch` | strike | Send the second punch right behind the first |
| Cross | `cross` | strike | Turn your hips and drive the right fist out |
| Dodge left | `dodge_left` | defend | Step your feet left, don't just lean |
| Dodge right | `dodge_right` | defend | Step your feet right, don't just lean |
| Double palm | `double_palm` | strike | Keep both palms side by side at chest height |
| Duck | `duck` | defend | Bend your knees to drop, keep your back up |
| Front kick | `front_kick` | strike | Lift the knee first, then snap the foot out |
| Hammer fist | `hammer_fist` | strike | Raise the fist above your head before it drops |
| Hook | `hook` | strike | Keep the elbow bent, level with your shoulder |
| Jab | `jab` | strike | Snap the hand straight back to your chin |
| Jump | `jump` | defend | Hop off both feet and land soft on bent knees |
| Knee strike | `knee` | strike | Drive the knee up high, foot tucked under it |
| Knife hand | `knife_hand` | strike | Chop out flat at neck height, palm down |
| Moon arrow | `moon_arrow` | strike | Hold the front arm level as you draw and loose |
| Overhead strike | `overhead_strike` | strike | Reach the hand high first, then chop right down |
| Reverse punch | `reverse_punch` | strike | Pull the left fist to your hip as you punch |
| Rising palm | `rising_palm` | strike | Drive the palm heel up to chin height |
| Spear thrust | `spear_thrust` | strike | Keep both hands together as you drive forward |
| Stake thrust | `stake_thrust` | strike | Grip at your chest, then drive forward and down |
| Sun burst | `sun_burst` | strike | Hands meet at your chest, then fling arms wide |
| Swift dash | `swift_dash` | strike | Take one quick full step, not a lean |
| Thunderbolt | `thunderbolt` | strike | Hand right over your head, then throw it down |
| Trident sweep | `trident_sweep` | strike | Sweep both arms across together, chest height |
| Uppercut | `uppercut` | strike | Drop the fist to your waist, then punch up |

## Showing it

The result panel does not show the card yet. It needs two things from the lead, both in files only the lead edits:
`App.tsx` passes `reportCard(events)` to the end panel, and the panel draws one row per move (name, grade, points,
the work-on line) under a "Work on this next" line.
