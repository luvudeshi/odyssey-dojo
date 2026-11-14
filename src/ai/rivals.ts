// The god each Olympian quarrels with in Homer. Used whenever a rival is missing, invalid or the same as the god.
import type { GodId } from "./contracts";

export const RIVALS: Readonly<Record<GodId, GodId>> = {
  // Iliad 15: Poseidon rages that Zeus orders him about like a lesser god.
  zeus: "poseidon",
  // Odyssey: Poseidon hunts Odysseus across the sea while Athena shelters him.
  poseidon: "athena",
  athena: "poseidon",
  // Homeric Hymn to Hermes: the newborn Hermes steals Apollo's cattle.
  hermes: "apollo",
  // Iliad 21: Artemis scolds Apollo for backing down from Poseidon.
  artemis: "apollo",
  // Iliad 21: Poseidon dares Apollo to fight him before Troy.
  apollo: "poseidon",
};
