// Guards the takeaway: the god card's layout, text fitting and drawing, and the replay recorder's fallbacks.
import { afterEach, expect, test, vi } from "vitest";
import { coverCrop } from "../src/replay/cardImage";
import { cardLayout, drawGodCard, godCardBlob } from "../src/replay/godCard";
import type { CardLayout, GodCardData } from "../src/replay/godCard";
import { BAND_CELLS, drawMeander, meanderPoints } from "../src/replay/meander";
import { pickMimeType, startRecording } from "../src/replay/recorder";
import { contains, inset, overlaps } from "../src/replay/rect";
import type { Rect } from "../src/replay/rect";
import { fitFontSize, fitText, LINE_HEIGHT, wrapLines } from "../src/replay/textFit";
import type { Measure } from "../src/replay/textFit";

// A fake font in which every glyph is half its font size wide.
const measure: Measure = (text, size) => text.length * size * 0.5;
const EPITHET = "Breaker of ships and shaker of the earth";
const SIZES = [
  [1080, 1350],
  [240, 300],
] as const;
// Slack for rounding in positions that are computed, not typed in.
const SLACK = 0.01;

const card: GodCardData = {
  godName: "Poseidon",
  epithet: "Earth-Shaker",
  domain: "God of the Sea",
  enemyName: "Polyphemus",
  fightTitle: "The Cyclops' Cave",
  score: 12345,
  won: true,
  accent: "#3aa0c8",
  portrait: null,
  qr: null,
  footer: "Scan to relive your fight",
};

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeRecorder.reset();
  FakeAudioContext.reset();
});

test.each(SIZES)("the %ix%i card keeps every block inside the border, and no two overlap", (width, height) => {
  const layout = cardLayout(width, height);
  expect(contains({ x: 0, y: 0, width, height }, layout.border)).toBe(true);
  expect(contains(inset(layout.border, layout.cell * BAND_CELLS), layout.content)).toBe(true);

  const blocks = Object.entries(layout.blocks);
  for (const [name, rect] of blocks) {
    expect(rect.width, name).toBeGreaterThan(0);
    expect(rect.height, name).toBeGreaterThan(0);
    expect(contains(layout.content, rect), name).toBe(true);
  }
  blocks.forEach(([first, a], index) => {
    for (const [second, b] of blocks.slice(index + 1)) expect(overlaps(a, b), `${first}/${second}`).toBe(false);
  });

  const { portrait, qr, footer } = layout.blocks;
  expect(portrait.width).toBe(portrait.height);
  expect(portrait.y + portrait.height).toBeLessThanOrEqual(height / 2);
  expect(qr.width).toBe(qr.height);
  expect(qr.x + qr.width).toBe(layout.content.x + layout.content.width);
  expect(qr.y).toBeGreaterThan(height / 2);
  expect(footer.x + footer.width).toBeLessThan(qr.x);

  for (const [name, size] of Object.entries(layout.fonts)) {
    expect(size, name).toBeGreaterThan(0);
    expect(size * LINE_HEIGHT, name).toBeLessThanOrEqual(layout.blocks[name as keyof typeof layout.fonts].height);
  }
});

test("a font shrinks just enough to fit its width, and never below the minimum", () => {
  expect(fitFontSize("ZEUS", 400, 80, 20, measure)).toBe(80);
  expect(fitFontSize("HEPHAESTUS THE SMITH", 400, 80, 20, measure)).toBe(40);
  expect(fitFontSize("X".repeat(100), 400, 80, 20, measure)).toBe(20);
});

test("words wrap at the width, and what does not fit the line limit ends in an ellipsis", () => {
  const width = (text: string): number => measure(text, 20);
  expect(wrapLines(EPITHET, 200, 2, width)).toEqual(["Breaker of ships and", "shaker of the earth"]);
  expect(wrapLines(EPITHET, 200, 1, width)).toEqual(["Breaker of ships an…"]);
  expect(wrapLines("Polyphemus", 60, 2, width)).toEqual(["Polyp…"]);
  expect(wrapLines("   ", 200, 2, width)).toEqual([]);
});

test("text is fitted by shrinking or by wrapping to two lines, whichever keeps it larger", () => {
  expect(fitText("Poseidon", { width: 800, height: 100 }, 78, 30, 2, measure)).toEqual({ size: 78, lines: ["Poseidon"] });
  // One long word cannot wrap, so it shrinks.
  expect(fitText("Hephaestus".repeat(3), { width: 800, height: 100 }, 78, 30, 2, measure)).toEqual({
    size: 53,
    lines: ["Hephaestus".repeat(3)],
  });
  // On one line this needs size 20; on two it fits at 40.
  expect(fitText(EPITHET, { width: 400, height: 100 }, 60, 10, 2, measure)).toEqual({
    size: 40,
    lines: ["Breaker of ships and", "shaker of the earth"],
  });
  expect(fitText(EPITHET, { width: 400, height: 100 }, 60, 10, 1, measure)).toEqual({ size: 20, lines: [EPITHET] });
  // Two lines at 40 are narrow enough but too tall for a shallower box: the height decides, not just the width.
  expect(fitText(EPITHET, { width: 400, height: 60 }, 60, 10, 2, measure)).toEqual({
    size: 25,
    lines: ["Breaker of ships and shaker of", "the earth"],
  });
  expect(fitText(EPITHET, { width: 400, height: 45 }, 60, 10, 2, measure)).toEqual({ size: 20, lines: [EPITHET] });
  expect(fitText("  ", { width: 400, height: 100 }, 60, 10, 2, measure).lines).toEqual([]);
});

test("text too long for its box even at the smallest size is cut, not overflowed", () => {
  const box = { width: 100, height: 30 };
  const fitted = fitText(EPITHET, box, 40, 20, 2, measure);
  expect(fitted).toEqual({ size: 20, lines: ["Breaker o…"] });
  expect(fitted.lines.length * fitted.size * LINE_HEIGHT).toBeLessThanOrEqual(box.height);
});

test("a meander run is one unbroken line of right-angled keys that spans its length exactly", () => {
  const points = meanderPoints(120, 10);
  expect(points).toHaveLength(1 + 4 * 6);
  expect(points[0]).toEqual([0, 0]);
  expect(points.at(-1)).toEqual([120, 0]);
  points.forEach(([x, y], index) => {
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(120);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(20);
    const [nextX, nextY] = points[index + 1] ?? [x, y];
    expect(nextX === x || nextY === y).toBe(true);
  });
  // An awkward length stretches the keys instead of leaving a gap.
  expect(meanderPoints(100, 10).at(-1)).toEqual([100, 0]);
  expect(meanderPoints(0, 10)).toEqual([]);
});

test("a portrait is cropped from its centre to fill the circle", () => {
  expect(coverCrop(640, 480, 100, 100)).toEqual({ x: 80, y: 0, width: 480, height: 480 });
  expect(coverCrop(300, 600, 100, 100)).toEqual({ x: 0, y: 150, width: 300, height: 300 });
});

interface DrawnText {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly align: string;
}

type Matrix = readonly [a: number, b: number, c: number, d: number, e: number, f: number];

interface FakeContext {
  readonly context: CanvasRenderingContext2D;
  readonly texts: DrawnText[];
  readonly images: number[][];
  /** Every fillRect, with the fill colour at the time. */
  readonly fills: { readonly color: string; readonly rect: readonly number[] }[];
  /** One entry per path: its moveTo and lineTo points, in card coordinates. */
  readonly paths: (readonly [number, number])[][];
}

/**
 * A stand-in 2D context that records what is drawn, follows translate and rotate, and measures with the fake font
 * above. `brokenImages` makes drawImage throw; `throwsOn` names any one method that should throw instead of working.
 */
function fakeContext(options: { readonly brokenImages?: boolean; readonly throwsOn?: string } = {}): FakeContext {
  const texts: DrawnText[] = [];
  const images: number[][] = [];
  const fills: { color: string; rect: number[] }[] = [];
  const paths: (readonly [number, number])[][] = [];
  const state: Record<string | symbol, unknown> = { font: "10px serif", textAlign: "left", fillStyle: "#000000" };
  const fontSize = (): number => Number(/(\d+(?:\.\d+)?)px/.exec(String(state.font))?.[1] ?? 10);
  let matrix: Matrix = [1, 0, 0, 1, 0, 0];
  const saved: Matrix[] = [];
  const point = (x: number, y: number): void => {
    const [a, b, c, d, e, f] = matrix;
    paths.at(-1)?.push([a * x + c * y + e, b * x + d * y + f]);
  };
  const methods: Record<string | symbol, unknown> = {
    save: () => {
      saved.push(matrix);
    },
    restore: () => {
      matrix = saved.pop() ?? matrix;
    },
    translate: (x: number, y: number) => {
      const [a, b, c, d, e, f] = matrix;
      matrix = [a, b, c, d, a * x + c * y + e, b * x + d * y + f];
    },
    rotate: (angle: number) => {
      const [a, b, c, d, e, f] = matrix;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      matrix = [a * cos + c * sin, b * cos + d * sin, c * cos - a * sin, d * cos - b * sin, e, f];
    },
    beginPath: () => {
      paths.push([]);
    },
    moveTo: point,
    lineTo: point,
    fillRect: (...rect: number[]) => {
      fills.push({ color: String(state.fillStyle), rect });
    },
    measureText: (text: string) => ({ width: measure(text, fontSize()) }),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    fillText: (text: string, x: number, y: number) => {
      texts.push({ text, x, y, size: fontSize(), align: String(state.textAlign) });
    },
    drawImage: (_source: unknown, ...numbers: number[]) => {
      if (options.brokenImages) throw new Error("broken image");
      images.push(numbers);
    },
  };
  const { throwsOn } = options;
  if (throwsOn !== undefined) {
    methods[throwsOn] = () => {
      throw new Error(`${throwsOn} failed`);
    };
  }
  const context = new Proxy(state, {
    get: (target, key) => (key in target ? target[key] : (methods[key] ?? (() => undefined))),
  }) as unknown as CanvasRenderingContext2D;
  return { context, texts, images, fills, paths };
}

function grown(rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, width: rect.width + by * 2, height: rect.height + by * 2 };
}

/**
 * Every piece of text must sit wholly inside one block of the layout. A line that spills over the edge of its own
 * block straddles two of them, so it is inside none. Without a QR the footer has the whole bottom row.
 */
function expectTextInBlocks(texts: readonly DrawnText[], layout: CardLayout, withQr = false): void {
  const { blocks } = layout;
  const bottom = withQr ? blocks.footer : { ...blocks.footer, width: blocks.qr.x + blocks.qr.width - blocks.footer.x };
  const homes = [blocks.portrait, blocks.name, blocks.epithet, blocks.domain, blocks.outcome, blocks.fightTitle, blocks.score, bottom];
  for (const { text, x, y, size, align } of texts) {
    const width = measure(text, size);
    const box: Rect = { x: align === "center" ? x - width / 2 : x, y: y - size / 2, width, height: size };
    expect(
      homes.some((home) => contains(grown(home, SLACK), box)),
      `"${text}" at ${String(box.x)},${String(box.y)} size ${String(size)}`,
    ).toBe(true);
  }
}

test("the card draws the god, the result and the footer, each inside its own block", () => {
  const { context, texts } = fakeContext();
  drawGodCard(context, card, 1080, 1350);
  const drawn = texts.map((entry) => entry.text);
  expect(drawn.join("")).toContain("POSEIDON");
  expect(drawn).toContain("Earth-Shaker");
  expect(drawn).toContain("Victory over Polyphemus");
  expect(drawn).toContain("The Cyclops' Cave");
  expect(drawn.join("")).toContain("12,345");
  expect(drawn).toContain("Scan to relive your fight");
  expectTextInBlocks(texts, cardLayout(1080, 1350));

  const lost = fakeContext();
  drawGodCard(lost.context, { ...card, won: false }, 1080, 1350);
  expect(lost.texts.map((entry) => entry.text)).toContain("Fell to Polyphemus");
});

test.each(SIZES)("absurdly long text on the %ix%i card still stays inside its own block", (width, height) => {
  const long: GodCardData = {
    ...card,
    godName: "Hephaestus Polytechnes Klytotechnes of the Forge",
    epithet: `${EPITHET}, ${EPITHET}, ${EPITHET}`,
    domain: "Fire, metalworking, stone masonry, forges, the art of sculpture, technology and volcanoes",
    enemyName: "Polyphemus son of Poseidon, shepherd of the island of the Cyclopes",
    fightTitle: "The cave on the island of the Cyclopes, where six of the crew were eaten",
    score: 1e20,
    footer: "Scan the code to watch the replay of this fight and keep the card. ".repeat(4),
  };
  const layout = cardLayout(width, height);
  const { context, texts } = fakeContext();
  drawGodCard(context, long, width, height);
  expect(texts.length).toBeGreaterThan(10);
  expectTextInBlocks(texts, layout);

  // The score is too long for one line at full size, so its numerals are all there but smaller.
  const { score } = layout.blocks;
  const numerals = texts.filter((entry) => /^[\d,]$/.test(entry.text) && entry.y > score.y && entry.y < score.y + score.height);
  expect(numerals.map((entry) => entry.text).join("")).toBe("100,000,000,000,000,000,000");
  for (const numeral of numerals) expect(numeral.size).toBeLessThan(layout.fonts.score);
});

test("a score that fits is set at full size, and one that is not a number reads as zero", () => {
  const layout = cardLayout(1080, 1350);
  const { context, texts } = fakeContext();
  drawGodCard(context, { ...card, score: 987 }, 1080, 1350);
  expect(texts.filter((entry) => /^\d$/.test(entry.text)).map((entry) => entry.size)).toEqual(Array(3).fill(layout.fonts.score));

  const broken = fakeContext();
  drawGodCard(broken.context, { ...card, score: Number.NaN }, 1080, 1350);
  expect(broken.texts.map((entry) => entry.text)).toContain("0");
});

test.each(["save", "restore", "fillRect", "strokeRect", "measureText", "fillText", "createRadialGradient", "arc"])(
  "drawing the card does not throw when the canvas's %s does",
  (method) => {
    const { context } = fakeContext({ throwsOn: method });
    expect(() => {
      drawGodCard(context, card, 1080, 1350);
    }).not.toThrow();
  },
);

test.each(SIZES)("the meander keys on the %ix%i card fill each side of the band and keep out of the corners", (width, height) => {
  const { border: frame, cell } = cardLayout(width, height);
  const band = cell * BAND_CELLS;
  const right = frame.x + frame.width;
  const bottom = frame.y + frame.height;
  const { context, paths } = fakeContext();
  drawMeander(context, frame, cell, "gold");

  // One path per side, in the order top, right, bottom, left.
  expect(paths).toHaveLength(4);
  paths.forEach((run, side) => {
    const horizontal = side % 2 === 0;
    const [from, to] = horizontal ? [frame.x + band, right - band] : [frame.y + band, bottom - band];
    const along = run.map(([x, y]) => (horizontal ? x : y));
    // How far each point is into the card from this side's own outer edge.
    const depth = run.map(([x, y]) => [y - frame.y, right - x, bottom - y, x - frame.x][side] ?? Number.NaN);

    expect(run.length).toBeGreaterThan(4);
    // The run starts and ends at the corner squares and never enters them.
    expect(Math.min(...along)).toBeCloseTo(from, 6);
    expect(Math.max(...along)).toBeCloseTo(to, 6);
    // The keys are two cells deep with a cell of air between them and each rule.
    expect(Math.min(...depth)).toBeCloseTo(cell, 6);
    expect(Math.max(...depth)).toBeCloseTo(cell * 3, 6);
    // One unbroken line of right angles.
    run.forEach(([x, y], index) => {
      const [nextX, nextY] = run[index + 1] ?? [x, y];
      expect(Math.min(Math.abs(nextX - x), Math.abs(nextY - y))).toBeLessThan(SLACK);
    });
  });
});

test("pictures are cropped in, and a broken one falls back instead of throwing", () => {
  const picture = { width: 640, height: 480 } as unknown as CanvasImageSource;
  const layout = cardLayout(1080, 1350);
  const { blocks } = layout;

  const good = fakeContext();
  drawGodCard(good.context, { ...card, portrait: picture, qr: picture }, 1080, 1350);
  const { x, y, width, height } = blocks.portrait;
  expect(good.images[0]).toEqual([80, 0, 480, 480, x, y, width, height]);
  expect(good.images).toHaveLength(2);
  // The QR sits on a white plate; beside it the footer is set left; the portrait replaces the placeholder initial.
  expect(good.fills.find((fill) => fill.color === "#ffffff")?.rect).toEqual([blocks.qr.x, blocks.qr.y, blocks.qr.width, blocks.qr.height]);
  expect(good.texts.find((entry) => entry.text.startsWith("Scan"))?.x).toBe(blocks.footer.x);
  expect(good.texts.some((entry) => entry.align === "center")).toBe(false);
  expectTextInBlocks(good.texts, layout, true);

  const broken = fakeContext({ brokenImages: true });
  expect(() => {
    drawGodCard(broken.context, { ...card, portrait: picture, qr: picture }, 1080, 1350);
  }).not.toThrow();
  expect(broken.texts.find((entry) => entry.align === "center")?.text).toBe("P");
  expect(broken.texts.find((entry) => entry.text.startsWith("Scan"))?.x).toBeGreaterThan(blocks.footer.x);
});

test("a picture with no pixels yet is left out: no blank QR plate, and the emblem instead of the portrait", () => {
  // What an <img> that is still loading, or failed to load, looks like to the canvas: drawImage silently ignores it.
  const unloaded = { naturalWidth: 0, naturalHeight: 0, complete: true } as unknown as CanvasImageSource;
  const layout = cardLayout(1080, 1350);
  const { context, texts, images, fills } = fakeContext();
  drawGodCard(context, { ...card, portrait: unloaded, qr: unloaded }, 1080, 1350);

  expect(images).toEqual([]);
  expect(fills.some((fill) => fill.color === "#ffffff")).toBe(false);
  expect(texts.find((entry) => entry.align === "center")?.text).toBe("P");
  // The footer takes the whole bottom row, centred, exactly as with no QR at all.
  const footer = must(texts.find((entry) => entry.text.startsWith("Scan")));
  const middle = layout.content.x + layout.content.width / 2;
  expect(footer.x + measure(footer.text, footer.size) / 2).toBeCloseTo(middle, 6);
  const none = fakeContext();
  drawGodCard(none.context, card, 1080, 1350);
  expect(texts).toEqual(none.texts);
});

interface FakeCanvas {
  width: number;
  height: number;
  readonly drawn: FakeContext;
  getContext(kind: string): CanvasRenderingContext2D | null;
  toBlob(done: (blob: Blob | null) => void, type: string): void;
}

/** Stands in for `document`: hands out one fake canvas, and has `fonts` only when given. */
function stubDocument(fonts?: { load(font: string): Promise<unknown> }, parts: Partial<FakeCanvas> = {}): FakeCanvas {
  const drawn = fakeContext();
  const canvas: FakeCanvas = {
    width: 0,
    height: 0,
    drawn,
    getContext: (kind) => (kind === "2d" ? drawn.context : null),
    toBlob: (done, type) => {
      done(new Blob(["card"], { type }));
    },
    ...parts,
  };
  vi.stubGlobal("document", { createElement: () => canvas, ...(fonts ? { fonts } : {}) });
  return canvas;
}

test("with no canvas to draw on, the card image is null rather than an error", async () => {
  await expect(godCardBlob(card)).resolves.toBeNull();
  await expect(godCardBlob(card, 0, 0)).resolves.toBeNull();

  stubDocument(undefined, { getContext: () => null });
  await expect(godCardBlob(card)).resolves.toBeNull();
  stubDocument(undefined, {
    toBlob: () => {
      throw new Error("SecurityError: tainted canvas");
    },
  });
  await expect(godCardBlob(card)).resolves.toBeNull();
  stubDocument(undefined, {
    toBlob: (done) => {
      done(null);
    },
  });
  await expect(godCardBlob(card)).resolves.toBeNull();
});

test("the card image is a 1080x1350 PNG, drawn once every face of the serif has loaded", async () => {
  vi.useFakeTimers();
  const asked: string[] = [];
  const canvas = stubDocument({
    load: (font) => {
      asked.push(font);
      // Nothing may be drawn while the fonts are still loading.
      expect(canvas.drawn.texts).toEqual([]);
      return Promise.resolve([]);
    },
  });
  const blob = must(await godCardBlob(card));
  expect(blob.type).toBe("image/png");
  expect(await blob.text()).toBe("card");
  expect([canvas.width, canvas.height]).toEqual([1080, 1350]);
  expect(canvas.drawn.texts.map((entry) => entry.text)).toContain("Victory over Polyphemus");
  expect(asked.map((font) => font.split(" 48px ")[0])).toEqual(["normal 700", "normal 600", "normal 400", "italic 400"]);
  for (const font of asked) expect(font).toContain('"Cinzel"');
  // The timeout that guards against a slow font is not left running.
  expect(vi.getTimerCount()).toBe(0);

  const small = stubDocument();
  expect(await godCardBlob(card, 539.6, 675.4)).not.toBeNull();
  expect([small.width, small.height]).toEqual([540, 675]);
});

test("the card is still made when fonts cannot be waited for at all", async () => {
  // No Font Loading API, as in some embedded webviews.
  const plain = stubDocument();
  expect(await godCardBlob(card)).not.toBeNull();
  expect(plain.drawn.texts.length).toBeGreaterThan(0);

  stubDocument({ load: () => Promise.reject(new Error("font failed")) });
  expect(await godCardBlob(card)).not.toBeNull();
  stubDocument({
    load: () => {
      throw new Error("bad font string");
    },
  });
  expect(await godCardBlob(card)).not.toBeNull();
});

test("a font that never finishes loading holds the card up for 800 ms and no longer", async () => {
  vi.useFakeTimers();
  const canvas = stubDocument({ load: () => new Promise<never>(() => undefined) });
  let done = false;
  const pending = godCardBlob(card).then((blob) => {
    done = true;
    return blob;
  });
  await vi.advanceTimersByTimeAsync(799);
  expect(done).toBe(false);
  expect(canvas.drawn.texts).toEqual([]);
  await vi.advanceTimersByTimeAsync(1);
  expect(await pending).not.toBeNull();
  expect(canvas.drawn.texts.length).toBeGreaterThan(0);
  expect(vi.getTimerCount()).toBe(0);
});

test("the replay prefers vp9, then vp8, then plain webm, then mp4", () => {
  const order = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
  const asked: string[] = [];
  expect(
    pickMimeType((type) => {
      asked.push(type);
      return false;
    }),
  ).toBeNull();
  expect(asked).toEqual(order);
  order.forEach((type, index) => {
    const supported = order.slice(index);
    expect(pickMimeType((candidate) => supported.includes(candidate))).toBe(type);
  });
  expect(pickMimeType((type) => type === "video/mp4" || type === "video/webm")).toBe("video/webm");
  expect(
    pickMimeType(() => {
      throw new Error("no MediaRecorder");
    }),
  ).toBeNull();
});

class FakeTrack {
  stopped = false;
  readonly copies: FakeTrack[] = [];
  stop(): void {
    this.stopped = true;
  }
  clone(): FakeTrack {
    const copy = new FakeTrack();
    this.copies.push(copy);
    return copy;
  }
}

class FakeStream {
  constructor(readonly tracks: FakeTrack[]) {}
  getTracks(): FakeTrack[] {
    return this.tracks;
  }
  getAudioTracks(): FakeTrack[] {
    return this.tracks;
  }
  addTrack(track: FakeTrack): void {
    this.tracks.push(track);
  }
  removeTrack(track: FakeTrack): void {
    this.tracks.splice(this.tracks.indexOf(track), 1);
  }
}

/** Enough of MediaRecorder to drive the recorder: it hands over one last chunk and a "stop" event when stopped. */
class FakeRecorder extends EventTarget {
  static supported: readonly string[] = ["video/webm;codecs=vp8", "video/webm"];
  static made: FakeRecorder[] = [];
  static lastChunk = "tail";
  static sendsStop = true;
  static failsToConstruct = false;
  static reset(): void {
    FakeRecorder.supported = ["video/webm;codecs=vp8", "video/webm"];
    FakeRecorder.made = [];
    FakeRecorder.lastChunk = "tail";
    FakeRecorder.sendsStop = true;
    FakeRecorder.failsToConstruct = false;
  }
  static isTypeSupported(type: string): boolean {
    return FakeRecorder.supported.includes(type);
  }

  state = "inactive";
  readonly mimeType: string;
  constructor(
    readonly stream: FakeStream,
    readonly options: MediaRecorderOptions,
  ) {
    super();
    if (FakeRecorder.failsToConstruct) throw new Error("NotSupportedError");
    this.mimeType = options.mimeType ?? "";
    FakeRecorder.made.push(this);
  }
  start(): void {
    this.state = "recording";
  }
  emit(text: string): void {
    this.dispatchEvent(Object.assign(new Event("dataavailable"), { data: new Blob([text]) }));
  }
  stop(): void {
    if (this.state === "inactive") throw new Error("InvalidStateError");
    this.state = "inactive";
    if (!FakeRecorder.sendsStop) return;
    this.emit(FakeRecorder.lastChunk);
    this.dispatchEvent(new Event("stop"));
  }
}

class FakeNode {
  readonly outputs: FakeNode[] = [];
  connect(node: FakeNode): FakeNode {
    this.outputs.push(node);
    return node;
  }
}

/** Enough of AudioContext for the recorder's audio feed: it remembers how its nodes were wired together. */
class FakeAudioContext {
  static made: FakeAudioContext[] = [];
  static failsToConstruct = false;
  static reset(): void {
    FakeAudioContext.made = [];
    FakeAudioContext.failsToConstruct = false;
  }

  state = "running";
  resumed = false;
  readonly track = new FakeTrack();
  readonly output = Object.assign(new FakeNode(), { stream: new FakeStream([this.track]) });
  readonly hush = Object.assign(new FakeNode(), { gain: { value: 1 } });
  readonly carrier = Object.assign(new FakeNode(), {
    started: false,
    start(): void {
      this.started = true;
    },
  });
  readonly inputs: { readonly stream: unknown; readonly node: FakeNode }[] = [];
  constructor() {
    if (FakeAudioContext.failsToConstruct) throw new Error("NotSupportedError");
    FakeAudioContext.made.push(this);
  }
  createMediaStreamDestination(): FakeNode {
    return this.output;
  }
  createMediaStreamSource(stream: unknown): FakeNode {
    const node = new FakeNode();
    this.inputs.push({ stream, node });
    return node;
  }
  createGain(): FakeNode {
    return this.hush;
  }
  createConstantSource(): FakeNode {
    return this.carrier;
  }
  resume(): Promise<void> {
    this.resumed = true;
    return Promise.resolve();
  }
  close(): Promise<void> {
    if (this.state === "closed") return Promise.reject(new Error("InvalidStateError"));
    this.state = "closed";
    return Promise.resolve();
  }
}

function fakeCanvas(video: FakeTrack, seen: { fps?: number } = {}): HTMLCanvasElement {
  const canvas = {
    captureStream(fps: number): FakeStream {
      seen.fps = fps;
      return new FakeStream([video]);
    },
  };
  return canvas as unknown as HTMLCanvasElement;
}

test("a browser that cannot record gets null, and nothing is left running", () => {
  expect(startRecording({} as HTMLCanvasElement)).toBeNull();

  vi.stubGlobal("MediaRecorder", FakeRecorder);
  expect(startRecording({} as HTMLCanvasElement)).toBeNull();

  FakeRecorder.failsToConstruct = true;
  const video = new FakeTrack();
  expect(startRecording(fakeCanvas(video))).toBeNull();
  expect(video.stopped).toBe(true);
});

test("a recording returns its video once, survives a second stop, and stops only its own tracks", async () => {
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  const video = new FakeTrack();
  const sound = new FakeTrack();
  const seen: { fps?: number } = {};
  const recording = must(startRecording(fakeCanvas(video, seen), { audio: new FakeStream([sound]) as unknown as MediaStream }));
  const recorder = must(FakeRecorder.made[0]);
  expect(seen.fps).toBe(30);
  expect(recorder.options.mimeType).toBe("video/webm;codecs=vp8");
  expect(recorder.stream.tracks).toEqual([video, sound.copies[0]]);
  expect(recorder.state).toBe("recording");

  recorder.emit("head");
  const first = recording.stop();
  const second = recording.stop();
  const blob = must(await first);
  expect(await second).toBe(blob);
  expect(await recording.stop()).toBe(blob);
  expect(await blob.text()).toBe("headtail");
  expect(blob.type).toBe("video/webm;codecs=vp8");
  expect(video.stopped).toBe(true);
  expect(sound.copies[0]?.stopped).toBe(true);
  expect(sound.stopped).toBe(false);
});

test("a recording ends itself at the time limit, so memory is bounded", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  const video = new FakeTrack();
  const recording = must(startRecording(fakeCanvas(video), { maxSeconds: 5, fps: 24 }));
  const recorder = must(FakeRecorder.made[0]);
  vi.advanceTimersByTime(4999);
  expect(recorder.state).toBe("recording");
  expect(video.stopped).toBe(false);
  vi.advanceTimersByTime(1);
  expect(recorder.state).toBe("inactive");
  expect(video.stopped).toBe(true);
  expect(await must(await recording.stop()).text()).toBe("tail");
  expect(vi.getTimerCount()).toBe(0);
});

test("stop gives null when nothing was recorded, and does not hang on a recorder that never answers", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  FakeRecorder.supported = [];
  FakeRecorder.lastChunk = "";
  const empty = must(startRecording(fakeCanvas(new FakeTrack())));
  expect(must(FakeRecorder.made[0]).options.mimeType).toBeUndefined();
  expect(await empty.stop()).toBeNull();

  FakeRecorder.sendsStop = false;
  const video = new FakeTrack();
  const silent = must(startRecording(fakeCanvas(video)));
  const pending = silent.stop();
  vi.advanceTimersByTime(2000);
  expect(await pending).toBeNull();
  expect(video.stopped).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

test("when attached audio keeps the recorder from writing anything, it carries on with the picture alone", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  const video = new FakeTrack();
  const sound = new FakeTrack();
  const recording = must(startRecording(fakeCanvas(video), { audio: new FakeStream([sound]) as unknown as MediaStream }));
  const stalled = must(FakeRecorder.made[0]);
  vi.advanceTimersByTime(2500);
  expect(FakeRecorder.made).toHaveLength(2);
  const second = must(FakeRecorder.made[1]);
  expect(stalled.state).toBe("inactive");
  expect(second.state).toBe("recording");
  expect(second.stream.tracks).toEqual([video]);
  expect(sound.copies[0]?.stopped).toBe(true);
  expect(video.stopped).toBe(false);

  // The replaced recorder's late chunk is not part of the video.
  stalled.emit("stale");
  second.emit("head");
  expect(await must(await recording.stop()).text()).toBe("headtail");
  expect(video.stopped).toBe(true);
  expect(sound.stopped).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

test("audio that does flow is kept", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  const sound = new FakeTrack();
  const recording = must(startRecording(fakeCanvas(new FakeTrack()), { audio: new FakeStream([sound]) as unknown as MediaStream }));
  must(FakeRecorder.made[0]).emit("head");
  vi.advanceTimersByTime(10_000);
  expect(FakeRecorder.made).toHaveLength(1);
  expect(sound.copies[0]?.stopped).toBe(false);
  expect(await must(await recording.stop()).text()).toBe("headtail");
});

test("attached audio is recorded through a feed that never falls silent, and the feed is taken down afterwards", async () => {
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  const video = new FakeTrack();
  const sound = new FakeTrack();
  const game = new FakeStream([sound]);
  const recording = must(startRecording(fakeCanvas(video), { audio: game as unknown as MediaStream }));
  const feed = must(FakeAudioContext.made[0]);
  expect(FakeAudioContext.made).toHaveLength(1);

  // The recorder gets the feed's track, not the game's own, which is neither copied nor touched.
  expect(must(FakeRecorder.made[0]).stream.tracks).toEqual([video, feed.track]);
  expect(sound.copies).toEqual([]);
  // The game's sound goes into the feed, next to a running constant signal at zero gain that keeps data flowing.
  expect(feed.inputs.map((input) => input.stream)).toEqual([game]);
  expect(feed.inputs[0]?.node.outputs).toEqual([feed.output]);
  expect(feed.carrier.started).toBe(true);
  expect(feed.carrier.outputs).toEqual([feed.hush]);
  expect(feed.hush.gain.value).toBe(0);
  expect(feed.hush.outputs).toEqual([feed.output]);
  expect(feed.resumed).toBe(true);
  expect(feed.state).toBe("running");

  must(FakeRecorder.made[0]).emit("head");
  expect(await must(await recording.stop()).text()).toBe("headtail");
  expect(feed.state).toBe("closed");
  expect(feed.track.stopped).toBe(true);
  expect(video.stopped).toBe(true);
  expect(sound.stopped).toBe(false);
});

test("a feed whose context never runs is dropped with its audio, and a browser with no feed copies the tracks", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  const video = new FakeTrack();
  const sound = new FakeTrack();
  const recording = must(startRecording(fakeCanvas(video), { audio: new FakeStream([sound]) as unknown as MediaStream }));
  const feed = must(FakeAudioContext.made[0]);
  vi.advanceTimersByTime(2500);
  expect(FakeRecorder.made).toHaveLength(2);
  expect(must(FakeRecorder.made[1]).stream.tracks).toEqual([video]);
  expect(feed.state).toBe("closed");
  expect(feed.track.stopped).toBe(true);
  // Stopping later closes nothing twice.
  must(FakeRecorder.made[1]).emit("head");
  expect(await must(await recording.stop()).text()).toBe("headtail");
  expect(sound.stopped).toBe(false);

  FakeRecorder.reset();
  FakeAudioContext.failsToConstruct = true;
  const copied = must(startRecording(fakeCanvas(new FakeTrack()), { audio: new FakeStream([sound]) as unknown as MediaStream }));
  expect(must(FakeRecorder.made[0]).stream.tracks.at(-1)).toBe(sound.copies[0]);
  expect(sound.copies).toHaveLength(1);
  await copied.stop();
  expect(sound.copies[0]?.stopped).toBe(true);

  // No sound to carry: no feed is built, and nothing waits on audio that will never come.
  FakeRecorder.reset();
  FakeAudioContext.reset();
  const mute = must(startRecording(fakeCanvas(new FakeTrack()), { audio: new FakeStream([]) as unknown as MediaStream }));
  expect(FakeAudioContext.made).toEqual([]);
  vi.advanceTimersByTime(2500);
  expect(FakeRecorder.made).toHaveLength(1);
  await mute.stop();
  expect(vi.getTimerCount()).toBe(0);
});

test("a recorder that cannot be built leaves no audio feed open", () => {
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  FakeRecorder.failsToConstruct = true;
  expect(startRecording(fakeCanvas(new FakeTrack()), { audio: new FakeStream([new FakeTrack()]) as unknown as MediaStream })).toBeNull();
  const feed = must(FakeAudioContext.made[0]);
  expect(feed.state).toBe("closed");
  expect(feed.track.stopped).toBe(true);
});
