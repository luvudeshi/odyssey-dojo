# Defence progress

The game teaches self-defense, so the progress a player sees should say what they defended, not only what
they hit. This is a panel for the Account screen, a line for the result screen, and the numbers behind both.

- `src/lessons/defense.ts`: the numbers. Pure, no screen, no storage.
- `src/lessons/defenseStore.ts`: the saved history, in this browser only.
- `src/account/ui/DefensePanel.tsx` and `defensePanel.css`: the panel and the one-line version.
- `tests/defenseProgress.test.ts`: the rules below, one by one, and one real Polyphemus fight.

The panel is not on a screen yet. The screens are the lead's; the mount is described at the end.

## What is saved

One small record per fight, under the key `odyssey-dojo.defense` in localStorage. It is a list, oldest first,
of at most 50 fights; the oldest drops off when the 51st is added. The profile (`odyssey-dojo.profile`) is not
read or changed, and nothing here is sent to a server.

| Field | Meaning |
|---|---|
| `at` | When the fight ended, in milliseconds since 1970. |
| `enemyId` | The stop fought. |
| `seen` | Attacks that ran their course: defended plus landed. |
| `defended` | Attacks stopped by the right defence. |
| `hits` | Attacks that landed. Always `seen - defended`. |
| `longestRun` | Most attacks in a row defended with none landing in between. |
| `kinds` | `seen` and `defended` for each defend move an attack asked for: `block`, `duck`, `dodge_left`, `dodge_right` (and `jump`, if a monster ever asks for it). |

The record is built from the fight's combat events: every `defended` and every `playerHit` is one attack, and
its kind is the attack's `counter`. An attack whose warning is still up when the fight ends is not counted, the
same rule `lessonsFrom` uses. A fight in which no attack ran its course leaves no record.

When the list is read back, every field is checked. The totals are added up again from `kinds`, so a record
cannot disagree with itself, and a record that makes no sense is dropped.

There is no reaction time. The combat events carry no clock, so it cannot be worked out from them.

## The numbers on the panel

All of them are over the saved fights (at most the last 50), except the trend.

| Number | Rule |
|---|---|
| **Defended X of Y** | X is every attack defended, Y every attack seen. The percentage under it is X / Y. |
| **A bar per kind** | For block, duck, dodge left and dodge right: defended / seen of the attacks that asked for that defence. The four are always listed; a kind that has not come up says "none yet". Any other kind is listed after them once it comes up. |
| **Trend** | One small bar for each of the last five fights, oldest on the left: that fight's defended / seen. Empty slots are dashed. |
| **Getting better / slipping / holding** | The newest fight's rate against the average of the other fights in the trend. 5 points or more above is "getting better", 5 or more below is "slipping", in between is "holding". Not shown with one fight. |
| **Best run without a hit** | The longest `longestRun` of any saved fight. A run does not carry over from one fight to the next. |
| **Practise next** | The weakest kind, named with its count and pointing at the Training Dojo. The move id to train is in `practiseNext.moveId` (and on the line as `data-move`). |

**The weakest kind** is the one with the lowest rate among the kinds that came up at least 3 times and let at
least one attack through. On a tie it is the kind that came up more often, then the one listed first (block,
duck, dodge left, dodge right). If no kind qualifies there is no weakest: the line then says that nothing got
through, or that no one defence stands out yet.

## Levels

A player holds the highest level whose three lines are all met.

| Level | Defence rate | Fights | Attacks seen |
|---|---|---|---|
| Novice | any | any | any |
| Guarded | at least 50% | 1 | 10 |
| Steady | at least 70% | 3 | 10 |
| Unshakeable | at least 85% | 5 | 10 |

So a perfect first fight makes a player Guarded, not Unshakeable: the higher levels need the rate held over
more fights. The rate is over all saved fights, so one bad fight lowers it a little and does not reset it.
These thresholds are first guesses and have not been tried on players.

## The mount (lead files, not in this change)

1. `FightScreen` keeps the fight's events and passes them to `renderEnd` as a fifth argument.
2. `App` calls `recordDefense(events, enemy.id)` where it calls `recordFight`, inside the same "once per seed"
   check, and hands `lessonsFrom(events)` to the result panel.
3. `EndPanel` draws `<DefenseLine>` under its title; the CSS puts it above the score chip.
4. `Account` draws `<DefensePanel progress={defenseProgress(useDefenseHistory())} />` in a box with the class
   `acc-defense` (placed by `defensePanel.css`: the back wall between the two columns, where the bow and the
   helmet are now).

The panel is about 255 px tall at 360 px wide, and no text in it is under 18 px.

## Not done

- Fights played as the guest of a room, the Muse's fight and the Training Dojo do not add records.
- The history is not part of the account that syncs to a server; it stays in the browser it was played in.
- The "practise next" line names the move but does not open the Training Dojo on it.
