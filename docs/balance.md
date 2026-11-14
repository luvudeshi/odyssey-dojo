# Fight length and win rate at every stop

Issue #115. A judge plays for about three minutes, so this measures how long each stop takes and who wins it.

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
| Polyphemus | 2% / 101 s / 150 s when won | 84% / 115 s / 116 s when won | 100% / 64 s / 64 s when won |
| Circe | 1% / 77 s / 113 s when won | 78% / 98 s / 99 s when won | 100% / 56 s / 56 s when won |
| The Sirens | 1% / 70 s / 116 s when won | 64% / 97 s / 100 s when won | 100% / 58 s / 58 s when won |
| Scylla | 1% / 55 s / 102 s when won | 45% / 78 s / 82 s when won | 100% / 49 s / 49 s when won |
| Charybdis | 0% / 63 s / none won | 41% / 96 s / 102 s when won | 100% / 61 s / 61 s when won |
| The Suitors | 0% / 65 s / none won | 22% / 99 s / 114 s when won | 100% / 70 s / 70 s when won |
<!-- /table:now -->

What #115 asks for, against these numbers:

| Asked | Holds? |
| --- | --- |
| No stop takes the average player more than 2 minutes | Yes. The longest is Polyphemus at 115 s (116 s when won). |
| The route gets harder stop by stop | Yes, for all three players: fights won and health left never go up from one stop to the next. |
| The beginner wins Polyphemus most of the time in under 90 seconds | **No.** The beginner wins 2% of the time, and those wins take 150 s. See NEEDS below. |

No number in `src/enemies/defs/` was changed. The two goals that can hold already do, and the third cannot be reached by any change the existing tests allow.

Also worth knowing, though #115 does not ask about it: the average player wins less than half the time from Scylla on, and about one fight in five against the Suitors.

## NEEDS: the beginner cannot win Polyphemus in under 90 seconds while the 90 second floor stands

For the lead (toyeshhm). This needs a change to `tests/content.test.ts`, which this task may not edit.

**The two rules that cannot both hold**

- #115: the beginner (defends half the attacks, strikes late) wins Polyphemus most of the time in under 90 seconds.
- `tests/content.test.ts`, in "Polyphemus: a player who gets most prompts right wins in 90 to 150 seconds" and "Polyphemus: the fight stays in range however well the strikes are thrown": a player who gets 85% of prompts right and strikes after 0.8 s must take **at least 90 seconds** on average, even at strike quality 1.

That 85% player defends more, strikes sooner and hits harder than any beginner, so the beginner is always slower than they are. If they need 90 seconds, the beginner needs more. Today the 85% player with perfect strikes takes 92 s, so Polyphemus's health cannot come down at all, and the beginner's rare wins take 150 s.

Lowering only his damage does not help either. At `hp: 400` the beginner needs about 190 s to get through his health, so softer attacks only make a longer fight: with damage 3, 3, 4, 5 the beginner wins 29% of the time and those wins take 189 s; with 2, 2, 2, 3 the beginner wins 93% but takes 213 s, and "a player who misses half the prompts loses" in `tests/content.test.ts` breaks (9 wins of 30, the limit is 6).

**The numbers that would meet #115**

In `src/enemies/defs/polyphemus.ts`: `hp: 400` to `hp: 160`, and attack damage from 7, 7, 8, 10 to 6, 6, 6, 7 (club_left, club_right, grab, boulder). Nothing else changes. With those numbers:

<!-- table:proposed -->
| Stop | beginner | average | good | pinned |
| --- | --- | --- | --- | --- |
| Polyphemus | 73% / 85 s / 82 s when won | 100% / 53 s / 53 s when won | 100% / 29 s / 29 s when won | 100% / 42 s / 42 s when won |
<!-- /table:proposed -->

("pinned" is the 85% player of `tests/content.test.ts` at strike quality 1.)

**What would have to change in the existing tests**

Only the lower bound in the two Polyphemus pacing tests of `tests/content.test.ts`: each `toBeGreaterThanOrEqual(90)` would become `toBeGreaterThanOrEqual(40)`. With the proposed numbers that test's own player averages 53 s at quality 0.7, 58 s at 0.55 and about 42 s at 1. The comment at the top of `polyphemus.ts` ("90 to 150 seconds") would change with it.

Every other test was run with the proposed numbers in place and still passes, including "a player who misses half the prompts loses" (5 wins of 30, the limit is 6) and the route order in `tests/pacingStops.test.ts`. That limit is close: a Polyphemus any softer than this breaks it.

The cost is a first fight of under a minute for a player who already knows the moves. `tests/balance/balance.test.ts` keeps this proposal checked, so the table above stays true until the lead decides.
