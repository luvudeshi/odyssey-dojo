import { expect, test } from "vitest";
import { nextTitleLine, pickTitleLine, TITLE_LINE_KEY, type TitleLineStorage } from "../src/audio/titleLine";
import { TITLE_LINES } from "../src/audio/storyLines";

const IDS = TITLE_LINES.map((line) => line.id);
const all = (): boolean => true;
const seeds = Array.from({ length: 50 }, (_, i) => i / 50);

test("the list starts with the recorded line and has seven distinct ids", () => {
  expect(IDS[0]).toBe("homer_title");
  expect(IDS).toHaveLength(7);
  expect(new Set(IDS).size).toBe(7);
});

test("never returns the last line when two or more are available", () => {
  for (const last of [null, ...IDS]) {
    for (const seed of seeds) expect(pickTitleLine(all, last, () => seed)).not.toBe(last);
  }
  const two = (id: string): boolean => id === "homer_title" || id === "homer_title_4";
  for (const seed of seeds) expect(pickTitleLine(two, "homer_title", () => seed)).toBe("homer_title_4");
});

test("only returns available ids, and reaches every one of them", () => {
  const some = (id: string): boolean => id === "homer_title_2" || id === "homer_title_5" || id === "homer_title_7";
  const seen = new Set<string>();
  for (const seed of seeds) {
    const id = pickTitleLine(some, null, () => seed);
    expect(some(id)).toBe(true);
    seen.add(id);
  }
  expect(seen.size).toBe(3);
});

test("one available id is returned even when it is the last", () => {
  expect(pickTitleLine((id) => id === "homer_title_3", "homer_title_3", () => 0.9)).toBe("homer_title_3");
});

test("none available gives homer_title", () => {
  expect(pickTitleLine(() => false, "homer_title_2", () => 0.5)).toBe("homer_title");
});

function memory(): TitleLineStorage & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
}

test("the pick is stored under its key and read back, so the next one differs", () => {
  const storage = memory();
  const first = nextTitleLine(all, () => 0, storage);
  expect(storage.data.get(TITLE_LINE_KEY)).toBe(first);
  expect(TITLE_LINE_KEY).toBe("odyssey-dojo.title-line");
  for (const seed of seeds) {
    const before = storage.data.get(TITLE_LINE_KEY);
    expect(nextTitleLine(all, () => seed, storage)).not.toBe(before);
  }
});

test("storage that throws, or none, never throws", () => {
  const broken: TitleLineStorage = {
    getItem: () => { throw new Error("denied"); },
    setItem: () => { throw new Error("full"); },
  };
  expect(IDS).toContain(nextTitleLine(all, () => 0.3, broken));
  expect(nextTitleLine(() => false, () => 0.3, null)).toBe("homer_title");
});
