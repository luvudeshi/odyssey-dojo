// The god who sends the monsters against each Olympian. Used whenever a rival is missing, invalid, the god itself or Athena.
import type { GodId } from "./contracts";

export const RIVALS: Readonly<Record<GodId, GodId>> = {
  // Iliad 15: Poseidon rages that Zeus orders him about like a lesser god.
  zeus: "poseidon",
  // The same quarrel from the other side, and in the Odyssey Zeus is the other god who wrecks Odysseus at sea: his
  // thunderbolt splits the ship after the crew eat the cattle of the Sun (12.403-419). Apollo only declines
  // Poseidon's challenge (Iliad 21) and Helios is not one of our six.
  poseidon: "zeus",
  // Odyssey: Poseidon hunts Odysseus across the sea while Athena shelters him.
  athena: "poseidon",
  // Homeric Hymn to Hermes: the newborn Hermes steals Apollo's cattle.
  hermes: "apollo",
  // Iliad 21: Artemis scolds Apollo for backing down from Poseidon.
  artemis: "apollo",
  // Iliad 21: Poseidon dares Apollo to fight him before Troy.
  apollo: "poseidon",
};

/** Athena coaches the player through every fight (her voice calls each move), so she is never the one sending the monsters. */
export const COACH: GodId = "athena";

/**
 * The rival to use for a player who is `god`: the one asked for, unless it is missing, the god itself or Athena.
 * In Athena's place it is Poseidon, who hounds Odysseus through the whole poem; a player who is Poseidon gets Zeus.
 */
export function rivalFor(god: GodId, wanted?: GodId): GodId {
  if (wanted === COACH) return god === "poseidon" ? RIVALS.poseidon : "poseidon";
  return wanted === undefined || wanted === god ? RIVALS[god] : wanted;
}
