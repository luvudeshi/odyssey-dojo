import { describe, expect, it } from "vitest";
import { MOVES } from "../src/moves/registry";
import { practisedFrom, practisedLines } from "../src/screens/practised";

const [first, second] = [...MOVES.keys()];

describe("practisedFrom", () => {
  it("keeps moves with a count above zero, most used first", () => {
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    const list = practisedFrom({ [String(first)]: 2, [String(second)]: 5, gone: 0 });
    expect(list.map((move) => move.id)).toEqual([String(second), String(first)]);
    expect(list.map((move) => move.count)).toEqual([5, 2]);
  });

  it("falls back to the id for a move the registry does not know", () => {
    const [move] = practisedFrom({ mystery: 1 });
    expect(move).toEqual({ id: "mystery", name: "mystery", count: 1, teaches: "" });
  });

  it("is empty when nothing was learned", () => {
    expect(practisedFrom({})).toEqual([]);
  });
});

describe("practisedLines", () => {
  const entry = (id: string, teaches: string) => ({ id, name: id, count: 1, teaches });

  it("skips empty and repeated lines and stops at max", () => {
    const list = [entry("a", ""), entry("b", "same"), entry("c", "same"), entry("d", "other"), entry("e", "third"), entry("f", "fourth")];
    expect(practisedLines(list, 3).map((move) => move.id)).toEqual(["b", "d", "e"]);
  });

  it("defaults to three lines", () => {
    const list = ["1", "2", "3", "4"].map((id) => entry(id, id));
    expect(practisedLines(list)).toHaveLength(3);
  });
});
