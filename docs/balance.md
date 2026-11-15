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
| Polyphemus | 88% / 95 s / 93 s when won | 100% / 58 s / 58 s when won | 100% / 35 s / 35 s when won |
| Circe | 7% / 116 s / 146 s when won | 95% / 109 s / 108 s when won | 100% / 61 s / 61 s when won |
| The Sirens | 3% / 101 s / 140 s when won | 91% / 110 s / 109 s when won | 100% / 62 s / 62 s when won |
| Scylla | 2% / 80 s / 120 s when won | 85% / 93 s / 93 s when won | 100% / 54 s / 54 s when won |
| Charybdis | 1% / 93 s / 148 s when won | 82% / 115 s / 115 s when won | 100% / 66 s / 66 s when won |
| The Suitors | 1% / 91 s / 160 s when won | 69% / 114 s / 116 s when won | 100% / 68 s / 68 s when won |
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

## The five later stops (issue #127, part 2)

Before this retune the average player won under half the fights from Scylla on (45%, 41%, 22%). The four targets are assertions in `tests/balance/balance.test.ts`:

| Target | Measured | Room |
| --- | --- | --- |
| The average player wins at least 60% at every stop | Circe 95% (190 of 200), the Sirens 91% (182), Scylla 85% (169), Charybdis 82% (164), the Suitors 69% (138) | 9 points at the Suitors, the lowest |
| From Circe on, no stop is easier for the beginner than the one before | 13, 6, 4, 2 and 1 fights won of 200 | It falls at every stop |
| No stop takes the average player more than 2 minutes | The longest is Charybdis at 110 s (111 s when won); the Suitors take 109 s (111 s when won) | 9 s |
| The route gets harder stop by stop | For all three players, fights won and health left never go up. The average player ends with 80, 49, 41, 35, 30 and 22 health of 100 | See below |

What changed in `src/enemies/defs/`. Only `damage`, and `hp` at the Suitors. Telegraphs, strike windows, phases and weak spots are as they were.

| Stop | `hp` before | `hp` now | Damage before | Damage now |
| --- | --- | --- | --- | --- |
| Circe | 360 | 360 | wand 9, cup 10, spell 13 | wand 6, cup 6, spell 10 |
| The Sirens | 370 | 370 | song 12, swoop 9, talons 11 | song 8, swoop 6, talons 7 |
| Scylla | 360 | 360 | head strike 12, lunge 14, snap 14 | head strike 8, lunge 9, snap 10 |
| Charybdis | 440 | 440 | wave 10, spout 12, undertow 14 | wave 6, spout 8, undertow 11 |
| The Suitors | 520 | 460 | spear 11, ox-hoof 10, sword rush 15 | spear 8, ox-hoof 6, sword rush 11 |

**How the numbers were chosen.** A search script tried every damage set up to 5 points under the old one at each stop (left and right attacks kept equal, no attack cut more than 1 point more than another, the hardest hit still the hardest), with a few values of `hp`, and measured each with `tests/balance/simulate.ts` and with the player of `tests/pacingStops.test.ts`. From those it took the chain of five stops with the smallest total change that met every target with room to spare: at least 63% for the average player, 5 s under the 2 minutes, 4 fights of 200 fewer won at each stop than the one before, and more than the tests ask on every health step.

**Why Circe changed although she already met 60%.** `tests/pacingStops.test.ts` asks that its player (85% of prompts right) ends each stop with at least 2 points less health than the stop before. A Suitors fight that the average player wins 63% of the time leaves that player about 48 health. Four steps of 2 or more above that put Circe at 56 or higher, and she stood at 52. So the whole ladder moves up, Circe with it. That player now ends with 89, 69, 64, 59, 56 and 52 health (the smallest step is 3.0) and wins 30, 30, 30, 30, 29 and 28 fights of 30.

**Why the Suitors lost health.** With `hp: 520` and damage soft enough for 63%, the fights the average player wins take about 125 s, which is over. At 460 they take 111 s. The Suitors still have the most health on the route.

**What each number does**, for the next retune:

- `damage` sets who wins and hardly moves the length of a won fight. At the Suitors, one point off every attack is worth about 10 points of win rate for the average player.
- `hp` sets the length for everyone: at the Suitors, 10 health is about 2 s for the average player.
- From Circe on, the good player's health left falls by 0.8 to 1.1 points per stop; the test asks for more than 0.5. This is the tightest step on the route, between the Sirens (93.7) and Scylla (92.9).

The run is seeded, so the numbers do not move by themselves. With three other sets of 200 seeds the average player won 133 to 147 fights at the Suitors (66% to 74%), the order of the stops held for the average player, and the average player's fight lengths moved by 2 s at most.

**What the beginner sees after Polyphemus.** The beginner wins 88% at the first stop and 7% at Circe. That drop is what was asked: the first stop is tuned to be won by someone who has never played, and the route after it is for a player who has learned to defend.

**What changed in the older tests.** Nothing. `tests/pacingStops.test.ts` and `tests/content.test.ts` pass as they were.
