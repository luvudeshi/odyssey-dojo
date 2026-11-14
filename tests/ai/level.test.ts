// The level contract: fallbacks are valid, repair clamps everything, and the client never rejects.
import { expect, test } from "vitest";
import { generateLevel } from "../../src/ai/client";
import { GOD_IDS, LIMITS, LevelSpecSchema } from "../../src/ai/contracts";
import type { LevelRequest } from "../../src/ai/contracts";
import { FALLBACK_COUNT, fallbackLevel } from "../../src/ai/fallbacks";
import { fitFightLength, repairLevel } from "../../src/ai/repair";

const request: LevelRequest = { phrase: "like a Texas thunderstorm", god: "athena", rival_god: "poseidon", epithet: "grey-eyed, unyielding" };
const base = fallbackLevel(request);
const total = (level: { phases: readonly { duration_s: number }[] }): number =>
  level.phases.reduce((sum, phase) => sum + phase.duration_s, 0);

test("every fallback is a valid level for every god, with the names written in", () => {
  const phrases = ["like a Texas thunderstorm", "like a drunk kung fu master", "heavy as a mountain", "quick and precise", "calm, patient", "xyzzy", "", "?!"];
  const titles = new Set<string>();
  for (const phrase of phrases) {
    for (const god of GOD_IDS) {
      const level = fallbackLevel({ phrase: phrase === "" ? "x" : phrase, god, rival_god: "zeus" });
      expect(LevelSpecSchema.safeParse(level).success, `${phrase}/${god}`).toBe(true);
      expect(JSON.stringify(level)).not.toMatch(/\{\w+\}/);
      expect(total(level)).toBeGreaterThanOrEqual(LIMITS.fightSeconds[0]);
      expect(total(level)).toBeLessThanOrEqual(LIMITS.fightSeconds[1]);
      titles.add(level.title);
    }
  }
  expect(titles.size).toBe(FALLBACK_COUNT);
  expect(base.title).toContain("Storm");
  expect(base.narration_intro).toContain("Athena the grey-eyed, unyielding");
  expect(base.narration_intro).toContain("Poseidon");
  expect(fallbackLevel({ ...request, phrase: "like a drunk kung fu master" }).title).toContain("Riot");
  expect(fallbackLevel({ ...request, phrase: "zzz" })).toEqual(fallbackLevel({ ...request, phrase: "zzz" }));
});

test("repair clamps wild numbers, drops bad items and fills gaps from the fallback", () => {
  const wild = {
    title: "  The   Thunder  Waltz ",
    interpretation: "",
    arena: { setting: "A cliff", palette: ["#FFF", "red", "#12ab9Z", "#0A0B0C"], weather: "hail", lighting: "NIGHT" },
    monster: { base: "dragon", name: "Stormcaller", speed: 99, aggression: -4, erratic: 2 },
    attack_pool: [
      { type: "strike", direction: "left", telegraph_ms: 5, combo: 9.6, weight: 7 },
      { type: "laser", direction: "left", telegraph_ms: 500, combo: 1, weight: 1 },
      "nonsense",
      { type: "feint", direction: "center", telegraph_ms: 99999, combo: 0, weight: -1 },
    ],
    tempo_bpm: 900,
    phases: [{ name: "One", duration_s: 500, intensity: 5 }],
    taunts: ["Boo", 7, "   "],
    narration_intro: "Sing, Muse.",
    narration_outro_win: "",
    narration_outro_lose: "Rise.",
  };
  const level = repairLevel(wild, base);
  expect(level).not.toBeNull();
  if (!level) return;
  expect(LevelSpecSchema.safeParse(level).success).toBe(true);
  expect(level.title).toBe("The Thunder Waltz");
  expect(level.interpretation).toBe(base.interpretation);
  expect(level.arena.palette.slice(0, 2)).toEqual(["#ffffff", "#0a0b0c"]);
  expect(level.arena.palette.length).toBe(3);
  expect(level.arena.weather).toBe(base.arena.weather);
  expect(level.arena.lighting).toBe("night");
  expect(level.monster).toEqual({ base: base.monster.base, name: "Stormcaller", speed: 1.5, aggression: 0.2, erratic: 1 });
  expect(level.attack_pool[0]).toEqual({ type: "strike", direction: "left", telegraph_ms: 350, combo: 4, weight: 1 });
  expect(level.attack_pool[1]).toEqual({ type: "feint", direction: "center", telegraph_ms: 1500, combo: 1, weight: 0 });
  expect(level.attack_pool.length).toBe(LIMITS.attacks[0]);
  expect(level.tempo_bpm).toBe(170);
  expect(level.phases.length).toBe(2);
  expect(total(level)).toBeGreaterThanOrEqual(60);
  expect(level.taunts[0]).toBe("Boo");
  expect(level.taunts.length).toBe(4);
  expect(level.narration_outro_win).toBe(base.narration_outro_win);
});

test("repair refuses things that are not levels, and levels with no usable attack", () => {
  expect(repairLevel(null, base)).toBeNull();
  expect(repairLevel("a level", base)).toBeNull();
  expect(repairLevel({ title: "x" }, base)).toBeNull();
  expect(repairLevel({ ...base, attack_pool: [{ type: "nope" }] }, base)).toBeNull();
  expect(repairLevel(base, base)).toEqual(base);
  const zeroWeights = repairLevel({ ...base, attack_pool: base.attack_pool.map((a) => ({ ...a, weight: 0 })) }, base);
  expect(zeroWeights?.attack_pool.every((a) => a.weight === 0.5)).toBe(true);
});

test("fight length is pulled into 60 to 90 seconds without leaving the per-phase range", () => {
  const phase = (duration_s: number) => ({ name: "p", duration_s, intensity: 0.5 });
  for (const lengths of [[15, 15], [40, 40, 40, 40], [15, 40], [20, 20, 20], [1, 1000]]) {
    const fitted = fitFightLength(lengths.map(phase));
    const sum = fitted.reduce((s, p) => s + p.duration_s, 0);
    expect(sum, String(lengths)).toBeGreaterThanOrEqual(60);
    expect(sum, String(lengths)).toBeLessThanOrEqual(90);
    for (const p of fitted) {
      expect(p.duration_s).toBeGreaterThanOrEqual(15);
      expect(p.duration_s).toBeLessThanOrEqual(40);
    }
  }
});

test("the client returns the server's level, and a bundled one when the server is down, slow or wrong", async () => {
  const json = (body: unknown, status = 200): typeof fetch => () =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  const good = await generateLevel(request, { fetcher: json({ level: { ...base, title: "From the server" }, source: "ai" }) });
  expect(good).toMatchObject({ source: "ai", level: { title: "From the server" } });

  const down: typeof fetch = () => Promise.reject(new TypeError("fetch failed"));
  const hung: typeof fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => { reject(new DOMException("timed out", "TimeoutError")); });
    });
  for (const fetcher of [down, hung, json({ error: "x" }, 500), json({ level: { title: "broken" }, source: "ai" })]) {
    const result = await generateLevel(request, { fetcher, timeoutMs: 30 });
    expect(result).toEqual({ level: base, source: "fallback" });
  }
});
