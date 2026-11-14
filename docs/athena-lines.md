# Athena's lines

Athena, grey-eyed goddess of war-craft, coaches the player (Odysseus) against Polyphemus in his cave, and against the monsters after him. Short, urgent, in-world.

Each line is one clip at `public/audio/athena/<id>.mp3`, all generated with one ElevenLabs voice. After generating, list the ids that exist in `public/audio/athena/index.json`: the game only requests clips named there, and stays silent for the rest.

Lines are short on purpose. A call must fit inside the fastest telegraph (1.1 s), so it is 2 to 4 words with the action first; only the finishing call is longer. Praise and warnings are 2 words. The calls, praise, warnings, `fight_start`, `win` and `loss` play against every enemy, so they never name one; only `call_stake_thrust`, `phase_1` and `phase_2` belong to Polyphemus.

The script lives in `src/audio/athenaLines.ts`. This table must match it exactly; `tests/athenaLines.test.ts` fails if they differ. Ids are fixed: clips are named after them.

| id | when it plays | text |
|---|---|---|
| `call_block` | An attack is coming that a block stops | Hands up! Guard! |
| `call_duck` | An attack is coming that a duck avoids | Duck! Head down! |
| `call_dodge_left` | An attack is coming that a dodge left avoids | Dodge left! |
| `call_dodge_right` | An attack is coming that a dodge right avoids | Dodge right! |
| `call_jump` | A low attack is coming that a jump clears | Jump! Feet up! |
| `call_jab` | A weak spot opens for a jab | Jab! Left fist! |
| `call_cross` | A weak spot opens for a cross | Cross! Right fist! |
| `call_hook` | A weak spot opens for a left hook | Left hook! Swing! |
| `call_overhead_strike` | A weak spot opens for an overhead strike | Right hand high! Chop! |
| `call_spear_thrust` | A weak spot opens for a spear thrust | Thrust! Both hands! |
| `call_stake_thrust` | The finishing move: the stake into the Cyclops's eye | Now! Both hands! Stake his eye! |
| `praise_1` | Your strike lands | Well struck! |
| `praise_2` | Your strike lands | Clean blow! |
| `praise_3` | Your strike lands | Fine hit! |
| `warn_1` | The enemy hits you | Stay sharp! |
| `warn_2` | The enemy hits you | Guard yourself! |
| `warn_3` | The enemy hits you | Too slow! |
| `phase_1` | The fight enters its second phase: Polyphemus takes up his club | He takes his club! |
| `phase_2` | The fight enters its third phase: Polyphemus is blinded and swings wildly | He is blind! Stay light! |
| `fight_start` | The fight begins | I am with you, Odysseus! |
| `win` | You win the fight | The monster falls! Onward, Odysseus! |
| `loss` | You lose the fight | Rise, Odysseus. Ithaca still waits for you. |
