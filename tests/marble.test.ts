// Checks the marble portrait's pixel maths: size, determinism, stone tones, the gilded rim, the dark vignette and the crop.
import { expect, test } from "vitest";
import { marbleize, portraitCrop } from "../src/gods/marble";
import type { Pixels, PortraitPose } from "../src/gods/marble";

const INK = [20, 12, 34] as const;

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
