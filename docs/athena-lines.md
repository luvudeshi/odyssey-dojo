# Athena's lines

Athena, grey-eyed goddess of war-craft, coaches the player (Odysseus) against Polyphemus in his cave, and against the monsters after him. Short, urgent, in-world.

Each line is one clip at `public/audio/athena/<id>.mp3`, all generated with one ElevenLabs voice. After generating, list the ids that exist in `public/audio/athena/index.json`: the game only requests clips named there, and stays silent for the rest.

Lines are short on purpose. A call must fit inside the fastest telegraph (1.1 s), so it is 2 to 4 words with the action first; only the finishing call is longer. Praise and warnings are 2 words. The calls, praise, warnings, `fight_start`, `win` and `loss` play against every enemy, so they never name one; only `call_stake_thrust` and the phase lines belong to one enemy. `call_any_defend` and `call_any_strike` are spoken when a move has no call of its own, so a move added later is never met with silence.

A phase line is picked by the phase's own name, not its number (`phaseLineId` in `src/audio/athenaLines.ts`). The name is slugged: "The Meadow of Bones" plays `phase_the_meadow_of_bones`. Polyphemus's two clips keep their old ids: "The Club" plays `phase_1` and "Blinded" plays `phase_2`. A later phase with no line of its own plays `phase_any`, which names no one. To give a new phase a line, add a row with the id `phase_<slug of its name>` and generate the clip. Phase lines are at most 5 words and tell the fighter what to do about the attack that phase adds.

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
| `call_uppercut` | A weak spot opens for an uppercut | Uppercut! Punch up! |
| `call_reverse_punch` | A weak spot opens for a reverse punch | Reverse punch! Right fist! |
| `call_knife_hand` | A weak spot opens for a knife hand | Knife hand! Chop out! |
| `call_hammer_fist` | A weak spot opens for a hammer fist | Hammer fist! Strike down! |
| `call_double_palm` | A weak spot opens for a double palm | Both palms! Push! |
| `call_chain_punch` | A weak spot opens for a chain punch | Chain punch! One, two! |
| `call_rising_palm` | A weak spot opens for a rising palm | Rising palm! Drive up! |
| `call_front_kick` | A weak spot opens for a front kick | Front kick! Foot out! |
| `call_knee` | A weak spot opens for a knee strike | Knee! Drive it high! |
| `call_thunderbolt` | Zeus's power: a hand raised high, then thrown down | Thunderbolt! Throw it down! |
| `call_trident_sweep` | Poseidon's power: both arms swept across | Trident! Sweep across! |
| `call_aegis_push` | Athena's power: both palms pushed forward | Aegis! Push forward! |
| `call_swift_dash` | Hermes's power: a fast side-step | Dash! Step aside! |
| `call_moon_arrow` | Artemis's power: draw a bow, then let go | Draw! Now loose! |
| `call_sun_burst` | Apollo's power: both arms flung wide | Arms wide! Shine! |
| `call_any_defend` | An attack is coming and its defense has no line of its own | Defend yourself! |
| `call_any_strike` | A weak spot opens for a strike that has no line of its own | Strike now! |
| `call_stake_thrust` | The finishing move: the stake into the Cyclops's eye | Now! Both hands! Stake his eye! |
| `praise_1` | Your strike lands | Well struck! |
| `praise_2` | Your strike lands | Clean blow! |
| `praise_3` | Your strike lands | Fine hit! |
| `warn_1` | The enemy hits you | Stay sharp! |
| `warn_2` | The enemy hits you | Guard yourself! |
| `warn_3` | The enemy hits you | Too slow! |
| `phase_1` | The fight enters its second phase: Polyphemus takes up his club | He takes his club! |
| `phase_2` | The fight enters its third phase: Polyphemus is blinded and swings wildly | He is blind! Stay light! |
| `phase_the_wand` | Circe's second phase, The Wand: she strikes with her wand from both sides | Her wand! Step aside! |
| `phase_unmasked` | Circe's third phase, Unmasked: her drug has failed and she casts her spell | She knows you! Guard up! |
| `phase_the_song` | The Sirens' second phase, The Song: they leave the meadow and swoop | They come for you! Dodge! |
| `phase_the_meadow_of_bones` | The Sirens' third phase, The Meadow of Bones: they dive with their talons | Talons! Keep your head down! |
| `phase_six_heads` | Scylla's second phase, Six Heads: her heads lunge from above | Six heads! Duck the lunge! |
| `phase_the_toll` | Scylla's third phase, The Toll: each head snaps for a man | She wants six men! Guard! |
| `phase_the_spew` | Charybdis's second phase, The Spew: the water she drank comes back up | She spews! Duck the spout! |
| `phase_the_fig_tree` | Charybdis's third phase, The Fig Tree: you hang above her and she pulls again | Hold the fig tree! Guard! |
| `phase_eurymachus` | The Suitors' second phase, Eurymachus: he draws his sword and rushes you | His sword is out! Guard! |
| `phase_the_volley` | The Suitors' third phase, The Volley: spears thrown from both sides | A volley of spears! Dodge! |
| `phase_any` | The fight enters a later phase that has no line of its own | It changes! Watch the wind-up. |
| `fight_start` | The fight begins | I am with you, Odysseus! |
| `win` | You win the fight | The monster falls! Onward, Odysseus! |
| `loss` | You lose the fight | Rise, Odysseus. Ithaca still waits for you. |
