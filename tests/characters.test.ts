// The five characters: the data, the gear each one names, the bones that gear hangs on, and the stored choice.
import { readFileSync } from "node:fs";
import { isValidElement } from "react";
import { describe, expect, test } from "vitest";
import { GODS } from "../src/ai/gods/gods";
import { anchorsFor } from "../src/characters/anchors";
import { CHARACTER_KEY, CHARACTERS, DEFAULT_CHARACTER, characterById, isCharacterId, loadCharacter, saveCharacter } from "../src/characters/characters";
import type { CharacterStorage } from "../src/characters/characters";
import { GEAR, GEAR_BONES } from "../src/characters/gear/registry";
import { candidate as spartan } from "../src/render/hero/defs/spartan";
import { SPARTAN_ANCHORS } from "../src/render/hero/gear/anchors";
import { BRONZE, BRONZE_DARK } from "../src/render/hero/gear/spartanGear";
import { STYLES } from "../src/styles/registry";

/** Names of every node (the bones among them) in a .glb, read from its JSON chunk. */
function nodeNames(path: string): Set<string> {
  const buf = readFileSync(path);
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8")) as { nodes?: { name?: string }[] };
  return new Set((json.nodes ?? []).flatMap((n) => (n.name ? [n.name] : [])));
}

function memoryStorage(initial: Record<string, string> = {}): CharacterStorage & { readonly data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = value; } };
}

const throwing: CharacterStorage = {
  getItem: () => { throw new Error("blocked"); },
  setItem: () => { throw new Error("full"); },
};

describe("the five characters", () => {
  test("there are five, with unique ids and names, and Odysseus is the default", () => {
    expect(CHARACTERS.map((c) => c.name)).toEqual(["Odysseus", "Poseidon", "Zeus", "Athena", "Achilles"]);
    expect(new Set(CHARACTERS.map((c) => c.id)).size).toBe(5);
    expect(new Set(CHARACTERS.map((c) => c.name)).size).toBe(5);
    expect(DEFAULT_CHARACTER).toBe("odysseus");
    expect(CHARACTERS[0]?.id).toBe(DEFAULT_CHARACTER);
  });

  test("each has one line of at most 70 characters that ends like a sentence", () => {
    for (const c of CHARACTERS) {
      expect(c.line.length, c.id).toBeGreaterThan(20);
      expect(c.line.length, c.id).toBeLessThanOrEqual(70);
      expect(c.line, c.id).toMatch(/\.$/);
      expect(c.line, c.id).not.toMatch(/\n/);
    }
  });

  test("every palette colour is #rrggbb", () => {
    for (const c of CHARACTERS) {
      const colours = Object.entries(c.palette);
      expect(colours.length, c.id).toBeGreaterThanOrEqual(4);
      for (const [key, value] of colours) expect(value, `${c.id} ${key}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  test("no two characters share a metal and cloth pair, so colour alone tells them apart", () => {
    const pairs = CHARACTERS.map((c) => `${c.palette.metal} ${c.palette.cloth}`);
    expect(new Set(pairs).size).toBe(CHARACTERS.length);
  });

  test("Odysseus keeps the spartan's bronze", () => {
    const { palette } = characterById("odysseus");
    expect(palette.metal).toBe(BRONZE);
    expect(palette.metalDark).toBe(BRONZE_DARK);
  });

  test("the gods among them are named as the god scan names them, and Zeus and Poseidon carry their god's colour", () => {
    for (const id of ["zeus", "poseidon", "athena"] as const) expect(characterById(id).name).toBe(GODS[id].name);
    for (const id of ["zeus", "poseidon"] as const) expect(characterById(id).palette.accent).toBe(GODS[id].accent);
  });

  test("a character is not a fighting style: no id is shared", () => {
    const styles = new Set(STYLES.map((s) => s.id));
    for (const c of CHARACTERS) expect(styles.has(c.id), c.id).toBe(false);
  });

  test("characterById finds each one and falls back to the default", () => {
    for (const c of CHARACTERS) expect(characterById(c.id)).toBe(c);
    for (const unknown of ["", "hermes", "ODYSSEUS", null, undefined]) expect(characterById(unknown).id).toBe(DEFAULT_CHARACTER);
    expect(isCharacterId("zeus")).toBe(true);
    expect(isCharacterId("hermes")).toBe(false);
    expect(isCharacterId(3)).toBe(false);
  });
});

describe("gear", () => {
  test("every piece a character names exists, and no piece is named twice", () => {
    for (const c of CHARACTERS) {
      expect(c.gear.length, c.id).toBeGreaterThanOrEqual(5);
      expect(new Set(c.gear).size, c.id).toBe(c.gear.length);
      for (const id of c.gear) expect(GEAR[id], `${c.id} ${id}`).toBeDefined();
    }
  });

  test("every piece in the registry is worn by someone and draws something in each wearer's colours", () => {
    const worn = new Set(CHARACTERS.flatMap((c) => c.gear));
    for (const [id, piece] of Object.entries(GEAR)) {
      expect(worn.has(id as keyof typeof GEAR), id).toBe(true);
      expect(piece.bones.length, id).toBeGreaterThan(0);
      for (const c of CHARACTERS.filter((who) => who.gear.some((g) => g === id))) expect(isValidElement(piece.render(c.palette)), `${c.id} ${id}`).toBe(true);
    }
  });

  test("each character covers head, chest and hips, and carries something on the back", () => {
    for (const c of CHARACTERS) {
      const bones = new Set(c.gear.flatMap((id) => GEAR[id].bones));
      for (const bone of ["Head", "spine_03", "pelvis"] as const) expect(bones.has(bone), `${c.id} ${bone}`).toBe(true);
      expect(c.gear.filter((id) => GEAR[id].bones.includes("spine_03")).length, c.id).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("anchorsFor", () => {
  const bones = nodeNames(`public${spartan.url}`);

  test("the gear bones are bones of the spartan", () => {
    expect(bones.size).toBeGreaterThan(40);
    for (const bone of GEAR_BONES) expect(bones.has(bone), bone).toBe(true);
  });

  test("every character's anchors name only bones the spartan has, and every node is drawable", () => {
    for (const c of CHARACTERS) {
      const anchors = anchorsFor(c.id);
      expect(Object.keys(anchors).length, c.id).toBeGreaterThanOrEqual(4);
      for (const [bone, node] of Object.entries(anchors)) {
        expect(bones.has(bone), `${c.id} ${bone}`).toBe(true);
        expect(isValidElement(node), `${c.id} ${bone}`).toBe(true);
      }
    }
  });

  test("it has the shape of the spartan's map: the same bones for Odysseus, and never a bone the spartan's map lacks", () => {
    const known = new Set(Object.keys(SPARTAN_ANCHORS));
    expect(anchorsFor("odysseus")).toBe(SPARTAN_ANCHORS);
    for (const c of CHARACTERS) for (const bone of Object.keys(anchorsFor(c.id))) expect(known.has(bone), `${c.id} ${bone}`).toBe(true);
  });

  test("the only thing in a hand is the style's own gear: the right hand as the spartan has it, the left hand empty", () => {
    for (const c of CHARACTERS) {
      const anchors = anchorsFor(c.id);
      expect(anchors.hand_r, c.id).toBeDefined();
      expect(Object.keys(anchors).filter((bone) => /hand|arm|clavicle|index|thumb|middle|ring|pinky/.test(bone)), c.id).toEqual(["hand_r"]);
      for (const id of c.gear) for (const bone of GEAR[id].bones) expect(bone, `${c.id} ${id}`).not.toMatch(/hand|arm/);
    }
  });

  test("every character keeps a place on the back for the Hoplite's spear", () => {
    for (const c of CHARACTERS) expect(anchorsFor(c.id).spine_03, c.id).toBeDefined();
  });

  test("the same map comes back every time, and an unknown id gives the default's", () => {
    for (const c of CHARACTERS) expect(anchorsFor(c.id)).toBe(anchorsFor(c.id));
    expect(anchorsFor("hermes")).toBe(anchorsFor(DEFAULT_CHARACTER));
    expect(anchorsFor(null)).toBe(anchorsFor(DEFAULT_CHARACTER));
    expect(new Set(CHARACTERS.map((c) => anchorsFor(c.id))).size).toBe(CHARACTERS.length);
  });
});

describe("the stored choice", () => {
  test("save then load gives the same character back, for all five", () => {
    for (const c of CHARACTERS) {
      const storage = memoryStorage();
      expect(saveCharacter(c.id, storage)).toBe(c.id);
      expect(storage.data[CHARACTER_KEY]).toBe(c.id);
      expect(loadCharacter(storage)).toBe(c.id);
    }
  });

  test("nothing stored, or an id we do not know, loads the default", () => {
    expect(loadCharacter(memoryStorage())).toBe(DEFAULT_CHARACTER);
    for (const bad of ["hermes", "", "Zeus", "{\"id\":\"zeus\"}"]) expect(loadCharacter(memoryStorage({ [CHARACTER_KEY]: bad })), bad).toBe(DEFAULT_CHARACTER);
  });

  test("saving an unknown id stores the default", () => {
    const storage = memoryStorage({ [CHARACTER_KEY]: "zeus" });
    expect(saveCharacter("hermes", storage)).toBe(DEFAULT_CHARACTER);
    expect(loadCharacter(storage)).toBe(DEFAULT_CHARACTER);
  });

  test("no storage, or one that throws, never breaks the game", () => {
    expect(loadCharacter(null)).toBe(DEFAULT_CHARACTER);
    expect(saveCharacter("athena", null)).toBe("athena");
    expect(loadCharacter(throwing)).toBe(DEFAULT_CHARACTER);
    expect(saveCharacter("athena", throwing)).toBe("athena");
  });

  test("with no argument it uses the browser's storage if there is one, and the default if not", () => {
    expect(isCharacterId(loadCharacter())).toBe(true);
  });
});
