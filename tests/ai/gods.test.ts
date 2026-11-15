// Guards the gods' data and the offline god scan: stance, colour and seed cues, determinism, and what a reason may say.
import { describe, expect, test } from "vitest";
import type { PoseFrame } from "../../src/core/types";
import { GODS, GOD_IDS } from "../../src/ai/gods/gods";
import type { GodId } from "../../src/ai/gods/gods";
import { clothingTint, lotReason, offlineReveal } from "../../src/ai/gods/offlineReveal";
import type { RevealCues } from "../../src/ai/gods/offlineReveal";
import { STANCES, readStance } from "../../src/ai/gods/stance";
import type { StanceId } from "../../src/ai/gods/stance";
import { TINTS, tintId } from "../../src/ai/gods/tint";
import type { PixelGrid, Tint } from "../../src/ai/gods/tint";
import { JOINT } from "../../src/pose/signals";
import { frameAt } from "../poseFixture";

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
  "strong", "strength", "powerful", "mighty", "athletic", "fit", "lean", "graceful", "elegant", "striking", "stunning",
  "mature", "feminine", "masculine", "beard", "lips", "nose", "waist", "torso", "back", "wrist", "elbow",
];
// An epithet describes the god, but a card may print it beside the player's name, so epithets are held to the same
// list plus the titles that carry a gender. (A reason may still say "the lord of thunder": that is plainly the god.)
const BANNED_IN_EPITHETS = [
  ...BANNED,
  "lord", "lady", "king", "queen", "master", "mistress", "hunter", "huntress", "goddess", "father", "mother", "brother",
  "sister", "maiden",
];
// The one exception: "grey-eyed" is Athena's fixed Homeric title (glaukopis) and the example the brief itself gives.
const EPITHETS_ALLOWED: Partial<Record<GodId, readonly string[]>> = { athena: ["eyed"] };

function bannedIn(text: string, banned: readonly string[] = BANNED): readonly string[] {
  const words = new Set(text.toLowerCase().match(/[a-z']+/g) ?? []);
  return banned.filter((word) => words.has(word));
}

/**
 * A whole player in the picture, standing easy with real proportions: the knees 0.9 of the torso's height below the
 * hips and the feet under them. frameAt alone has no legs, so the leg rules never run on it.
 */
function standing(
  image: Record<number, readonly [number, number]> = {},
  world: Record<number, readonly [number, number, number]> = {},
): PoseFrame {
  return frameAt(
    0,
    {
      [J.nose]: [0.5, 0.12],
      [J.leftShoulder]: [0.44, 0.22], [J.rightShoulder]: [0.56, 0.22],
      [J.leftElbow]: [0.42, 0.33], [J.rightElbow]: [0.58, 0.33],
      [J.leftWrist]: [0.42, 0.43], [J.rightWrist]: [0.58, 0.43],
      [J.leftHip]: [0.46, 0.44], [J.rightHip]: [0.54, 0.44],
      [J.leftKnee]: [0.46, 0.64], [J.rightKnee]: [0.54, 0.64],
      [J.leftAnkle]: [0.46, 0.84], [J.rightAnkle]: [0.54, 0.84],
      ...image,
    },
    world,
  );
}

// The whole upper half moved 0.08 to one side of the hips: a body tipping over.
const TIPPED: Record<number, readonly [number, number]> = {
  [J.nose]: [0.58, 0.12],
  [J.leftShoulder]: [0.52, 0.22], [J.rightShoulder]: [0.64, 0.22],
  [J.leftElbow]: [0.5, 0.33], [J.rightElbow]: [0.66, 0.33],
  [J.leftWrist]: [0.5, 0.43], [J.rightWrist]: [0.66, 0.43],
};

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
  wideStance: standing({
    [J.leftKnee]: [0.4, 0.63], [J.rightKnee]: [0.6, 0.63],
    [J.leftAnkle]: [0.36, 0.83], [J.rightAnkle]: [0.64, 0.83],
  }),
  // A half squat: the knees 0.6 of the torso's height below the hips.
  crouch: standing({
    [J.leftKnee]: [0.44, 0.572], [J.rightKnee]: [0.56, 0.572],
    [J.leftAnkle]: [0.45, 0.76], [J.rightAnkle]: [0.55, 0.76],
  }),
  lean: frameAt(0, {
    [J.nose]: [0.6, 0.21],
    [J.leftShoulder]: [0.5, 0.36], [J.rightShoulder]: [0.66, 0.36],
    [J.leftElbow]: [0.5, 0.5], [J.rightElbow]: [0.68, 0.5],
    [J.leftWrist]: [0.5, 0.62], [J.rightWrist]: [0.68, 0.62],
  }),
  midStep: standing({ [J.rightKnee]: [0.55, 0.58], [J.rightAnkle]: [0.54, 0.7] }),
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
  ["white under warm light", [230, 215, 190], "athena"],
  ["grey", [128, 128, 132], "athena"],
  ["green", [40, 160, 60], "artemis"],
  ["red", [200, 30, 40], "zeus"],
  ["purple", [120, 40, 180], "zeus"],
  ["black", [14, 14, 18], "hermes"],
  ["webcam black", [40, 42, 54], "hermes"],
];

// Weak warm colours are no cue. They are not gold or red, and they are also the range of skin, which must never
// decide a line about what the player wears.
const NO_COLOUR: readonly (readonly [string, Tint])[] = [
  ["beige", [200, 170, 140]],
  ["khaki", [150, 140, 100]],
  ["brown", [120, 80, 50]],
  ["pink", [240, 150, 180]],
  ["faded orange", [224, 172, 105]],
  ["sand", [241, 194, 125]],
  ["cream", [255, 219, 172]],
  ["umber", [141, 85, 36]],
  ["tan", [198, 134, 66]],
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
    // Athena coaches the player, so she is in nobody's list: Poseidon's first rival is Zeus (Iliad 15).
    expect(GODS.poseidon.rivals[0]).toBe("zeus");
  });

  test("no epithet would read as a remark on the player's body, looks or gender", () => {
    for (const id of GOD_IDS) {
      const allowed = EPITHETS_ALLOWED[id] ?? [];
      for (const epithet of GODS[id].epithets) {
        expect(bannedIn(epithet, BANNED_IN_EPITHETS).filter((word) => !allowed.includes(word)), epithet).toEqual([]);
      }
    }
    expect(bannedIn("the huntress", BANNED_IN_EPITHETS)).toEqual(["huntress"]);
    expect(bannedIn("daughter of aegis-bearing Zeus", BANNED_IN_EPITHETS)).toEqual(["daughter"]);
  });

  test("Apollo is not the sun and Artemis is not the moon, outside the fixed power names", () => {
    const copy = [
      ...(["apollo", "artemis"] as const).flatMap((id) => [GODS[id].domain, GODS[id].odyssey, ...GODS[id].epithets]),
      ...ALL_REASONS,
    ];
    for (const text of copy) expect(text, text).not.toMatch(/\b(sun|sunlit|solar|moon|moonlit|lunar)\b/i);
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

  test("an archer is read with either arm forward, and when the bow points at the camera with the string hand back", () => {
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

  test("a jab at the camera from a guard is a fighter's guard, not a drawn bow", () => {
    // The same straight arm at the camera, but the other fist is held out in front of its shoulder, by the chin.
    const jab = frameAt(
      0,
      { [J.leftElbow]: [0.42, 0.37], [J.leftWrist]: [0.43, 0.36], [J.rightElbow]: [0.62, 0.42], [J.rightWrist]: [0.55, 0.3] },
      {
        [J.leftElbow]: [-0.2, -0.5, -0.3], [J.leftWrist]: [-0.2, -0.5, -0.6],
        [J.rightElbow]: [0.24, -0.3, -0.05], [J.rightWrist]: [0.12, -0.52, -0.12],
      },
    );
    expect(readStance(jab)).toBe("guard");
    expect(offlineReveal({ ...NO_CUE, frame: jab }).god).toBe("athena");
  });

  test("hands that leave the top of the picture unseen are still a reach for the sky", () => {
    const up = frameAt(0, {
      [J.leftElbow]: [0.4, 0.1], [J.rightElbow]: [0.6, 0.1],
      [J.leftWrist]: [0.41, -0.08], [J.rightWrist]: [0.59, -0.08],
    });
    const unseen = hide(up, [J.leftWrist, J.rightWrist]);
    expect(readStance(up)).toBe("skyReach");
    expect(readStance(unseen)).toBe("skyReach");
    expect(readStance(hide(unseen, [J.nose]))).toBe("skyReach");
    // Unseen hands with the elbows down say nothing, and one raised elbow is not enough.
    expect(readStance(hide(frameAt(0), [J.leftWrist, J.rightWrist]))).toBeNull();
    expect(readStance(hide(frameAt(0, { [J.leftElbow]: [0.4, 0.1] }), [J.leftWrist, J.rightWrist]))).toBeNull();
  });

  test("standing normally is not a stance, with or without the legs in the picture", () => {
    expect(readStance(frameAt(0))).toBeNull();
    expect(readStance(standing())).toBeNull();
    expect(readStance(null)).toBeNull();
    // An easy stance with the feet a little apart and one knee soft is still just standing.
    const easy = standing({
      [J.leftKnee]: [0.44, 0.63], [J.rightKnee]: [0.56, 0.64],
      [J.leftAnkle]: [0.43, 0.84], [J.rightAnkle]: [0.57, 0.83],
    });
    expect(readStance(easy)).toBeNull();
  });

  test("a lifted knee or a lunge is Hermes, never a low or rooted stance", () => {
    const highKnee = standing({ [J.rightKnee]: [0.54, 0.42], [J.rightAnkle]: [0.54, 0.6] });
    expect(readStance(highKnee)).toBe("midStep");
    expect(readStance(hide(highKnee, [J.leftAnkle, J.rightAnkle]))).toBe("midStep");
    const lunge = standing({
      ...TIPPED,
      [J.leftKnee]: [0.42, 0.64], [J.rightKnee]: [0.62, 0.62],
      [J.leftAnkle]: [0.36, 0.84], [J.rightAnkle]: [0.64, 0.84],
    });
    expect(readStance(lunge)).toBe("lean");
    for (const frame of [highKnee, lunge]) expect(offlineReveal({ ...NO_CUE, frame }).god).toBe("hermes");
  });

  test("a crouch needs both knees up: a half squat and a full squat count, standing does not", () => {
    expect(readStance(STANCE_FRAMES.crouch)).toBe("crouch");
    const fullSquat = standing({
      [J.leftKnee]: [0.43, 0.46], [J.rightKnee]: [0.57, 0.46],
      [J.leftAnkle]: [0.45, 0.66], [J.rightAnkle]: [0.55, 0.66],
    });
    expect(readStance(fullSquat)).toBe("crouch");
    // Knees 0.75 of the torso's height below the hips: a soft bend, not a crouch.
    const softKnees = standing({ [J.leftKnee]: [0.45, 0.605], [J.rightKnee]: [0.55, 0.605] });
    expect(readStance(softKnees)).toBeNull();
  });

  test("legs and hips that MediaPipe guesses past the edge of the picture are not a cue", () => {
    const cutOff = frameAt(0, {
      [J.leftKnee]: [0.4, 1.1], [J.rightKnee]: [0.6, 1.1],
      [J.leftAnkle]: [0.3, 1.4], [J.rightAnkle]: [0.72, 1.4],
    });
    expect(readStance(cutOff)).toBeNull();
    const offSide = standing({ [J.leftAnkle]: [-0.05, 0.84], [J.rightAnkle]: [0.54, 0.84] });
    expect(readStance(offSide)).toBeNull();
    // Hips guessed below the bottom edge and off to one side must not read as a lean, nor their knees as a crouch.
    const closeUp = frameAt(0, {
      [J.nose]: [0.5, 0.45],
      [J.leftShoulder]: [0.4, 0.62], [J.rightShoulder]: [0.6, 0.62],
      [J.leftElbow]: [0.37, 0.8], [J.rightElbow]: [0.63, 0.8],
      [J.leftWrist]: [0.37, 0.95], [J.rightWrist]: [0.63, 0.95],
      [J.leftHip]: [0.55, 1.05], [J.rightHip]: [0.68, 1.05],
      [J.leftKnee]: [0.55, 1.08], [J.rightKnee]: [0.68, 1.08],
    });
    expect(readStance(closeUp)).toBeNull();
    // The same legs inside the picture do count.
    expect(readStance(STANCE_FRAMES.wideStance)).toBe("wideStance");
  });

  test("when two rules match, the earlier one in the brief wins", () => {
    // Hands above the head and close together also sit within guard reach of the face.
    const skyAndGuard = frameAt(0, { [J.leftWrist]: [0.48, 0.08], [J.rightWrist]: [0.52, 0.08] });
    expect(readStance(skyAndGuard)).toBe("skyReach");
    const wideArmsAndLean = standing({ ...TIPPED, [J.leftWrist]: [0.38, 0.23], [J.rightWrist]: [0.78, 0.23] });
    expect(readStance(wideArmsAndLean)).toBe("armsWide");
    const archerOnWideFeet = standing({
      [J.leftElbow]: [0.34, 0.22], [J.leftWrist]: [0.25, 0.22],
      [J.rightElbow]: [0.63, 0.24], [J.rightWrist]: [0.55, 0.23],
      [J.leftAnkle]: [0.36, 0.83], [J.rightAnkle]: [0.64, 0.83],
    });
    expect(readStance(archerOnWideFeet)).toBe("archer");
    const guardInACrouch = standing({
      [J.leftWrist]: [0.47, 0.14], [J.rightWrist]: [0.53, 0.14],
      [J.leftKnee]: [0.44, 0.5], [J.rightKnee]: [0.56, 0.5],
    });
    expect(readStance(guardInACrouch)).toBe("guard");
    const wideAndLow = standing({
      [J.leftKnee]: [0.38, 0.5], [J.rightKnee]: [0.62, 0.5],
      [J.leftAnkle]: [0.36, 0.7], [J.rightAnkle]: [0.64, 0.7],
    });
    expect(readStance(wideAndLow)).toBe("wideStance");
    const crouchWithATilt = standing({
      [J.leftShoulder]: [0.44, 0.2], [J.rightShoulder]: [0.56, 0.25],
      [J.leftKnee]: [0.44, 0.5], [J.rightKnee]: [0.56, 0.5],
    });
    expect(readStance(crouchWithATilt)).toBe("crouch");
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

  test.each(NO_COLOUR)("%s is no colour cue, so the lot decides", (_name, tint) => {
    expect(tintId(tint)).toBeNull();
    const reveal = offlineReveal({ frame: null, tint, seed: 11 });
    expect(reveal).toEqual(offlineReveal({ frame: null, tint: null, seed: 11 }));
    expect(reveal.reason).toBe(lotReason(reveal.god));
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

  test("a seed between 0 and 1, as from Math.random(), still varies the reveal", () => {
    const gods = new Set<GodId>();
    const epithets = new Set<string>();
    for (let step = 0; step < 200; step++) {
      const seed = step / 200;
      const reveal = offlineReveal({ ...NO_CUE, seed });
      expect(offlineReveal({ ...NO_CUE, seed })).toEqual(reveal);
      gods.add(reveal.god);
      epithets.add(offlineReveal({ frame: STANCE_FRAMES.guard, tint: null, seed }).epithet);
    }
    expect(gods).toEqual(new Set(GOD_IDS));
    expect(epithets.size).toBe(GODS.athena.epithets.length);
    expect(offlineReveal({ ...NO_CUE, seed: 41.25 })).not.toEqual(offlineReveal({ ...NO_CUE, seed: 41.75 }));
  });

  test("the epithet and rival come from the god's own lists and vary with the seed", () => {
    const epithets = new Set<string>();
    const rivals = new Map<GodId, number>();
    const seeds = 300;
    for (let seed = 0; seed < seeds; seed++) {
      const reveal = offlineReveal({ frame: STANCE_FRAMES.guard, tint: null, seed });
      expect(GODS.athena.epithets).toContain(reveal.epithet);
      expect(GODS.athena.rivals).toContain(reveal.rivalGod);
      expect(reveal.rivalGod).not.toBe(reveal.god);
      epithets.add(reveal.epithet);
      rivals.set(reveal.rivalGod, (rivals.get(reveal.rivalGod) ?? 0) + 1);
    }
    expect(epithets.size).toBe(GODS.athena.epithets.length);
    expect(rivals.size).toBe(GODS.athena.rivals.length);
    // The best-attested quarrel, Athena against Poseidon over Odysseus, is named more often than the rest together.
    expect(rivals.get("poseidon") ?? 0).toBeGreaterThan(seeds / 2);
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
      ...[...COLOURS, ...NO_COLOUR].map(([, tint]) => offlineReveal({ ...NO_CUE, tint }).reason),
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

  const SHIRT: Tint = [20, 60, 200];
  // Both forearms folded across the chest, along the stripe that picture() can paint.
  const folded = frameAt(0, {
    [J.leftShoulder]: [0.2, 0.35], [J.rightShoulder]: [0.36, 0.35],
    [J.leftHip]: [0.23, 0.65], [J.rightHip]: [0.33, 0.65],
    [J.leftElbow]: [0.18, 0.5], [J.leftWrist]: [0.34, 0.5],
    [J.rightElbow]: [0.38, 0.5], [J.rightWrist]: [0.22, 0.5],
  });

  /**
   * A red picture with a blue shirt painted over the raw-picture columns from..to (0..1), and optionally a stripe of
   * another colour across the chest, three rows high.
   */
  function picture(from: number, to: number, stripe?: Tint): PixelGrid {
    const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const shirt = x >= from * WIDTH && x < to * WIDTH;
        const colour = stripe && y >= 23 && y <= 25 ? stripe : shirt ? SHIRT : [200, 20, 20];
        data.set([...colour, 255], (y * WIDTH + x) * 4);
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

  test("leaves out forearms folded across the chest, which may be bare", () => {
    // A second blue, so only skipping the arms (not the colour families) can keep the answer exact.
    const sleeves = picture(0.6, 0.84, [100, 140, 255]);
    expect(clothingTint(sleeves, folded)).toEqual(SHIRT);
    expect(clothingTint(sleeves, hide(folded, [J.leftElbow, J.rightElbow]))).not.toEqual(SHIRT);
  });

  test("takes the commonest colour family, so a patch of another colour does not shift the shirt", () => {
    for (const patch of [[224, 172, 105], [45, 34, 30], [230, 180, 40]] as const) {
      const tint = clothingTint(picture(0.6, 0.84, patch), player);
      expect(tint).toEqual(SHIRT);
      expect(tintId(tint)).toBe("blue");
    }
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
