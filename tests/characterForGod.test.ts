// The god scan picks the character: every god maps to one of the five, and a pick by hand wins over the scan.
import { describe, expect, test } from "vitest";
import { GODS, GOD_IDS } from "../src/ai/gods/gods";
import { offlineReveal } from "../src/ai/gods/offlineReveal";
import { CHARACTER_KEY, CHARACTERS, DEFAULT_CHARACTER, characterById, isCharacterId, loadCharacter } from "../src/characters/characters";
import type { CharacterStorage } from "../src/characters/characters";
import {
  CHARACTER_SOURCE_KEY, GOD_CHARACTER, characterForGod, characterLineForGod, confirmCharacter,
  handPicked, pickCharacter,
} from "../src/characters/godCharacter";

function memoryStorage(initial: Record<string, string> = {}): CharacterStorage & { readonly data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = value; } };
}

const throwing: CharacterStorage = {
  getItem: () => { throw new Error("blocked"); },
  setItem: () => { throw new Error("full"); },
};

describe("characterForGod", () => {
  test("every god the scan can return maps to one of the five characters", () => {
    expect(Object.keys(GOD_CHARACTER).sort()).toEqual([...GOD_IDS].sort());
    for (const god of GOD_IDS) {
      expect(isCharacterId(characterForGod(god)), god).toBe(true);
      expect(characterById(characterForGod(god)).id, god).toBe(GOD_CHARACTER[god]);
    }
  });

  test("whatever the offline scan answers has a character", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 300; seed += 1) {
      const { god } = offlineReveal({ frame: null, tint: null, seed });
      seen.add(god);
      expect(isCharacterId(characterForGod(god)), god).toBe(true);
    }
    expect([...seen].sort()).toEqual([...GOD_IDS].sort());
  });

  test("a god who is one of the five is that character", () => {
    expect(characterForGod("zeus")).toBe("zeus");
    expect(characterForGod("poseidon")).toBe("poseidon");
    expect(characterForGod("athena")).toBe("athena");
  });

  test("the other gods lend theirs: wit and the bow to Odysseus, the hunt to Achilles", () => {
    expect(characterForGod("hermes")).toBe("odysseus");
    expect(characterForGod("apollo")).toBe("odysseus");
    expect(characterForGod("artemis")).toBe("achilles");
  });

  test("all five characters can be reached from a scan", () => {
    const reached = new Set(GOD_IDS.map((god) => characterForGod(god)));
    expect([...reached].sort()).toEqual(CHARACTERS.map((c) => c.id).sort());
  });

  test("no god, or an id that is not a god, gives the default", () => {
    expect(DEFAULT_CHARACTER).toBe("odysseus");
    for (const odd of [null, undefined, "", "ares", "ZEUS", "toString", "__proto__"]) {
      expect(characterForGod(odd), String(odd)).toBe(DEFAULT_CHARACTER);
    }
  });
});

describe("characterLineForGod", () => {
  test("names the god and the character", () => {
    expect(characterLineForGod("zeus")).toBe("Zeus chose you. You fight as Zeus.");
    expect(characterLineForGod("hermes")).toBe("Hermes chose you. You fight as Odysseus.");
    expect(characterLineForGod("artemis")).toBe("Artemis chose you. You fight as Achilles.");
  });

  test("every god has a line with its own name and its character's name", () => {
    for (const god of GOD_IDS) {
      const line = characterLineForGod(god);
      expect(line.startsWith(`${GODS[god].name} chose you.`), god).toBe(true);
      expect(line.endsWith(`You fight as ${characterById(characterForGod(god)).name}.`), god).toBe(true);
    }
  });

  test("a pick by hand is kept, and the line says so", () => {
    expect(characterLineForGod("zeus", "achilles")).toBe("Zeus chose you. You still fight as Achilles, your own pick.");
    // The same character as the god's: nothing to explain.
    expect(characterLineForGod("zeus", "zeus")).toBe("Zeus chose you. You fight as Zeus.");
  });

  test("no god gives no line", () => {
    expect(characterLineForGod(null)).toBe("");
    expect(characterLineForGod("ares")).toBe("");
  });
});

describe("the stored character and the hand pick", () => {
  test("the storage key follows the repo's naming", () => {
    expect(CHARACTER_SOURCE_KEY).toBe("odyssey-dojo.character.source");
    expect(CHARACTER_SOURCE_KEY.startsWith(`${CHARACTER_KEY}.`)).toBe(true);
  });

  test("a pick by hand is remembered as such", () => {
    const storage = memoryStorage();
    expect(handPicked(storage)).toBeNull();
    expect(pickCharacter("achilles", storage)).toBe("achilles");
    expect(handPicked(storage)).toBe("achilles");
    expect(loadCharacter(storage)).toBe("achilles");
  });

  test("confirming the character already stored is not a pick by hand", () => {
    const storage = memoryStorage({ [CHARACTER_KEY]: "zeus" });
    expect(confirmCharacter("zeus", storage)).toBe("zeus");
    expect(handPicked(storage)).toBeNull();
  });

  test("confirming any other character is a pick by hand", () => {
    const storage = memoryStorage({ [CHARACTER_KEY]: "zeus" });
    expect(confirmCharacter("athena", storage)).toBe("athena");
    expect(handPicked(storage)).toBe("athena");
  });

  test("confirming the default with nothing stored is not a pick by hand", () => {
    const storage = memoryStorage();
    expect(confirmCharacter(DEFAULT_CHARACTER, storage)).toBe(DEFAULT_CHARACTER);
    expect(handPicked(storage)).toBeNull();
  });

  test("an unknown id picked by hand stores the default", () => {
    const storage = memoryStorage();
    expect(pickCharacter("hades", storage)).toBe(DEFAULT_CHARACTER);
    expect(handPicked(storage)).toBe(DEFAULT_CHARACTER);
  });

  test("no storage, or one that throws, never throws and falls back", () => {
    expect(handPicked(null)).toBeNull();
    expect(pickCharacter("athena", null)).toBe("athena");
    expect(confirmCharacter("athena", null)).toBe("athena");
    expect(handPicked(throwing)).toBeNull();
    expect(pickCharacter("athena", throwing)).toBe("athena");
    expect(confirmCharacter("athena", throwing)).toBe("athena");
  });

  test("a source value we do not know is not a hand pick", () => {
    const storage = memoryStorage({ [CHARACTER_KEY]: "achilles", [CHARACTER_SOURCE_KEY]: "maybe" });
    expect(handPicked(storage)).toBeNull();
  });
});
