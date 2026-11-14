// Athena's script: every line the coach can say. docs/athena-lines.md mirrors it and a test keeps the two equal.
// Clips are generated ahead of time and named after the line id, so ids must never change.
// Lines are short so they fit between beats, and only call_stake_thrust and the phase lines may name an enemy:
// every other line plays in every fight.

export interface VoiceLine {
  readonly id: string;
  /** When the line plays, for whoever records or reviews the clips. */
  readonly when: string;
  readonly text: string;
}

export const ATHENA_LINES: readonly VoiceLine[] = [
  { id: "call_block", when: "An attack is coming that a block stops", text: "Hands up! Guard!" },
  { id: "call_duck", when: "An attack is coming that a duck avoids", text: "Duck! Head down!" },
  { id: "call_dodge_left", when: "An attack is coming that a dodge left avoids", text: "Dodge left!" },
  { id: "call_dodge_right", when: "An attack is coming that a dodge right avoids", text: "Dodge right!" },
  { id: "call_jump", when: "A low attack is coming that a jump clears", text: "Jump! Feet up!" },
  { id: "call_jab", when: "A weak spot opens for a jab", text: "Jab! Left fist!" },
  { id: "call_cross", when: "A weak spot opens for a cross", text: "Cross! Right fist!" },
  { id: "call_hook", when: "A weak spot opens for a left hook", text: "Left hook! Swing!" },
  { id: "call_overhead_strike", when: "A weak spot opens for an overhead strike", text: "Right hand high! Chop!" },
  { id: "call_spear_thrust", when: "A weak spot opens for a spear thrust", text: "Thrust! Both hands!" },
  { id: "call_uppercut", when: "A weak spot opens for an uppercut", text: "Uppercut! Punch up!" },
  { id: "call_reverse_punch", when: "A weak spot opens for a reverse punch", text: "Reverse punch! Right fist!" },
  { id: "call_knife_hand", when: "A weak spot opens for a knife hand", text: "Knife hand! Chop out!" },
  { id: "call_hammer_fist", when: "A weak spot opens for a hammer fist", text: "Hammer fist! Strike down!" },
  { id: "call_double_palm", when: "A weak spot opens for a double palm", text: "Both palms! Push!" },
  { id: "call_chain_punch", when: "A weak spot opens for a chain punch", text: "Chain punch! One, two!" },
  { id: "call_rising_palm", when: "A weak spot opens for a rising palm", text: "Rising palm! Drive up!" },
  { id: "call_thunderbolt", when: "Zeus's power: a hand raised high, then thrown down", text: "Thunderbolt! Throw it down!" },
  { id: "call_trident_sweep", when: "Poseidon's power: both arms swept across", text: "Trident! Sweep across!" },
  { id: "call_aegis_push", when: "Athena's power: both palms pushed forward", text: "Aegis! Push forward!" },
  { id: "call_swift_dash", when: "Hermes's power: a fast side-step", text: "Dash! Step aside!" },
  { id: "call_moon_arrow", when: "Artemis's power: draw a bow, then let go", text: "Draw! Now loose!" },
  { id: "call_sun_burst", when: "Apollo's power: both arms flung wide", text: "Arms wide! Shine!" },
  { id: "call_any_defend", when: "An attack is coming and its defense has no line of its own", text: "Defend yourself!" },
  { id: "call_any_strike", when: "A weak spot opens for a strike that has no line of its own", text: "Strike now!" },
  { id: "call_stake_thrust", when: "The finishing move: the stake into the Cyclops's eye", text: "Now! Both hands! Stake his eye!" },
  { id: "praise_1", when: "Your strike lands", text: "Well struck!" },
  { id: "praise_2", when: "Your strike lands", text: "Clean blow!" },
  { id: "praise_3", when: "Your strike lands", text: "Fine hit!" },
  { id: "warn_1", when: "The enemy hits you", text: "Stay sharp!" },
  { id: "warn_2", when: "The enemy hits you", text: "Guard yourself!" },
  { id: "warn_3", when: "The enemy hits you", text: "Too slow!" },
  { id: "phase_1", when: "The fight enters its second phase: Polyphemus takes up his club", text: "He takes his club!" },
  { id: "phase_2", when: "The fight enters its third phase: Polyphemus is blinded and swings wildly", text: "He is blind! Stay light!" },
  { id: "fight_start", when: "The fight begins", text: "I am with you, Odysseus!" },
  { id: "win", when: "You win the fight", text: "The monster falls! Onward, Odysseus!" },
  { id: "loss", when: "You lose the fight", text: "Rise, Odysseus. Ithaca still waits for you." },
];

export function clipUrl(id: string): string {
  return `/audio/athena/${id}.mp3`;
}
