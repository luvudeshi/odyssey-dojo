// Athena's script: every line the coach can say. docs/athena-lines.md mirrors it and a test keeps the two equal.
// Clips are generated ahead of time and named after the line id, so ids must never change.
// Lines are short so they fit between beats, and only call_stake_thrust and the phase lines may name an enemy:
// every other line plays in every fight. A phase line belongs to one enemy's phase and is picked by that phase's name
// (phaseLineId below). phase_any is for a phase with no line of its own, so it names no one.
// fight_start must be over before the first call, 1.5 s into every fight: its clip is 1.28 s and a test keeps it under 1.3.

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
  { id: "call_front_kick", when: "A weak spot opens for a front kick", text: "Front kick! Foot out!" },
  { id: "call_knee", when: "A weak spot opens for a knee strike", text: "Knee! Drive it high!" },
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
  { id: "phase_the_wand", when: "Circe's second phase, The Wand: she strikes with her wand from both sides", text: "Her wand! Step aside!" },
  { id: "phase_unmasked", when: "Circe's third phase, Unmasked: her drug has failed and she casts her spell", text: "She knows you! Guard up!" },
  { id: "phase_the_song", when: "The Sirens' second phase, The Song: they leave the meadow and swoop", text: "They come for you! Dodge!" },
  { id: "phase_the_meadow_of_bones", when: "The Sirens' third phase, The Meadow of Bones: they dive with their talons", text: "Talons! Keep your head down!" },
  { id: "phase_six_heads", when: "Scylla's second phase, Six Heads: her heads lunge from above", text: "Six heads! Duck the lunge!" },
  { id: "phase_the_toll", when: "Scylla's third phase, The Toll: each head snaps for a man", text: "She wants six men! Guard!" },
  { id: "phase_the_spew", when: "Charybdis's second phase, The Spew: the water she drank comes back up", text: "She spews! Duck the spout!" },
  { id: "phase_the_fig_tree", when: "Charybdis's third phase, The Fig Tree: you hang above her and she pulls again", text: "Hold the fig tree! Guard!" },
  { id: "phase_eurymachus", when: "The Suitors' second phase, Eurymachus: he draws his sword and rushes you", text: "His sword is out! Guard!" },
  { id: "phase_the_volley", when: "The Suitors' third phase, The Volley: spears thrown from both sides", text: "A volley of spears! Dodge!" },
  { id: "phase_any", when: "The fight enters a later phase that has no line of its own", text: "It changes! Watch the wind-up." },
  { id: "fight_start", when: "The fight begins", text: "I am with you!" },
  { id: "win", when: "You win the fight", text: "The monster falls! Onward, Odysseus!" },
  { id: "loss", when: "You lose the fight", text: "Rise, Odysseus. Ithaca still waits for you." },
];

/** The line a later phase falls back to when it has none of its own. */
export const ANY_PHASE = "phase_any";
/** Polyphemus's two phase clips were recorded under numbers, before the other stops had phases. His phase names point at them. */
const NUMBERED_PHASES: ReadonlyMap<string, string> = new Map([
  ["the_club", "phase_1"],
  ["blinded", "phase_2"],
]);
const LINE_IDS: ReadonlySet<string> = new Set(ATHENA_LINES.map((line) => line.id));

/** "The Meadow of Bones" becomes "the_meadow_of_bones". */
export function phaseSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/**
 * The line for a later phase, picked by the phase's own name, so one enemy never hears another's line.
 * A phase with no line gets ANY_PHASE. A phase that happens to be named "1" or "2" does not reach Polyphemus's clips.
 */
export function phaseLineId(name: unknown): string {
  // Online, the event comes off the network, so a name that is not text gets the generic line and never throws.
  if (typeof name !== "string") return ANY_PHASE;
  const slug = phaseSlug(name);
  const id = NUMBERED_PHASES.get(slug) ?? `phase_${slug}`;
  return LINE_IDS.has(id) && !/^\d+$/.test(slug) ? id : ANY_PHASE;
}

export function clipUrl(id: string): string {
  return `/audio/athena/${id}.mp3`;
}
