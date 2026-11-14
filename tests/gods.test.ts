// Guards the gods' data and the offline god scan: stance, colour and seed cues, determinism, and what a reason may say.
import { describe, expect, test } from "vitest";
import type { PoseFrame } from "../src/core/types";
import { GODS, GOD_IDS } from "../src/gods/gods";
import type { GodId } from "../src/gods/gods";
import { clothingTint, lotReason, offlineReveal } from "../src/gods/offlineReveal";
import type { RevealCues } from "../src/gods/offlineReveal";
import { STANCES, readStance } from "../src/gods/stance";
import type { StanceId } from "../src/gods/stance";
import { TINTS, tintId } from "../src/gods/tint";
import type { PixelGrid, Tint } from "../src/gods/tint";
import { JOINT } from "../src/pose/signals";
import { frameAt } from "./poseFixture";

const J = JOINT;

const POWER_MOVES: Record<GodId, string> = {
  zeus: "thunderbolt",
  poseidon: "trident_sweep",
  athena: "aegis_push",
  hermes: "swift_dash",
  artemis: "moon_arrow",
  apollo: "sun_burst",
};

// A reason may speak of stance, energy and clothing colour only: nothing about the player's body, face, size, age,
// gender or looks. Matched as whole words, case-insensitive.
const BANNED = [
  "body", "bodies", "bodied", "physique", "figure", "build", "built", "frame", "shape", "form",
  "face", "faces", "faced", "eye", "eyes", "eyed", "hair", "haired", "skin", "skinned", "smile", "jaw", "brow", "cheek",
  "head", "neck", "shoulder", "shoulders", "chest", "arm", "arms", "armed", "hand", "hands", "fist", "fists", "palm",
  "palms", "finger", "fingers", "hip", "hips", "leg", "legs", "knee", "knees", "foot", "feet", "footed", "limb", "limbs",
  "muscle", "muscles", "muscular", "sinew", "sinews",
  "tall", "short", "small", "little", "big", "large", "huge", "tiny", "thin", "slim", "slender", "fat", "heavy", "stout",
  "broad", "size", "sized", "height", "weight", "stature",
  "young", "youth", "youthful", "old", "elder", "elderly", "age", "aged", "child", "kid", "teen", "adult",
  "man", "woman", "men", "women", "boy", "girl", "male", "female", "he", "she", "him", "her", "his", "hers", "son",
  "daughter", "lady", "gentleman", "sir", "madam",
  "handsome", "beautiful", "beauty", "pretty", "lovely", "cute", "attractive", "gorgeous", "ugly", "plain", "sexy",
  "hot", "fair", "looks", "appearance", "complexion", "features",
];

function bannedIn(text: string): readonly string[] {
  const words = new Set(text.toLowerCase().match(/[a-z']+/g) ?? []);
  return BANNED.filter((word) => words.has(word));
}

const STANCE_FRAMES: Record<StanceId, PoseFrame> = {
  skyReach: frameAt(0, {
    [J.leftElbow]: [0.4, 0.2], [J.rightElbow]: [0.6, 0.2],
    [J.leftWrist]: [0.41, 0.05], [J.rightWrist]: [0.59, 0.05],
  }),
  armsWide: frameAt(0, {
    [J.leftElbow]: [0.3, 0.35], [J.rightElbow]: [0.7, 0.35],
    [J.leftWrist]: [0.18, 0.36], [J.rightWrist]: [0.82, 0.36],
  }),
  archer: frameAt(0, {
    [J.leftElbow]: [0.28, 0.35], [J.leftWrist]: [0.15, 0.35],
    [J.rightElbow]: [0.68, 0.37], [J.rightWrist]: [0.57, 0.36],
  }),
  push: frameAt(
    0,
    { [J.leftElbow]: [0.42, 0.4], [J.rightElbow]: [0.58, 0.4], [J.leftWrist]: [0.44, 0.37], [J.rightWrist]: [0.56, 0.37] },
    {
      [J.leftElbow]: [-0.2, -0.48, -0.28], [J.rightElbow]: [0.2, -0.48, -0.28],
      [J.leftWrist]: [-0.15, -0.45, -0.55], [J.rightWrist]: [0.15, -0.45, -0.55],
    },
  ),
  guard: frameAt(0, { [J.leftWrist]: [0.47, 0.22], [J.rightWrist]: [0.53, 0.22] }),
  wideStance: frameAt(0, {
    [J.leftKnee]: [0.36, 0.82], [J.rightKnee]: [0.64, 0.82],
    [J.leftAnkle]: [0.3, 0.96], [J.rightAnkle]: [0.7, 0.96],
  }),
  crouch: frameAt(0, {
    [J.leftKnee]: [0.42, 0.7], [J.rightKnee]: [0.58, 0.7],
    [J.leftAnkle]: [0.45, 0.86], [J.rightAnkle]: [0.55, 0.86],
  }),
  lean: frameAt(0, {
    [J.nose]: [0.6, 0.21],
    [J.leftShoulder]: [0.5, 0.36], [J.rightShoulder]: [0.66, 0.36],
    [J.leftElbow]: [0.5, 0.5], [J.rightElbow]: [0.68, 0.5],
    [J.leftWrist]: [0.5, 0.62], [J.rightWrist]: [0.68, 0.62],
  }),
  midStep: frameAt(0, {
    [J.leftKnee]: [0.45, 0.82], [J.rightKnee]: [0.57, 0.79],
    [J.leftAnkle]: [0.45, 0.96], [J.rightAnkle]: [0.56, 0.8],
  }),
};

const STANCE_GODS: Record<StanceId, GodId> = {
  skyReach: "zeus",
  armsWide: "apollo",
  archer: "artemis",
  push: "athena",
  guard: "athena",
  wideStance: "poseidon",
  crouch: "poseidon",
  lean: "hermes",
  midStep: "hermes",
};

const COLOURS: readonly (readonly [string, Tint, GodId])[] = [
  ["blue", [30, 80, 200], "poseidon"],
  ["teal", [20, 150, 150], "poseidon"],
  ["navy", [25, 40, 110], "poseidon"],
  ["gold", [230, 180, 40], "apollo"],
  ["orange", [240, 120, 30], "apollo"],
  ["white", [236, 236, 232], "athena"],
  ["grey", [128, 128, 132], "athena"],
  ["green", [40, 160, 60], "artemis"],
  ["red", [200, 30, 40], "zeus"],
  ["purple", [120, 40, 180], "zeus"],
  ["black", [14, 14, 18], "hermes"],
  ["webcam black", [40, 42, 54], "hermes"],
];

function hide(frame: PoseFrame, joints: readonly number[]): PoseFrame {
  const hidden = (list: PoseFrame["image"]): PoseFrame["image"] =>
    list.map((point, index) => (joints.includes(index) ? { ...point, visibility: 0 } : point));
  return { ...frame, image: hidden(frame.image), world: hidden(frame.world) };
}

const NO_CUE: RevealCues = { frame: null, tint: null, seed: 7 };
const ALL_REASONS: readonly string[] = [
  ...Object.values(STANCES).map((stance) => stance.reason),
  ...Object.values(TINTS).map((tint) => tint.reason),
  ...GOD_IDS.map(lotReason),
];

describe("the gods", () => {
  test("every god has complete data", () => {
    expect(Object.keys(GODS).sort()).toEqual([...GOD_IDS].sort());
    for (const id of GOD_IDS) {
      const god = GODS[id];
      expect(god.id).toBe(id);
      for (const text of [god.name, god.domain, god.odyssey, god.power.name, god.power.blurb]) {
        expect(text.trim(), id).toBe(text);
        expect(text.length, id).toBeGreaterThan(2);
      }
      // One sentence: a single full stop, at the end.
      expect(god.odyssey.indexOf("."), id).toBe(god.odyssey.length - 1);
      expect(god.power.blurb, id).not.toContain("\n");
      expect(god.power.moveId, id).toBe(POWER_MOVES[id]);
      expect(god.epithets.length, id).toBeGreaterThanOrEqual(5);
      expect(new Set(god.epithets).size, id).toBe(god.epithets.length);
      for (const epithet of god.epithets) expect(epithet.trim().length, id).toBeGreaterThan(2);
    }
  });

  test("accents are hex colours bright enough for a dark background, one per god", () => {
    const accents = GOD_IDS.map((id) => GODS[id].accent);
    expect(new Set(accents).size).toBe(accents.length);
    for (const accent of accents) {
      expect(accent).toMatch(/^#[0-9a-f]{6}$/);
      const [r, g, b] = [1, 3, 5].map((at) => parseInt(accent.slice(at, at + 2), 16) / 255);
      expect(0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0), accent).toBeGreaterThan(0.5);
    }
  });

  test("rivals are one to three other gods, never the god itself", () => {
    for (const id of GOD_IDS) {
      const rivals = GODS[id].rivals;
      expect(rivals.length, id).toBeGreaterThanOrEqual(1);
      expect(rivals.length, id).toBeLessThanOrEqual(3);
      expect(new Set(rivals).size, id).toBe(rivals.length);
      for (const rival of rivals) {
        expect(GOD_IDS, id).toContain(rival);
        expect(rival, id).not.toBe(id);
      }
    }
    expect(GODS.athena.rivals[0]).toBe("poseidon");
    expect(GODS.poseidon.rivals[0]).toBe("athena");
  });
});

describe("offline reveal", () => {
  test.each(Object.entries(STANCE_FRAMES))("the %s stance names its god and says so", (id, frame) => {
    const stance = id as StanceId;
    expect(readStance(frame)).toBe(stance);
    // The stance wins even when the clothing colour points at another god.
    for (const tint of [null, [30, 80, 200], [230, 180, 40]] as const) {
      const reveal = offlineReveal({ frame, tint, seed: 3 });
      expect(reveal.god).toBe(STANCE_GODS[stance]);
      expect(reveal.reason).toBe(STANCES[stance].reason);
    }
  });

  test("every god can be reached by a stance", () => {
    expect(new Set(Object.values(STANCES).map((stance) => stance.god))).toEqual(new Set(GOD_IDS));
    expect(STANCES).toMatchObject(Object.fromEntries(Object.entries(STANCE_GODS).map(([id, god]) => [id, { god }])));
  });

  test("an archer is read with either arm forward, and when the bow points at the camera", () => {
    const rightHanded = frameAt(0, {
      [J.rightElbow]: [0.72, 0.35], [J.rightWrist]: [0.85, 0.35],
      [J.leftElbow]: [0.32, 0.37], [J.leftWrist]: [0.43, 0.36],
    });
    const atCamera = frameAt(
      0,
      { [J.leftElbow]: [0.42, 0.37], [J.leftWrist]: [0.43, 0.36], [J.rightElbow]: [0.68, 0.37], [J.rightWrist]: [0.57, 0.36] },
      { [J.leftElbow]: [-0.2, -0.5, -0.3], [J.leftWrist]: [-0.2, -0.5, -0.6] },
    );
    for (const frame of [rightHanded, atCamera]) expect(offlineReveal({ ...NO_CUE, frame }).god).toBe("artemis");
  });

  test("standing normally is not a stance", () => {
    expect(readStance(frameAt(0))).toBeNull();
    expect(readStance(null)).toBeNull();
  });

  test.each(COLOURS)("%s clothing names its god when the stance says nothing", (_name, tint, god) => {
    for (const frame of [null, frameAt(0)]) {
      const reveal = offlineReveal({ frame, tint, seed: 11 });
      const family = tintId(tint);
      expect(reveal.god).toBe(god);
      expect(family).not.toBeNull();
      if (family) expect(reveal.reason).toBe(TINTS[family].reason);
    }
  });

  test("every god can be reached by a colour", () => {
    expect(new Set(Object.values(TINTS).map((tint) => tint.god))).toEqual(new Set(GOD_IDS));
  });

  test("with no usable cue the seed picks, and reaches every god", () => {
    const blind = hide(STANCE_FRAMES.skyReach, [J.leftShoulder, J.rightShoulder]);
    const unusable: readonly RevealCues["frame"][] = [null, { t: 0, image: [], world: [] }, blind, frameAt(0)];
    const found = new Set<GodId>();
    for (let seed = 0; seed < 200; seed++) {
      const reveal = offlineReveal({ frame: null, tint: null, seed });
      found.add(reveal.god);
      expect(reveal.reason).toBe(lotReason(reveal.god));
      for (const frame of unusable) expect(offlineReveal({ frame, tint: null, seed })).toEqual(reveal);
      expect(offlineReveal({ frame: null, tint: [NaN, 0, 0], seed })).toEqual(reveal);
    }
    expect(found).toEqual(new Set(GOD_IDS));
  });

  test("the epithet and rival come from the god's own lists and vary with the seed", () => {
    const epithets = new Set<string>();
    const rivals = new Set<GodId>();
    for (let seed = 0; seed < 100; seed++) {
      const reveal = offlineReveal({ frame: STANCE_FRAMES.archer, tint: null, seed });
      expect(GODS.artemis.epithets).toContain(reveal.epithet);
      expect(GODS.artemis.rivals).toContain(reveal.rivalGod);
      expect(reveal.rivalGod).not.toBe(reveal.god);
      epithets.add(reveal.epithet);
      rivals.add(reveal.rivalGod);
    }
    expect(epithets.size).toBe(GODS.artemis.epithets.length);
    expect(rivals.size).toBe(GODS.artemis.rivals.length);
  });

  test("the same cues always give the same reveal, and the source is always offline", () => {
    const cases: readonly RevealCues[] = [
      NO_CUE,
      { frame: frameAt(0), tint: [40, 160, 60], seed: 99 },
      ...Object.values(STANCE_FRAMES).map((frame) => ({ frame, tint: null, seed: 1234567 })),
    ];
    for (const cues of cases) {
      const first = offlineReveal(cues);
      expect(offlineReveal({ ...cues })).toEqual(first);
      expect(offlineReveal(cues)).toEqual(first);
      expect(first.source).toBe("offline");
    }
  });

  test("never throws, whatever is in the cues", () => {
    const nan = { x: NaN, y: NaN, z: NaN, visibility: NaN };
    const broken = { t: 0, image: undefined, world: null } as unknown as PoseFrame;
    const frames: readonly RevealCues["frame"][] = [
      { t: 0, image: [], world: [] },
      { t: NaN, image: Array.from({ length: 33 }, () => nan), world: [] },
      { t: 0, image: frameAt(0).image, world: [] },
      { t: 0, image: frameAt(0).image.slice(0, 13), world: frameAt(0).world.slice(0, 5) },
      hide(frameAt(0), Array.from({ length: 33 }, (_, index) => index)),
      broken,
    ];
    const tints: readonly RevealCues["tint"][] = [null, [NaN, NaN, NaN], [-40, 900, Infinity], [0, 0, 0]];
    for (const frame of frames) {
      for (const tint of tints) {
        for (const seed of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, Date.UTC(2026, 10, 14)]) {
          const reveal = offlineReveal({ frame, tint, seed });
          expect(GOD_IDS).toContain(reveal.god);
          expect(GODS[reveal.god].epithets).toContain(reveal.epithet);
          expect(GODS[reveal.god].rivals).toContain(reveal.rivalGod);
          expect(reveal.reason.length).toBeGreaterThan(20);
        }
      }
    }
  });

  test("no reason mentions the player's body or appearance", () => {
    const told = [
      ...Object.values(STANCE_FRAMES).map((frame) => offlineReveal({ ...NO_CUE, frame }).reason),
      ...COLOURS.map(([, tint]) => offlineReveal({ ...NO_CUE, tint }).reason),
      ...Array.from({ length: 50 }, (_, seed) => offlineReveal({ ...NO_CUE, seed }).reason),
    ];
    for (const reason of [...ALL_REASONS, ...told]) {
      expect(bannedIn(reason), reason).toEqual([]);
      // One sentence: a single full stop, at the end.
      expect(reason.indexOf("."), reason).toBe(reason.length - 1);
    }
    expect(bannedIn("A broad frame and a handsome face.")).toEqual(["frame", "face", "broad", "handsome"]);
  });
});

describe("clothing tint", () => {
  const WIDTH = 64;
  const HEIGHT = 48;
  // The player stands left of centre in the mirrored picture, so right of centre in the raw camera picture.
  const player = frameAt(0, {
    [J.leftShoulder]: [0.2, 0.35], [J.rightShoulder]: [0.36, 0.35],
    [J.leftHip]: [0.23, 0.65], [J.rightHip]: [0.33, 0.65],
  });

  /** A red picture with a blue shirt painted over the raw-picture columns from..to (0..1). */
  function picture(from: number, to: number): PixelGrid {
    const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const shirt = x >= from * WIDTH && x < to * WIDTH;
        data.set(shirt ? [20, 60, 200, 255] : [200, 20, 20, 255], (y * WIDTH + x) * 4);
      }
    }
    return { data, width: WIDTH, height: HEIGHT };
  }

  test("averages the torso, un-mirroring the pose onto the raw camera picture", () => {
    expect(clothingTint(picture(0.6, 0.84), player)).toEqual([20, 60, 200]);
    expect(clothingTint(picture(0.6, 0.84), player, { mirrored: true })).toEqual([200, 20, 20]);
    expect(clothingTint(picture(0.16, 0.4), player, { mirrored: true })).toEqual([20, 60, 200]);
  });

  test("still finds the chest when the hips are out of view", () => {
    expect(clothingTint(picture(0.6, 0.84), hide(player, [J.leftHip, J.rightHip]))).toEqual([20, 60, 200]);
  });

  test("feeds the reveal: a blue shirt and no stance is Poseidon", () => {
    const tint = clothingTint(picture(0.6, 0.84), player);
    expect(offlineReveal({ frame: player, tint, seed: 5 }).god).toBe("poseidon");
  });

  test("gives null rather than throwing when there is nothing to read", () => {
    const grid = picture(0, 1);
    expect(clothingTint(grid, null)).toBeNull();
    expect(clothingTint(grid, { t: 0, image: [], world: [] })).toBeNull();
    expect(clothingTint(grid, hide(player, [J.leftShoulder]))).toBeNull();
    expect(clothingTint({ data: new Uint8ClampedArray(0), width: WIDTH, height: HEIGHT }, player)).toBeNull();
    expect(clothingTint({ data: grid.data, width: 0, height: 0 }, player)).toBeNull();
    expect(clothingTint({ data: grid.data, width: NaN, height: 4.5 }, player)).toBeNull();
    expect(clothingTint({ data: new Uint8ClampedArray(WIDTH * HEIGHT * 4), width: WIDTH, height: HEIGHT }, player)).toBeNull();
  });
});
