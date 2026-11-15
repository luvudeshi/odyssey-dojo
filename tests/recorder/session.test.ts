import { expect, test } from "vitest";
import { MOVES } from "../../src/moves/registry";
import {
  DEFAULT_MOVES, nextFreeNumber, packSession, parseParams, planTakes, sessionFileName, sessionSeconds, unpackSession,
} from "../../tools/recorder/session";
import { loadTrace, storeTrace } from "../../tools/recorder/trace";
import type { StoredTrace } from "../../tools/recorder/trace";
import { standing } from "../helpers/poses";

const KNOWN = new Set(MOVES.keys());

function stored(move: string, n: number): StoredTrace {
  return storeTrace({ move, person: "Ana", n, baseline: null, frames: standing(300) });
}

test("the default list is the Boxer fight and every id in it is a real move or idle", () => {
  const params = parseParams("", KNOWN);
  expect(params.moves).toEqual(DEFAULT_MOVES);
  expect(params.dropped).toEqual([]);
  expect(params.takes).toBe(2);
  expect(params.person).toBeNull();
});

test("parameters are read, cleaned and clamped, and unknown ids are dropped", () => {
  const params = parseParams("?person=Ana%20M&moves=idle,jab,, nope ,jab&takes=9", KNOWN);
  expect(params).toEqual({ person: "ana_m", moves: ["idle", "jab"], takes: 5, dropped: ["nope"] });
  expect(parseParams("?takes=0", KNOWN).takes).toBe(1);
  expect(parseParams("?takes=abc", KNOWN).takes).toBe(2);
});

test("takes are planned move by move, round by round", () => {
  expect(planTakes(["idle", "jab"], 2)).toEqual([
    { move: "idle", take: 1 }, { move: "jab", take: 1 }, { move: "idle", take: 2 }, { move: "jab", take: 2 },
  ]);
  expect(sessionSeconds(20)).toBe(10 + 20 * 12);
});

test("a session survives packing and unpacking, and a bad one is refused with a reason", () => {
  const traces = [stored("jab", 1), stored("idle", 2)];
  const back = unpackSession(packSession(traces));
  expect(back.map((t) => t.move)).toEqual(["jab", "idle"]);
  back.forEach((t) => loadTrace(t));
  expect(() => unpackSession('{"version":2}')).toThrow(/version/);
  expect(() => unpackSession("3")).toThrow(/not an object/);
  expect(() => unpackSession('{"version":1}')).toThrow(/no traces/);
  expect(() => unpackSession(JSON.stringify({ version: 1, traces: [{ ...stored("jab", 1), frames: [] }] }))).toThrow(/trace 1 is not usable: trace has no frames/);
});

test("file names carry the person and the clock, and numbering never reuses a number", () => {
  expect(sessionFileName("Ana M", new Date(2026, 10, 14, 9, 5, 7))).toBe("session-ana_m-20261114-090507.json");
  const taken = ["jab-ana-1.json", "jab-ana-4.json", "jab-bob-9.json", "jab-ana-x.json", "hook-ana-7.json"];
  expect(nextFreeNumber(taken, "jab", "Ana")).toBe(5);
  expect(nextFreeNumber(taken, "cross", "ana")).toBe(1);
});
