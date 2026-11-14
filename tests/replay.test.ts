// Guards the takeaway: the god card's layout, text fitting and drawing, and the replay recorder's fallbacks.
import { afterEach, expect, test, vi } from "vitest";
import { cardLayout, coverCrop, drawGodCard, godCardBlob } from "../src/replay/godCard";
import type { GodCardData } from "../src/replay/godCard";
import { BAND_CELLS, meanderPoints } from "../src/replay/meander";
import { pickMimeType, startRecording } from "../src/replay/recorder";
import { contains, inset, overlaps } from "../src/replay/rect";
import { fitFontSize, fitText, LINE_HEIGHT, wrapLines } from "../src/replay/textFit";
import type { Measure } from "../src/replay/textFit";

// A fake font in which every glyph is half its font size wide.
const measure: Measure = (text, size) => text.length * size * 0.5;
const EPITHET = "Breaker of ships and shaker of the earth";

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
});

test.each([
  [1080, 1350],
  [240, 300],
])("the %ix%i card keeps every block inside the border, and no two overlap", (width, height) => {
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

/** A stand-in 2D context that records text and image draws and measures with the fake font above. */
function fakeContext(brokenImages = false): { context: CanvasRenderingContext2D; texts: DrawnText[]; images: number[][] } {
  const texts: DrawnText[] = [];
  const images: number[][] = [];
  const state: Record<string | symbol, unknown> = { font: "10px serif", textAlign: "left" };
  const fontSize = (): number => Number(/(\d+(?:\.\d+)?)px/.exec(String(state.font))?.[1] ?? 10);
  const methods: Record<string | symbol, unknown> = {
    measureText: (text: string) => ({ width: measure(text, fontSize()) }),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    fillText: (text: string, x: number, y: number) => {
      texts.push({ text, x, y, size: fontSize(), align: String(state.textAlign) });
    },
    drawImage: (_source: unknown, ...numbers: number[]) => {
      if (brokenImages) throw new Error("broken image");
      images.push(numbers);
    },
  };
  const context = new Proxy(state, {
    get: (target, key) => (key in target ? target[key] : (methods[key] ?? (() => undefined))),
  }) as unknown as CanvasRenderingContext2D;
  return { context, texts, images };
}

function expectTextInside(texts: readonly DrawnText[], width: number, height: number): void {
  const { content } = cardLayout(width, height);
  for (const { text, x, y, size, align } of texts) {
    const textWidth = measure(text, size);
    const left = align === "center" ? x - textWidth / 2 : x;
    expect(left, text).toBeGreaterThanOrEqual(content.x - 0.01);
    expect(left + textWidth, text).toBeLessThanOrEqual(content.x + content.width + 0.01);
    expect(y - size / 2, text).toBeGreaterThanOrEqual(content.y - 0.01);
    expect(y + size / 2, text).toBeLessThanOrEqual(content.y + content.height + 0.01);
  }
}

test("the card draws the god, the result and the footer, all inside the border", () => {
  const { context, texts } = fakeContext();
  drawGodCard(context, card, 1080, 1350);
  const drawn = texts.map((entry) => entry.text);
  expect(drawn.join("")).toContain("POSEIDON");
  expect(drawn).toContain("Earth-Shaker");
  expect(drawn).toContain("Victory over Polyphemus");
  expect(drawn).toContain("The Cyclops' Cave");
  expect(drawn.join("")).toContain("12,345");
  expect(drawn).toContain("Scan to relive your fight");
  expectTextInside(texts, 1080, 1350);

  const lost = fakeContext();
  drawGodCard(lost.context, { ...card, won: false }, 1080, 1350);
  expect(lost.texts.map((entry) => entry.text)).toContain("Fell to Polyphemus");
});

test("absurdly long text still stays inside the card, at full size and on a tiny card", () => {
  const long: GodCardData = {
    ...card,
    godName: "Hephaestus Polytechnes Klytotechnes of the Forge",
    epithet: `${EPITHET}, ${EPITHET}, ${EPITHET}`,
    domain: "Fire, metalworking, stone masonry, forges, the art of sculpture, technology and volcanoes",
    enemyName: "Polyphemus son of Poseidon, shepherd of the island of the Cyclopes",
    fightTitle: "The cave on the island of the Cyclopes, where six of the crew were eaten",
    score: 123456789012,
    footer: "Scan the code to watch the replay of this fight and keep the card. ".repeat(4),
  };
  for (const [width, height] of [[1080, 1350], [240, 300]] as const) {
    const { context, texts } = fakeContext();
    drawGodCard(context, long, width, height);
    expect(texts.length).toBeGreaterThan(10);
    expectTextInside(texts, width, height);
  }
});

test("pictures are cropped in, and a broken one falls back instead of throwing", () => {
  const picture = { width: 640, height: 480 } as unknown as CanvasImageSource;
  const { blocks } = cardLayout(1080, 1350);

  const good = fakeContext();
  drawGodCard(good.context, { ...card, portrait: picture, qr: picture }, 1080, 1350);
  const { x, y, width, height } = blocks.portrait;
  expect(good.images[0]).toEqual([80, 0, 480, 480, x, y, width, height]);
  expect(good.images).toHaveLength(2);
  // Beside a QR the footer is set left; the portrait replaces the placeholder initial.
  expect(good.texts.find((entry) => entry.text.startsWith("Scan"))?.x).toBe(blocks.footer.x);
  expect(good.texts.some((entry) => entry.align === "center")).toBe(false);

  const broken = fakeContext(true);
  expect(() => {
    drawGodCard(broken.context, { ...card, portrait: picture, qr: picture }, 1080, 1350);
  }).not.toThrow();
  expect(broken.texts.find((entry) => entry.align === "center")?.text).toBe("P");
  expect(broken.texts.find((entry) => entry.text.startsWith("Scan"))?.x).toBeGreaterThan(blocks.footer.x);
});

test("with no canvas to draw on, the card image is null rather than an error", async () => {
  await expect(godCardBlob(card)).resolves.toBeNull();
  await expect(godCardBlob(card, 0, 0)).resolves.toBeNull();
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
