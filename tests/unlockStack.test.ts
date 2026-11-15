// The unlock notice's capping rule (src/account/ui/unlockStack.ts): at most five cards, and one line for the rest.
import { expect, test } from "vitest";
import { MAX_CARDS, moreLine, stackOf } from "../src/account/ui/unlockStack";

const feats = (count: number): string[] => Array.from({ length: count }, (_, index) => `feat-${String(index + 1)}`);

test("up to five unlocks get a card each and there is nothing more to count", () => {
  expect(MAX_CARDS).toBe(5);
  for (let count = 0; count <= MAX_CARDS; count += 1) {
    const stack = stackOf(feats(count));
    expect(stack.shown).toEqual(feats(count));
    expect(stack.more).toBe(0);
    expect(moreLine(stack.more)).toBe("");
  }
});

test("more than five: the first five get a card, in order, and the line counts the rest", () => {
  // A first win on a fresh profile unlocks five to eight at once.
  for (const count of [6, 7, 8, 30]) {
    const stack = stackOf(feats(count));
    expect(stack.shown).toEqual(feats(count).slice(0, 5));
    expect(stack.more).toBe(count - 5);
    expect(stack.shown.length + stack.more).toBe(count);
    expect(moreLine(stack.more)).toBe(`and ${String(count - 5)} more`);
  }
});

test("the cap can be set, never shows fewer than one card, and the list handed in is left as it was", () => {
  const all = feats(8);
  expect(stackOf(all, 3)).toEqual({ shown: feats(3), more: 5 });
  expect(stackOf(all, 8).more).toBe(0);
  expect(stackOf(all, 100).shown).toEqual(all);
  for (const odd of [0, -4, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(stackOf(all, odd), String(odd)).toEqual({ shown: feats(1), more: 7 });
  }
  expect(stackOf(all, 2.9).shown).toEqual(feats(2));
  expect(stackOf([], 3)).toEqual({ shown: [], more: 0 });
  expect(all).toEqual(feats(8));
});
