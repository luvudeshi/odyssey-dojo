// Turns a photo into a carved marble bust lit in the dark, and holds the portrait's other pure maths:
// the head-and-shoulders crop, mirroring, the blank-frame check, the gilding colour and the wreath's leaves. No DOM.

export interface Pixels {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export interface MarbleOptions {
  /** Colour of the gilded rim on strong edges, 0..255 per channel. Gold when left out. */
  readonly accent?: readonly [number, number, number];
  /** Picks the veining. The same seed always gives the same stone. Any finite number, fractions included. */
  readonly seed?: number;
  /** Light most of the picture, not just a centred bust: for a crop that was not framed on the head. */
  readonly wide?: boolean;
}

export interface Crop {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

export interface PortraitPose {
  readonly nose: { x: number; y: number };
  readonly leftShoulder: { x: number; y: number };
  readonly rightShoulder: { x: number; y: number };
}

type Rgb = readonly [number, number, number];

const INK: Rgb = [20, 12, 34];
const GOLD: Rgb = [232, 184, 74];
const SHADOW_STONE: Rgb = [68, 76, 100];
const LIGHT_STONE: Rgb = [248, 243, 230];

const TONES = 2048;
/** The stone table covers tones up to here, so an overexposed face still has somewhere to go. */
const TONE_TOP = 2;
const TONE_SCALE = (TONES - 1) / TONE_TOP;
/** Above this tone the highlights roll off toward white and never reach it, so a bright face keeps its shading. */
const SHOULDER = 0.6;
const POSTER_LEVELS = 6;
const POSTER_MIX = 0.55;
/** How much of the difference from the local average is added back, so features survive flat lighting. */
const CONTRAST_LIFT = 0.7;
const TARGET_BRIGHTNESS = 0.5;
/** The face is the brightest thing in a dim room: this share of the centre may sit above HIGHLIGHT_LEVEL after the gain. */
const HIGHLIGHT_SHARE = 0.08;
const HIGHLIGHT_LEVEL = 0.72;
const METER_BINS = 64;
const VEIN_SHARPNESS = 13;
const VEIN_DEPTH = 0.16;
const MOTTLE = 0.05;
const EDGE_START = 0.2;
const EDGE_FULL = 0.6;
const EDGE_TINT = 0.7;
/**
 * The lit ellipse, as fractions of half the picture; light fades between the inner and outer distance.
 * The bust light is full on the head and neck and falls off across the shoulders; the wide light is for an unframed crop.
 */
const ELLIPSE_Y = 0.98;
const FADE_OUTER = 1;
const BUST_LIGHT = { ellipseX: 0.7, fadeInner: 0.25 } as const;
const WIDE_LIGHT = { ellipseX: 0.86, fadeInner: 0.36 } as const;

/** Stone colour for every tone 0..TONE_TOP: a lifted, softly stepped ramp from cool shadow to warm white. */
const STONE = ((): Uint8ClampedArray => {
  const table = new Uint8ClampedArray(TONES * 3);
  for (let i = 0; i < TONES; i++) {
    const raw = i / TONE_SCALE;
    // Same value and slope as the straight line at SHOULDER, then bending toward 1.
    const soft = raw > SHOULDER ? 1 - (1 - SHOULDER) ** 2 / (raw - (2 * SHOULDER - 1)) : raw;
    const lifted = 1 - (1 - soft) ** 1.35;
    const step = Math.floor(lifted * POSTER_LEVELS);
    const within = lifted * POSTER_LEVELS - step;
    const carved = (step + within * within * (3 - 2 * within)) / POSTER_LEVELS;
    const tone = lifted + (carved - lifted) * POSTER_MIX;
    for (let c = 0; c < 3; c++) {
      const dark = SHADOW_STONE[c] ?? 0;
      table[i * 3 + c] = dark + ((LIGHT_STONE[c] ?? 0) - dark) * tone;
    }
  }
  return table;
})();

function wholeNumber(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function seededRandom(seed: number): () => number {
  // The fraction is folded in, so Math.random() as a seed still picks a different stone each time.
  let state = Number.isFinite(seed) ? (Math.floor(seed) ^ Math.floor((seed % 1) * 4294967296)) >>> 0 : 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box blur with clamped edges, as two running sums. `target` may be `source`; `scratch` holds the sideways pass. */
function boxBlur(
  source: Float32Array,
  target: Float32Array,
  scratch: Float32Array,
  width: number,
  height: number,
  radius: number,
): void {
  const scale = 1 / (2 * radius + 1);
  for (let y = 0; y < height; y++) {
    const first = y * width;
    const last = first + width - 1;
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += source[Math.min(last, Math.max(first, first + k))] ?? 0;
    for (let x = 0; x < width; x++) {
      const at = first + x;
      scratch[at] = sum * scale;
      const add = at + radius + 1;
      const drop = at - radius;
      sum += (source[add > last ? last : add] ?? 0) - (source[drop < first ? first : drop] ?? 0);
    }
  }
  const sums = new Float32Array(width);
  for (let k = -radius; k <= radius; k++) {
    const row = Math.min(height - 1, Math.max(0, k)) * width;
    for (let x = 0; x < width; x++) sums[x] = (sums[x] ?? 0) + (scratch[row + x] ?? 0);
  }
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const add = Math.min(height - 1, y + radius + 1) * width;
    const drop = Math.max(0, y - radius) * width;
    for (let x = 0; x < width; x++) {
      const sum = sums[x] ?? 0;
      target[row + x] = sum * scale;
      sums[x] = sum + (scratch[add + x] ?? 0) - (scratch[drop + x] ?? 0);
    }
  }
}

/** Adds one layer of smooth value noise, 0..weight, with blobs about `cell` pixels across. */
function addNoise(
  target: Float32Array,
  width: number,
  height: number,
  cell: number,
  weight: number,
  random: () => number,
): void {
  const columns = Math.ceil(width / cell) + 2;
  const grid = new Float32Array(columns * (Math.ceil(height / cell) + 2));
  for (let i = 0; i < grid.length; i++) grid[i] = random() * weight;
  const cellOf = new Int32Array(width);
  const blendOf = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const position = x / cell;
    const whole = Math.floor(position);
    const part = position - whole;
    cellOf[x] = whole;
    blendOf[x] = part * part * (3 - 2 * part);
  }
  for (let y = 0; y < height; y++) {
    const position = y / cell;
    const whole = Math.floor(position);
    const part = position - whole;
    const blendY = part * part * (3 - 2 * part);
    const above = whole * columns;
    const below = above + columns;
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const column = cellOf[x] ?? 0;
      const blendX = blendOf[x] ?? 0;
      const topLeft = grid[above + column] ?? 0;
      const bottomLeft = grid[below + column] ?? 0;
      const top = topLeft + ((grid[above + column + 1] ?? 0) - topLeft) * blendX;
      const bottom = bottomLeft + ((grid[below + column + 1] ?? 0) - bottomLeft) * blendX;
      target[row + x] = (target[row + x] ?? 0) + top + (bottom - top) * blendY;
    }
  }
}

/**
 * Half-way exposure correction, metered on the middle half of the picture, where the face is:
 * a dim room still gives pale stone, but a brighter photo stays brighter.
 * The mean alone is mostly wall and shirt, so the gain is also capped by the brightest part, which is the face.
 */
function exposureGain(light: Float32Array, width: number, height: number): number {
  const left = width >> 2;
  const right = Math.max(left + 1, width - left);
  const top = height >> 2;
  const bottom = Math.max(top + 1, height - top);
  const bins = new Uint32Array(METER_BINS);
  let sum = 0;
  for (let y = top; y < bottom; y++) {
    const row = y * width;
    for (let x = left; x < right; x++) {
      const value = light[row + x] ?? 0;
      sum += value;
      const bin = value >= 1 ? METER_BINS - 1 : Math.floor(value * METER_BINS);
      bins[bin] = (bins[bin] ?? 0) + 1;
    }
  }
  const count = (right - left) * (bottom - top);
  const allowed = count * HIGHLIGHT_SHARE;
  let above = 0;
  let bright = 0;
  for (let bin = METER_BINS - 1; bin >= 0; bin--) {
    const here = bins[bin] ?? 0;
    if (above + here >= allowed) {
      bright = (bin + 1 - (allowed - above) / here) / METER_BINS;
      break;
    }
    above += here;
  }
  const wanted = Math.min(Math.sqrt(TARGET_BRIGHTNESS / Math.max(0.001, sum / count)), HIGHLIGHT_LEVEL / Math.max(0.001, bright));
  return Math.min(1.6, Math.max(0.75, wanted));
}

/**
 * Photo in, marble bust out: same size, alpha 255, the input untouched.
 * Brightness is smoothed and exposed for the face, mapped onto stone colours with faint veins and soft carved steps,
 * strong edges get a thin rim in the accent colour, and everything outside a centred ellipse falls to dark ink.
 */
export function marbleize(pixels: Pixels, options: MarbleOptions = {}): Pixels {
  const width = wholeNumber(pixels.width);
  const height = wholeNumber(pixels.height);
  const count = width * height;
  const source = pixels.data;
  const data = new Uint8ClampedArray(count * 4);
  const result: Pixels = { data, width, height };
  if (count === 0) return result;

  const [accentR, accentG, accentB] = options.accent ?? GOLD;
  const [inkR, inkG, inkB] = INK;
  const shorter = Math.min(width, height);
  const longer = Math.max(width, height);

  // Brightness, lightly smoothed to hide webcam noise, and its wide local average.
  const light = new Float32Array(count);
  const average = new Float32Array(count);
  const scratch = new Float32Array(count);
  for (let i = 0, at = 0; i < count; i++, at += 4) {
    light[i] =
      ((source[at] ?? 0) * 0.299 + (source[at + 1] ?? 0) * 0.587 + (source[at + 2] ?? 0) * 0.114) / 255;
  }
  boxBlur(light, light, scratch, width, height, Math.max(1, Math.round(shorter / 256)));
  const wide = Math.max(1, Math.round(shorter / 20));
  boxBlur(light, average, scratch, width, height, wide);
  boxBlur(average, average, scratch, width, height, wide);

  const gain = exposureGain(light, width, height);

  const random = seededRandom(options.seed ?? 1);
  const noise = scratch.fill(0);
  addNoise(noise, width, height, Math.max(2, longer / 4.5), 0.7, random);
  addNoise(noise, width, height, Math.max(2, longer / 11), 0.3, random);

  const { ellipseX, fadeInner } = options.wide === true ? WIDE_LIGHT : BUST_LIGHT;
  const fadeX = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const offset = ((x + 0.5) / width - 0.5) * 2 / ellipseX;
    fadeX[x] = offset * offset;
  }
  const fadeScale = 1 / (FADE_OUTER - fadeInner);
  const edgeScale = (gain * EDGE_TINT) / (EDGE_FULL - EDGE_START);
  const edgeFloor = (EDGE_START * EDGE_TINT) / (EDGE_FULL - EDGE_START);

  for (let y = 0; y < height; y++) {
    const offsetY = ((y + 0.5) / height - 0.5) * 2 / ELLIPSE_Y;
    const fadeY = offsetY * offsetY;
    const row = y * width;
    const inner = y > 0 && y < height - 1;
    for (let x = 0; x < width; x++) {
      const i = row + x;
      const at = i * 4;
      data[at + 3] = 255;
      const distance = (fadeX[x] ?? 0) + fadeY;
      if (distance >= FADE_OUTER) {
        data[at] = inkR;
        data[at + 1] = inkG;
        data[at + 2] = inkB;
        continue;
      }

      const here = light[i] ?? 0;
      let tone = (here + (here - (average[i] ?? 0)) * CONTRAST_LIFT) * gain;
      const grain = noise[i] ?? 0;
      const vein = 1 - Math.abs(grain - 0.5) * VEIN_SHARPNESS;
      tone += (grain - 0.5) * MOTTLE;
      if (vein > 0) tone -= vein * vein * VEIN_DEPTH * tone;
      const index = (tone <= 0 ? 0 : tone >= TONE_TOP ? TONES - 1 : Math.floor(tone * TONE_SCALE)) * 3;
      let r = STONE[index] ?? 0;
      let g = STONE[index + 1] ?? 0;
      let b = STONE[index + 2] ?? 0;

      if (inner && x > 0 && x < width - 1) {
        const up = i - width;
        const down = i + width;
        const upLeft = light[up - 1] ?? 0;
        const upRight = light[up + 1] ?? 0;
        const downLeft = light[down - 1] ?? 0;
        const downRight = light[down + 1] ?? 0;
        const across = upRight + 2 * (light[i + 1] ?? 0) + downRight - upLeft - 2 * (light[i - 1] ?? 0) - downLeft;
        const along = downLeft + 2 * (light[down] ?? 0) + downRight - upLeft - 2 * (light[up] ?? 0) - upRight;
        const edge = Math.sqrt(across * across + along * along) * edgeScale - edgeFloor;
        if (edge > 0) {
          const tint = edge > EDGE_TINT ? EDGE_TINT : edge;
          r += (accentR - r) * tint;
          g += (accentG - g) * tint;
          b += (accentB - b) * tint;
        }
      }

      if (distance > fadeInner) {
        const through = (distance - fadeInner) * fadeScale;
        const lit = 1 - through * through * (3 - 2 * through);
        r = inkR + (r - inkR) * lit;
        g = inkG + (g - inkG) * lit;
        b = inkB + (b - inkB) * lit;
      }
      data[at] = r;
      data[at + 1] = g;
      data[at + 2] = b;
    }
  }
  return result;
}

/**
 * Shoulder widths and nose-to-shoulder drops that fit in the crop, and where the nose sits from its top.
 * Tight enough that the head is over a quarter of the width and the bust, not the room, fills the light.
 */
const CROP_PER_SHOULDERS = 1.5;
const CROP_PER_DROP = 2.5;
const NOSE_FROM_TOP = 0.4;
/** A pose smaller than this share of the picture is noise, not a person. */
const SMALLEST_CROP = 0.12;
/** How far, in crop widths, the nose may sit from its planned spot and still be under the wreath's opening. */
const FRAMING_SLACK = 0.07;

function within(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * A square head-and-shoulders crop in pixels, from landmarks that are 0..1 of the picture:
 * headroom above the head, shoulders in the lower half, always inside the image.
 * A centred square when there is no usable pose.
 */
export function portraitCrop(imageWidth: number, imageHeight: number, pose: PortraitPose | null): Crop {
  const width = wholeNumber(imageWidth);
  const height = wholeNumber(imageHeight);
  const side = Math.min(width, height);
  const centred = { x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), size: side };
  if (!pose || side === 0) return centred;

  const noseX = pose.nose.x * width;
  const noseY = pose.nose.y * height;
  const leftX = pose.leftShoulder.x * width;
  const leftY = pose.leftShoulder.y * height;
  const rightX = pose.rightShoulder.x * width;
  const rightY = pose.rightShoulder.y * height;
  const shoulders = Math.hypot(leftX - rightX, leftY - rightY);
  const drop = (leftY + rightY) / 2 - noseY;
  const wanted = Math.max(shoulders * CROP_PER_SHOULDERS, drop * CROP_PER_DROP);
  const middle = (noseX + (leftX + rightX) / 2) / 2;
  if (!Number.isFinite(wanted + middle + noseY) || wanted < side * SMALLEST_CROP) return centred;

  const size = Math.min(side, Math.round(wanted));
  return {
    x: within(Math.round(middle - size / 2), 0, width - size),
    y: within(Math.round(noseY - size * NOSE_FROM_TOP), 0, height - size),
    size,
  };
}

/**
 * Whether the crop really has the head where the wreath's opening and the bust light expect it.
 * False with no pose, and when the crop had to be the centred square or was pushed aside by the picture's edge.
 */
export function headIsFramed(imageWidth: number, imageHeight: number, pose: PortraitPose | null): boolean {
  if (!pose) return false;
  const crop = portraitCrop(imageWidth, imageHeight, pose);
  if (crop.size === 0) return false;
  const across = (pose.nose.x * wholeNumber(imageWidth) - crop.x) / crop.size - 0.5;
  const down = (pose.nose.y * wholeNumber(imageHeight) - crop.y) / crop.size - NOSE_FROM_TOP;
  return Math.abs(across) <= FRAMING_SLACK && Math.abs(down) <= FRAMING_SLACK;
}

/** Left edge of the crop in the source. A mirrored crop is measured from the source's right edge. */
export function sourceX(imageWidth: number, crop: Crop, mirror: boolean): number {
  return mirror ? wholeNumber(imageWidth) - crop.x - crop.size : crop.x;
}

/** Luminance, 0..255, that a real frame reaches somewhere; a video with no data or a dead camera does not. */
const BLANK_BELOW = 8;
const BLANK_STRIDE = 17;

/** True when a snapshot holds no picture: nothing was drawn, or it is black all over. Looks at every 17th pixel. */
export function isBlank(pixels: Pixels): boolean {
  const data = pixels.data;
  for (let at = 0; at + 3 < data.length; at += BLANK_STRIDE * 4) {
    if ((data[at + 3] ?? 0) === 0) continue;
    if ((data[at] ?? 0) * 0.299 + (data[at + 1] ?? 0) * 0.587 + (data[at + 2] ?? 0) * 0.114 >= BLANK_BELOW) return false;
  }
  return true;
}

/** How far an accent is pulled toward gold: far enough that a blue or green god still gets warm gold, not olive. */
const GOLD_SHARE = 0.85;

/** The colour of the wreath, ring and rim for a god's accent, 0..255 per channel. */
export function gilded(accent: Rgb): Rgb {
  return [
    accent[0] + (GOLD[0] - accent[0]) * GOLD_SHARE,
    accent[1] + (GOLD[1] - accent[1]) * GOLD_SHARE,
    accent[2] + (GOLD[2] - accent[2]) * GOLD_SHARE,
  ];
}

/** One laurel leaf: where its stem end is and which way it points, in portrait widths from the centre, y down. */
export interface LaurelLeaf {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly length: number;
}

const WREATH_RADIUS = 0.405;
const LEAF_LENGTH = 0.092;
const LEAF_SPLAY = 0.5;
const LEAF_PAIRS_PER_RADIAN = 4.2;
/** Angles around the wreath, clockwise from three o'clock. A branch starts just beside the bottom of the circle. */
const BRANCH_START = Math.PI / 2 - 0.1;
/** A crown stops this far short of the top, leaving the opening above the head. */
const CROWN_END = -Math.PI / 2 + 0.44;
/** Without a framed head the branches stop at the horizontal, so no leaf can lie across a face. */
const CRADLE_END = 0;

/**
 * The right-hand laurel branch; the left one is its mirror image.
 * `crowned` takes it up and around the head, which is only safe when headIsFramed; otherwise it cradles the lower half.
 */
export function laurelBranch(crowned: boolean): { readonly radius: number; readonly end: number; readonly leaves: readonly LaurelLeaf[] } {
  const end = crowned ? CROWN_END : CRADLE_END;
  const pairs = Math.round((BRANCH_START - end) * LEAF_PAIRS_PER_RADIAN) + 1;
  const leaves: LaurelLeaf[] = [];
  for (let pair = 0; pair < pairs; pair++) {
    const along = pair / (pairs - 1);
    const around = BRANCH_START + (end - BRANCH_START) * along;
    const x = Math.cos(around) * WREATH_RADIUS;
    const y = Math.sin(around) * WREATH_RADIUS;
    const heading = around - Math.PI / 2;
    const length = LEAF_LENGTH * (1 - 0.4 * along);
    leaves.push({ x, y, angle: heading - LEAF_SPLAY, length: length * 0.9 }, { x, y, angle: heading + LEAF_SPLAY, length });
  }
  leaves.push({ x: Math.cos(end) * WREATH_RADIUS, y: Math.sin(end) * WREATH_RADIUS, angle: end - Math.PI / 2, length: LEAF_LENGTH * 0.6 });
  return { radius: WREATH_RADIUS, end, leaves };
}
