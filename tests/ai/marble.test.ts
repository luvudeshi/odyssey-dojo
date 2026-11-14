// Checks the marble portrait's pure maths: size, determinism, stone tones, exposure, the gilded rim, the dark vignette,
// the crop and its mirroring, the blank-frame check, the gilding colour and the wreath's leaves.
import { expect, test } from "vitest";
import { gilded, headIsFramed, isBlank, laurelBranch, marbleize, portraitCrop, sourceX } from "../../src/ai/gods/marble";
import type { Pixels, PortraitPose } from "../../src/ai/gods/marble";

const INK = [20, 12, 34] as const;
/** Mean of the three channels of the darkest and the lightest stone. */
const SHADOW_LEVEL = (68 + 76 + 100) / 3;
const WHITE_LEVEL = (248 + 243 + 230) / 3;

/** A picture whose colour comes from a function of the pixel position. */
function picture(width: number, height: number, colour: (x: number, y: number) => readonly [number, number, number]): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set([...colour(x, y), 255], (y * width + x) * 4);
  }
  return { data, width, height };
}

function flat(size: number, value: number): Pixels {
  return picture(size, size, () => [value, value, value]);
}

function pixelAt(pixels: Pixels, x: number, y: number): readonly [number, number, number, number] {
  const at = (y * pixels.width + x) * 4;
  const [r = -1, g = -1, b = -1, a = -1] = pixels.data.subarray(at, at + 4);
  return [r, g, b, a];
}

/** Every pixel well inside the lit ellipse. */
function middle(pixels: Pixels): (readonly [number, number, number, number])[] {
  const found = [];
  for (let y = Math.floor(pixels.height * 0.35); y < pixels.height * 0.65; y++) {
    for (let x = Math.floor(pixels.width * 0.35); x < pixels.width * 0.65; x++) found.push(pixelAt(pixels, x, y));
  }
  return found;
}

function brightness(pixels: Pixels): number {
  const inside = middle(pixels);
  return inside.reduce((sum, [r, g, b]) => sum + r + g + b, 0) / (inside.length * 3);
}

function median(values: readonly number[]): number {
  return [...values].sort((a, b) => a - b)[values.length >> 1] ?? Number.NaN;
}

/** Median red of the pixels that `where` picks, given each pixel's position as -1..1 from the centre. Veins are too thin to move it. */
function medianRed(pixels: Pixels, where: (dx: number, dy: number) => boolean): number {
  const found = [];
  for (let y = 0; y < pixels.height; y++) {
    for (let x = 0; x < pixels.width; x++) {
      if (where(((x + 0.5) / pixels.width - 0.5) * 2, ((y + 0.5) / pixels.height - 0.5) * 2)) found.push(pixelAt(pixels, x, y)[0]);
    }
  }
  return median(found);
}

/** How lit a pixel is, 0 at ink and 1 at `full`, judged on the red channel. */
function litShare(red: number, full: number): number {
  return (red - INK[0]) / (full - INK[0]);
}

/** Repeatable noise, -1..1. */
function jitter(x: number, y: number): number {
  return (((x * 73856093) ^ (y * 19349663)) >>> 0) % 201 / 100 - 1;
}

test("the result is a new picture of the same size with full alpha, and the input is untouched", () => {
  const input = picture(48, 32, (x, y) => [x * 5, y * 7, (x + y) * 3]);
  const before = input.data.slice();
  const output = marbleize(input);
  expect(output.width).toBe(48);
  expect(output.height).toBe(32);
  expect(output.data.length).toBe(48 * 32 * 4);
  expect(output.data).not.toBe(input.data);
  expect(input.data).toEqual(before);
  for (let i = 3; i < output.data.length; i += 4) expect(output.data[i]).toBe(255);
});

test("empty and one-pixel pictures do not throw", () => {
  expect(marbleize({ data: new Uint8ClampedArray(0), width: 0, height: 0 }).data.length).toBe(0);
  expect(pixelAt(marbleize(flat(1, 200)), 0, 0)[3]).toBe(255);
  expect(marbleize({ data: new Uint8ClampedArray(0), width: 4, height: 4 }).data.length).toBe(64);
});

test("the same seed gives the same stone and another seed gives different veins", () => {
  const input = flat(64, 150);
  const first = marbleize(input, { seed: 7 });
  expect(marbleize(input, { seed: 7 }).data).toEqual(first.data);
  expect(marbleize(input).data).toEqual(marbleize(input).data);
  expect(marbleize(input, { seed: 8 }).data).not.toEqual(first.data);
});

test("flat grey becomes neutral stone inside the ellipse: no strong colour cast", () => {
  for (const [r, g, b] of middle(marbleize(flat(64, 128), { seed: 3 }))) {
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(24);
    expect(Math.min(r, g, b)).toBeGreaterThan(100);
    expect(Math.max(r, g, b)).toBeLessThan(225);
  }
});

test("a brighter flat picture gives brighter stone", () => {
  const levels = [10, 60, 110, 160, 210, 250].map((value) => brightness(marbleize(flat(64, value), { seed: 3 })));
  for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeGreaterThan(levels[i - 1] ?? Infinity);
});

test("a seed with a fraction still picks its own veins, and a useless seed does not throw", () => {
  const input = flat(64, 150);
  expect(marbleize(input, { seed: 0.1 }).data).not.toEqual(marbleize(input, { seed: 0.9 }).data);
  expect(marbleize(input, { seed: 0.1 }).data).toEqual(marbleize(input, { seed: 0.1 }).data);
  expect(marbleize(input, { seed: 7.5 }).data).not.toEqual(marbleize(input, { seed: 7 }).data);
  for (const seed of [Number.NaN, Number.POSITIVE_INFINITY, -3.25, 1e15]) {
    expect(marbleize(input, { seed }).data.length).toBe(64 * 64 * 4);
  }
});

test("a dim photo is exposed half-way up, so a dark room still gives pale stone", () => {
  // Uncorrected, flat 64 would sit at about a third of the way from shadow to white.
  const share = (brightness(marbleize(flat(64, 64), { seed: 3 })) - SHADOW_LEVEL) / (WHITE_LEVEL - SHADOW_LEVEL);
  expect(share).toBeGreaterThan(0.39);
  expect(share).toBeLessThan(0.55);
});

test("a bright face in a dark room keeps its shading and never burns out to white", () => {
  // A head-sized disc, lit from the right, in front of a wall that is far darker than the skin.
  const size = 128;
  const input = picture(size, size, (x, y) => {
    const dx = (x + 0.5 - size / 2) / (size * 0.14);
    const dy = (y + 0.5 - size * 0.42) / (size * 0.19);
    const value = dx * dx + dy * dy < 1 ? 160 + 28 * dx : 18;
    return [value, value, value];
  });
  const output = marbleize(input, { seed: 3 });
  const row = Math.floor(size * 0.42);
  const cheek = (from: number, to: number): number => {
    const found = [];
    for (let y = row - 4; y <= row + 4; y++) {
      for (let x = Math.round(size * from); x < size * to; x++) found.push(pixelAt(output, x, y)[0]);
    }
    return median(found);
  };
  const dark = cheek(0.4, 0.43);
  const bright = cheek(0.57, 0.6);
  expect(bright - dark).toBeGreaterThanOrEqual(10);
  expect(dark).toBeGreaterThan(150);
  for (let i = 0; i < output.data.length; i += 4) expect(output.data[i]).toBeLessThan(244);
});

test("a smooth ramp stays smooth: gently carved, with no hard steps and no flat bands", () => {
  const size = 256;
  const output = marbleize(picture(size, size, (x) => [x, x, x]), { seed: 1, wide: true });
  // The fully lit part. Every row is the same picture and veins only darken, so the brightest pixel of a column has no vein in it.
  const profile = [];
  for (let x = Math.floor(size * 0.3); x < size * 0.7; x++) {
    let brightest = 0;
    for (let y = Math.floor(size * 0.35); y < size * 0.65; y++) brightest = Math.max(brightest, pixelAt(output, x, y)[0]);
    profile.push(brightest);
  }
  expect(new Set(profile).size).toBeGreaterThanOrEqual(40);
  for (let i = 1; i < profile.length; i++) expect(profile[i]).toBeGreaterThanOrEqual((profile[i - 1] ?? 0) - 1);
  const rises = [];
  for (let i = 16; i < profile.length; i++) rises.push((profile[i] ?? 0) - (profile[i - 16] ?? 0));
  expect(Math.min(...rises)).toBeGreaterThanOrEqual(4);
  expect(Math.max(...rises)).toBeLessThanOrEqual(24);
  // Carved, not a plain gradient: after a shallow shelf the slope picks up again.
  let shallowest = Infinity;
  let pickUp = 0;
  for (const rise of rises) {
    shallowest = Math.min(shallowest, rise);
    pickUp = Math.max(pickUp, rise - shallowest);
  }
  expect(pickUp).toBeGreaterThanOrEqual(5);
});

test("a small feature is lifted against its surroundings, beyond what its own darkness gives", () => {
  const size = 96;
  const centre = size / 2;
  const sum = (pixels: Pixels): number => pixelAt(pixels, centre, centre).slice(0, 3).reduce((total, channel) => total + channel, 0);
  const patched = picture(size, size, (x, y) => (Math.abs(x - centre) <= 3 && Math.abs(y - centre) <= 3 ? [115, 115, 115] : [128, 128, 128]));
  const field = sum(marbleize(flat(size, 128), { seed: 3 }));
  const feature = field - sum(marbleize(patched, { seed: 3 }));
  // A whole picture that much darker is exposed half-way back, so the same darkness without the lift is worth twice this.
  const plain = 2 * (field - sum(marbleize(flat(size, 115), { seed: 3 })));
  expect(plain).toBeGreaterThan(10);
  expect(feature).toBeGreaterThan(plain * 1.15);
});

test("webcam noise is not gilded: stone without a real edge is the same whatever the accent", () => {
  const noisy = picture(64, 64, (x, y) => {
    const value = 128 + Math.round(6 * jitter(x, y));
    return [value, value, value];
  });
  expect(middle(marbleize(noisy, { accent: [255, 0, 0] }))).toEqual(middle(marbleize(noisy, { accent: [0, 0, 255] })));
});

test("a picture too small to have neighbours on every side is not rimmed along its border", () => {
  const untinted = (pixels: Pixels, x: number, y: number): void => {
    const [r, g, b] = pixelAt(pixels, x, y);
    expect(r - Math.max(g, b), JSON.stringify({ x, y, r, g, b })).toBeLessThanOrEqual(12);
  };
  const strip = marbleize(picture(16, 4, () => [128, 128, 128]), { accent: [255, 0, 0] });
  for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) untinted(strip, x, y);
  // Three columns, dark to bright: the outer ones have no neighbour on one side, so only the middle one may carry the rim.
  const post = marbleize(picture(3, 16, (x) => [40 + x * 80, 40 + x * 80, 40 + x * 80]), { accent: [255, 0, 0], wide: true });
  for (let y = 0; y < 16; y++) {
    untinted(post, 0, y);
    untinted(post, 2, y);
  }
  // Nor does the smoothing reach round the end of a row: the dark side stays dark and the step between them stays an edge.
  for (let y = 6; y < 10; y++) {
    expect(pixelAt(post, 2, y)[0] - pixelAt(post, 0, y)[0]).toBeGreaterThan(30);
    const [r, g, b] = pixelAt(post, 1, y);
    expect(r - Math.max(g, b)).toBeGreaterThan(60);
  }
});

test("the bust light is full on the head and neck, half gone at the shoulders, and wide light reaches further", () => {
  const input = flat(128, 128);
  const bust = marbleize(input, { seed: 3 });
  const core = medianRed(bust, (dx, dy) => dx * dx + dy * dy < 0.02);
  // The head and neck: out to about a third of the half-width and half of the half-height.
  const head = medianRed(bust, (dx, dy) => {
    const distance = (dx / 0.7) ** 2 + (dy / 0.98) ** 2;
    return distance > 0.19 && distance < 0.24;
  });
  expect(Math.abs(head - core)).toBeLessThanOrEqual(4);
  const shoulder = (dx: number, dy: number): boolean => Math.abs(Math.abs(dx) - 0.56) < 0.03 && Math.abs(dy) < 0.15;
  const dimmed = litShare(medianRed(bust, shoulder), core);
  expect(dimmed).toBeGreaterThan(0.3);
  expect(dimmed).toBeLessThan(0.65);
  expect(litShare(medianRed(marbleize(input, { seed: 3, wide: true }), shoulder), core)).toBeGreaterThan(0.85);
});

test("the corners fall to the ink colour, whatever the photo", () => {
  for (const input of [flat(64, 255), picture(80, 48, (x, y) => [x * 3, 255 - y * 5, 128])]) {
    const output = marbleize(input);
    const right = output.width - 1;
    const bottom = output.height - 1;
    for (const [x, y] of [[0, 0], [right, 0], [0, bottom], [right, bottom]] as const) {
      pixelAt(output, x, y).slice(0, 3).forEach((channel, c) => {
        expect(Math.abs(channel - (INK[c] ?? 0))).toBeLessThanOrEqual(4);
      });
    }
  }
});

test("a hard edge is rimmed in the accent colour and flat stone beside it is not", () => {
  const input = picture(64, 64, (x) => (x < 32 ? [40, 40, 40] : [220, 220, 220]));
  const [edgeR, edgeG, edgeB] = pixelAt(marbleize(input, { accent: [255, 0, 0] }), 32, 32);
  expect(edgeR - Math.max(edgeG, edgeB)).toBeGreaterThan(60);
  const [r, g, b] = pixelAt(marbleize(input, { accent: [255, 0, 0] }), 40, 32);
  expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(24);
});

function expectInside(width: number, height: number, pose: PortraitPose | null): void {
  const crop = portraitCrop(width, height, pose);
  const label = JSON.stringify({ width, height, pose, crop });
  expect(Number.isInteger(crop.x) && Number.isInteger(crop.y) && Number.isInteger(crop.size), label).toBe(true);
  expect(crop.size, label).toBeGreaterThan(0);
  expect(crop.x, label).toBeGreaterThanOrEqual(0);
  expect(crop.y, label).toBeGreaterThanOrEqual(0);
  expect(crop.x + crop.size, label).toBeLessThanOrEqual(width);
  expect(crop.y + crop.size, label).toBeLessThanOrEqual(height);
}

/** A person facing the camera with their nose at the given spot. */
function poseAt(x: number, y: number, shoulderWidth = 0.16): PortraitPose {
  return {
    nose: { x, y },
    leftShoulder: { x: x - shoulderWidth / 2, y: y + 0.15 },
    rightShoulder: { x: x + shoulderWidth / 2, y: y + 0.15 },
  };
}

test("the crop is a centred square with no pose or a useless one", () => {
  expect(portraitCrop(640, 480, null)).toEqual({ x: 80, y: 0, size: 480 });
  expect(portraitCrop(480, 640, null)).toEqual({ x: 0, y: 80, size: 480 });
  const point = { x: 0.5, y: 0.5 };
  expect(portraitCrop(640, 480, { nose: point, leftShoulder: point, rightShoulder: point })).toEqual({ x: 80, y: 0, size: 480 });
  const broken = { x: Number.NaN, y: Number.POSITIVE_INFINITY };
  expect(portraitCrop(640, 480, { nose: broken, leftShoulder: broken, rightShoulder: broken })).toEqual({ x: 80, y: 0, size: 480 });
  expect(portraitCrop(0, 0, poseAt(0.5, 0.2))).toEqual({ x: 0, y: 0, size: 0 });
});

test("the crop holds the head and shoulders with headroom above the nose", () => {
  const pose = poseAt(0.5, 0.3);
  const crop = portraitCrop(640, 480, pose);
  expectInside(640, 480, pose);
  expect(crop.size).toBeLessThan(480);
  expect(crop.x).toBeLessThan(pose.leftShoulder.x * 640);
  expect(crop.x + crop.size).toBeGreaterThan(pose.rightShoulder.x * 640);
  expect(crop.y + crop.size).toBeGreaterThan(pose.leftShoulder.y * 480);
  const headroom = (pose.nose.y * 480 - crop.y) / crop.size;
  expect(headroom).toBeGreaterThan(0.2);
  expect(headroom).toBeLessThan(0.45);
  expect(Math.abs(crop.x + crop.size / 2 - 320)).toBeLessThanOrEqual(1);
});

/** People facing the camera at fight distance: broad, average and narrow shoulders for the same head. */
const BUILDS = [[0.16, 0.15], [0.2, 0.14], [0.14, 0.12]] as const;

function build(shoulderWidth: number, drop: number): PortraitPose {
  return {
    nose: { x: 0.5, y: 0.3 },
    leftShoulder: { x: 0.5 - shoulderWidth / 2, y: 0.3 + drop },
    rightShoulder: { x: 0.5 + shoulderWidth / 2, y: 0.3 + drop },
  };
}

test("the crop is tight: the shoulders span most of it and sit in its lower half", () => {
  for (const [shoulderWidth, drop] of BUILDS) {
    const pose = build(shoulderWidth, drop);
    const crop = portraitCrop(640, 480, pose);
    const label = JSON.stringify({ shoulderWidth, drop, crop });
    const shoulders = (shoulderWidth * 640) / crop.size;
    expect(shoulders, label).toBeGreaterThan(0.5);
    expect(shoulders, label).toBeLessThanOrEqual(0.67);
    const shoulderLine = (pose.leftShoulder.y * 480 - crop.y) / crop.size;
    expect(shoulderLine, label).toBeGreaterThan(0.6);
    expect(shoulderLine, label).toBeLessThan(0.85);
    expect(headIsFramed(640, 480, pose), label).toBe(true);
  }
});

test("the head counts as framed only when the crop could be centred on it", () => {
  expect(headIsFramed(640, 480, poseAt(0.5, 0.3))).toBe(true);
  expect(headIsFramed(640, 480, poseAt(0.3, 0.4))).toBe(true);
  expect(headIsFramed(640, 480, null)).toBe(false);
  const point = { x: 0.5, y: 0.5 };
  expect(headIsFramed(640, 480, { nose: point, leftShoulder: point, rightShoulder: point })).toBe(false);
  const broken = { x: Number.NaN, y: Number.NaN };
  expect(headIsFramed(640, 480, { nose: broken, leftShoulder: broken, rightShoulder: broken })).toBe(false);
  expect(headIsFramed(0, 0, poseAt(0.5, 0.3))).toBe(false);
  // Pushed aside by the picture's edge: the head is no longer under the opening.
  expect(headIsFramed(640, 480, poseAt(0.02, 0.3))).toBe(false);
  expect(headIsFramed(640, 480, poseAt(0.5, 0.01))).toBe(false);
  // So close that the crop is the whole centred square, with the head off to one side of it.
  expect(headIsFramed(640, 480, poseAt(0.75, 0.3, 0.9))).toBe(false);
});

test("a mirrored crop is taken from the other side of the source", () => {
  const left = { x: 0, y: 10, size: 100 };
  expect(sourceX(640, left, true)).toBe(540);
  expect(sourceX(640, left, false)).toBe(0);
  expect(sourceX(640, { x: 540, y: 10, size: 100 }, true)).toBe(0);
  expect(sourceX(640.9, { x: 80, y: 0, size: 480 }, true)).toBe(80);
  for (const pose of [poseAt(0.1, 0.3), poseAt(0.9, 0.3), null]) {
    const crop = portraitCrop(640, 480, pose);
    const from = sourceX(640, crop, true);
    expect(from).toBeGreaterThanOrEqual(0);
    expect(from + crop.size).toBeLessThanOrEqual(640);
  }
  // The player's left in the mirror is the camera's right.
  expect(sourceX(640, portraitCrop(640, 480, poseAt(0.1, 0.3)), true)).toBeGreaterThan(320);
});

test("a frame with no picture in it is blank, and any real picture is not", () => {
  const size = 64;
  expect(isBlank({ data: new Uint8ClampedArray(size * size * 4), width: size, height: size })).toBe(true);
  expect(isBlank({ data: new Uint8ClampedArray(0), width: 0, height: 0 })).toBe(true);
  expect(isBlank(flat(size, 0))).toBe(true);
  expect(isBlank(picture(size, size, (x, y) => [3 + (x % 3), 3 + (y % 3), 5]))).toBe(true);
  expect(isBlank(flat(size, 128))).toBe(false);
  expect(isBlank(flat(size, 12))).toBe(false);
  // A dark room with one lit face in it.
  expect(isBlank(picture(size, size, (x, y) => (Math.hypot(x - 40, y - 20) < 8 ? [150, 120, 100] : [2, 2, 3])))).toBe(false);
});

test("the gilding is warm gold for every god, cool accents included, and still differs between gods", () => {
  const cool = [[0x3f, 0xd0, 0xe0], [0x8f, 0xe8, 0xa4], [0x3a, 0xa0, 0xff], [0, 0, 255]] as const;
  for (const accent of cool) {
    const [r, g, b] = gilded(accent);
    const label = JSON.stringify({ accent, r, g, b });
    expect(r - g, label).toBeGreaterThanOrEqual(12);
    expect(g - b, label).toBeGreaterThanOrEqual(50);
    expect(r, label).toBeGreaterThan(190);
  }
  expect(gilded([232, 184, 74])).toEqual([232, 184, 74]);
  const warm = gilded([224, 64, 64]);
  const cold = gilded([0x3f, 0xd0, 0xe0]);
  expect(Math.max(...warm.map((channel, c) => Math.abs(channel - (cold[c] ?? 0))))).toBeGreaterThanOrEqual(15);
});

/** Both ends of every leaf of both branches, in portrait widths from the centre. */
function leafEnds(crowned: boolean): { x: number; y: number }[] {
  return laurelBranch(crowned).leaves.flatMap((leaf) => {
    const tip = { x: leaf.x + Math.cos(leaf.angle) * leaf.length, y: leaf.y + Math.sin(leaf.angle) * leaf.length };
    return [{ x: leaf.x, y: leaf.y }, tip, { x: -leaf.x, y: leaf.y }, { x: -tip.x, y: tip.y }];
  });
}

test("the crown meets at the bottom, is open above the head, and stays inside the ring and outside the head", () => {
  const ends = leafEnds(true);
  expect(Math.min(...ends.map(({ x, y }) => Math.hypot(x, y - 0.405)))).toBeLessThan(0.06);
  expect(Math.min(...ends.map(({ y }) => y))).toBeLessThan(-0.33);
  for (const { x, y } of ends) {
    const label = JSON.stringify({ x, y });
    expect(Math.hypot(x, y), label).toBeLessThan(0.47);
    expect(Math.hypot(x, y), label).toBeGreaterThan(0.35);
    if (y < -0.3) expect(Math.abs(x), label).toBeGreaterThan(0.1);
  }
});

test("no leaf of the crown lies over a framed head", () => {
  const ends = leafEnds(true);
  for (const [shoulderWidth, drop] of BUILDS) {
    const crop = portraitCrop(640, 480, build(shoulderWidth, drop));
    // The head as an ellipse in crop widths from the centre: its crown is about 0.65 of the nose-to-shoulder drop above the nose,
    // its chin 0.4 of it below, and it is about 0.45 shoulder widths across.
    const nose = (0.3 * 480 - crop.y) / crop.size - 0.5;
    const crown = nose - (0.65 * drop * 480) / crop.size;
    const chin = nose + (0.4 * drop * 480) / crop.size;
    const halfWidth = (0.45 * shoulderWidth * 640) / crop.size / 2;
    for (const { x, y } of ends) {
      const inside = (x / halfWidth) ** 2 + ((y - (crown + chin) / 2) / ((chin - crown) / 2)) ** 2;
      expect(inside, JSON.stringify({ shoulderWidth, drop, crop, x, y })).toBeGreaterThan(1.2);
    }
  }
});

test("without a framed head the branches only cradle the lower half, where no face can be", () => {
  const ends = leafEnds(false);
  expect(ends.length).toBeGreaterThanOrEqual(20);
  expect(Math.min(...ends.map(({ x, y }) => Math.hypot(x, y - 0.405)))).toBeLessThan(0.06);
  for (const { x, y } of ends) {
    expect(y, JSON.stringify({ x, y })).toBeGreaterThan(-0.08);
    expect(Math.hypot(x, y)).toBeLessThan(0.47);
  }
  expect(laurelBranch(false).end).toBeGreaterThan(laurelBranch(true).end);
});

test("the crop stays inside the image for landmarks near and past every edge", () => {
  const spots = [-0.3, 0, 0.02, 0.5, 0.98, 1, 1.3];
  for (const [width, height] of [[640, 480], [480, 640], [1280, 720], [33, 17]] as const) {
    expectInside(width, height, null);
    for (const x of spots) {
      for (const y of spots) {
        for (const shoulderWidth of [0.01, 0.16, 0.6, 3]) expectInside(width, height, poseAt(x, y, shoulderWidth));
      }
    }
  }
});
