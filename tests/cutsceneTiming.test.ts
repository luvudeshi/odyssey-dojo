import { describe, expect, it } from "vitest";
import { CUT_MS, EXIT_AT, NAME_AT, barsAt, beatAt, moveAt, plateAt } from "../src/screens/cutscene/timing";

describe("cutscene timing", () => {
  it("walks the four beats and then is done", () => {
    expect(beatAt(0)).toEqual({ beat: "open", p: 0 });
    expect(beatAt(1300).beat).toBe("reveal");
    expect(beatAt(NAME_AT).beat).toBe("name");
    expect(beatAt(EXIT_AT).beat).toBe("exit");
    expect(beatAt(CUT_MS - 1).beat).toBe("exit");
    expect(beatAt(CUT_MS).beat).toBe("done");
  });
  it("runs 4 to 5 seconds", () => {
    expect(CUT_MS).toBeGreaterThanOrEqual(4000);
    expect(CUT_MS).toBeLessThanOrEqual(5000);
  });
  it("brings the bars in, holds them, and takes them out", () => {
    expect(barsAt(0)).toBe(0);
    expect(barsAt(1000)).toBe(1);
    expect(barsAt(EXIT_AT - 1)).toBe(1);
    expect(barsAt(CUT_MS)).toBe(0);
  });
  it("moves the camera from 0 to 1, never backwards", () => {
    expect(moveAt(0)).toBe(0);
    expect(moveAt(99999)).toBe(1);
    let last = 0;
    for (let t = 0; t <= CUT_MS; t += 50) { const m = moveAt(t); expect(m).toBeGreaterThanOrEqual(last); last = m; }
  });
  it("shows the plate only from the big beat to the exit", () => {
    expect(plateAt(NAME_AT - 1)).toBe(0);
    expect(plateAt(NAME_AT + 600)).toBe(1);
    expect(plateAt(CUT_MS)).toBe(0);
  });
});
