// A guest's fight must read the host's view once per frame: view() hands the events over once, so a second read in the
// same frame (even only for the phase) leaves the sounds, the rating word and "Together! x2" with nothing to show.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("the guest's frame reads link.view() once, and hands its events to the effects", () => {
  const source = readFileSync("src/screens/GuestFight.tsx", "utf8");
  expect(source.match(/link\.view\(\)/g)).toHaveLength(1);
  expect(source).toContain("view.events.forEach((event) => { playEvent(event); noteHit(event);");
});
