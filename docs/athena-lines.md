# Athena's lines

Athena, grey-eyed goddess of war-craft, coaches the player (Odysseus) against Polyphemus in his cave. Short, urgent, in-world.

Each line is one clip at `public/audio/athena/<id>.mp3`, all generated with one ElevenLabs voice. After generating, list the ids that exist in `public/audio/athena/index.json`: the game only requests clips named there, and stays silent for the rest.

The script lives in `src/audio/athenaLines.ts`. This table must match it exactly; `tests/athenaLines.test.ts` fails if they differ. Ids are fixed: clips are named after them.

| id | when it plays | text |
|---|---|---|
| `call_block` | An attack is coming that a block stops | Hands up! Guard your face! |
| `call_duck` | An attack is coming that a duck avoids | Duck! Drop your head! |
| `call_dodge_left` | An attack is coming that a dodge left avoids | Dodge left! Step left! |
| `call_dodge_right` | An attack is coming that a dodge right avoids | Dodge right! Step right! |
| `call_jump` | A low attack is coming that a jump clears | Jump! Feet off the ground! |
| `call_jab` | A weak spot opens for a jab | Jab! Left fist, straight out! |
| `call_cross` | A weak spot opens for a cross | Cross! Right fist, straight through! |
| `call_hook` | A weak spot opens for a left hook | Hook! Swing your left across! |
| `call_overhead_strike` | A weak spot opens for an overhead strike | Right hand high! Chop down! |
| `call_spear_thrust` | A weak spot opens for a spear thrust | Thrust! Both hands, straight forward! |
| `call_stake_thrust` | The finishing move: the stake into the Cyclops's eye | Now! Both hands! Stake his eye! |
| `praise_1` | Your strike lands | Well struck! |
| `praise_2` | Your strike lands | Clean blow! |
| `praise_3` | Your strike lands | He reels! |
| `warn_1` | The Cyclops hits you | Stay sharp! |
| `warn_2` | The Cyclops hits you | Guard yourself! |
| `warn_3` | The Cyclops hits you | Too slow! |
| `phase_1` | The fight enters its second phase: Polyphemus takes up his club | He takes up his club! Watch its swing! |
| `phase_2` | The fight enters its third phase: Polyphemus is blinded and swings wildly | He is blind! He swings wild, stay light! |
| `fight_start` | The fight begins | I am with you, Odysseus. Watch him, and strike when I call. |
| `win` | You win the fight | The Cyclops is beaten! To the ships, Odysseus! |
| `loss` | You lose the fight | Rise, Odysseus. Ithaca still waits for you. |
