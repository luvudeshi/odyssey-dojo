# Fight length and win rate at every stop

Issues #115 and #127. A judge plays for about three minutes, so this measures how long each stop takes and who wins it.

## How it is measured

`tests/balance/simulate.ts` plays whole fights by calling `startFight` and `step` from `src/combat/engine.ts`, 20 ms at a time. No camera, no clock, no graphics. It is the same method as the simulated player in `tests/pacingStops.test.ts`, with the chance of defending and the chance of landing a strike set apart.

Each player fights each stop 200 times as the Boxer. Fight `n` uses seed `115 + 7919 n`, so the run is the same every time. The simulated players never use a divine power move.

| Player | Defends | Lands the strike | Strike arrives after | Strike quality |
| --- | --- | --- | --- | --- |
| beginner | 1 attack in 2 | 9 openings in 10 | 1.5 s | 0.55 |
| average | 3 in 4 | 9 in 10 | 0.8 s | 0.7 |
| good | 19 in 20 | 97 in 100 | 0.6 s | 0.9 |

To rewrite the tables below after changing a number in `src/enemies/defs/`:

```
UPDATE_BALANCE=1 npx vitest run tests/balance
```

`tests/balance/balance.test.ts` fails if the tables here do not match what the simulation gives.

## The route today

Each cell: fights won / mean length of all 200 fights / mean length of the fights that were won.

<!-- table:now -->
| Stop | beginner | average | good |
| --- | --- | --- | --- |
| Polyphemus | 88% / 91 s / 89 s when won | 100% / 53 s / 53 s when won | 100% / 30 s / 30 s when won |
| Circe | 1% / 77 s / 113 s when won | 78% / 98 s / 99 s when won | 100% / 56 s / 56 s when won |
| The Sirens | 1% / 70 s / 116 s when won | 64% / 97 s / 100 s when won | 100% / 58 s / 58 s when won |
| Scylla | 1% / 55 s / 102 s when won | 45% / 78 s / 82 s when won | 100% / 49 s / 49 s when won |
| Charybdis | 0% / 63 s / none won | 41% / 96 s / 102 s when won | 100% / 61 s / 61 s when won |
| The Suitors | 0% / 65 s / none won | 22% / 99 s / 114 s when won | 100% / 70 s / 70 s when won |
<!-- /table:now -->

## Polyphemus, the first stop (issue #127)

A judge is a first-time player with three minutes, and losing the only fight they play is the worst outcome. So the first stop is tuned to be won. The four targets are assertions in `tests/balance/balance.test.ts`:

| Target | Measured | Holds? |
| --- | --- | --- |
| The beginner wins at least 85% of fights | 88% (175 of 200) | Yes |
| Those wins take 90 s or less | 88.6 s | Yes |
| The average player wins every fight | 100% (200 of 200) | Yes |
| The good player's fight lasts at least 30 s | 30.4 s | Yes |
| Every fight a beginner wins goes through all three phases | 3 of 3 in every won fight, for all three players | Yes |

What changed in `src/enemies/defs/polyphemus.ts`:

| | Before | #126 proposal | Now |
| --- | --- | --- | --- |
| `hp` | 400 | 160 | 162 |
| Club swing, left and right | 7 | 6 | 5 |
| Grasping hand | 8 | 6 | 4 |
| Boulder throw | 10 | 7 | 6 |
| beginner | 2% / 150 s when won | 73% / 82 s when won | 88% / 89 s when won |
| good player's fight | 64 s | 29.5 s | 30.4 s |

Telegraphs, the strike window and the three phases are as they were.

**Why not the #126 proposal as it stood.** It missed two of the targets: the beginner won 73% (85% asked), and the good player was done in 29.5 s (30 s asked).

**The room is narrow, and this is what each number does.** Measured by sweeping `hp` from 140 to 240 and the damage from 6, 6, 6, 7 down to 3, 3, 3, 4:

- `hp` sets the length for everyone. The good player needs `hp` of 162 or more to reach 30 s (29.6 s at 161, 30.4 s at 162).
- Softer attacks raise the beginner's win rate, but also the length of the fights the beginner wins, because the fights that used to be lost late are now long wins. At `hp: 162`: damage 5, 5, 5, 6 gives 86% and 87.9 s; 5, 5, 4, 6 gives 88% and 88.6 s; 4, 4, 5, 6 gives 93% and 90.1 s, which is over.
- So `hp` cannot go above about 163 without the beginner's wins passing 90 s, and cannot go below 162 without the good player dropping under 30 s. Inside that, 5, 5, 4, 6 leaves the most room on both of the beginner's targets while the boulder stays his hardest hit.

The margins are small: 5 fights of 200 on the win rate, 1.4 s on the 90 s, 0.4 s on the 30 s. The run is seeded, so the numbers do not move by themselves, but a change to strike damage or timing in the engine will move them. With a different set of 200 seeds the beginner's wins came out at 88% and 89.5 s.

A player who defends nothing still loses every fight, in about a minute: with no defence there is no opening to strike in (`tests/content.test.ts`).

**What changed in the older tests.** In `tests/content.test.ts`, the lower bound on the fight of the player who gets 85% of prompts right went from 90 s to 40 s (that player now takes about 42 to 59 s, depending on strike quality), and "a player who misses half the prompts loses" became "a player who defends nothing loses". `tests/pacingStops.test.ts` did not change and passes: Polyphemus is still the easiest stop, by more than before.

## The five later stops

Not retuned yet (part 2 of #127, waiting on the stop PRs). Against the numbers above:

| Asked | Holds? |
| --- | --- |
| No stop takes the average player more than 2 minutes | Yes. The longest is Circe at 98 s (99 s when won). |
| The route gets harder stop by stop | Yes, for all three players: fights won and health left never go up from one stop to the next. |
| The average player wins at least 60% at every stop | **No.** Scylla 45%, Charybdis 41%, the Suitors 22%. |
| The beginner's win rate falls stop by stop from Circe | Only just: it is 1% or 0% everywhere after Polyphemus. |
