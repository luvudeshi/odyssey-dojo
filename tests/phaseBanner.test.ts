import { expect, test } from "vitest";
import { phaseName } from "../src/hud/PhaseBanner";

test("a later phase shows its name", () => {
  expect(phaseName({ type: "phaseChanged", index: 1, name: "The Club" })).toBe("The Club");
});

test("the starting phase and other events show nothing", () => {
  expect(phaseName({ type: "phaseChanged", index: 0, name: "Start" })).toBeNull();
  expect(phaseName({ type: "won" })).toBeNull();
});
