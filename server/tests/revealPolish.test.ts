// Athena coaches the player, so she is never the rival on any path, and the reveal's lines read as finished text.
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test } from "vitest";
import { GOD_IDS, RevealResponseSchema } from "../../src/ai/contracts";
import type { GodId } from "../../src/ai/contracts";
import { fallbackLevel } from "../../src/ai/fallbacks";
import { GODS } from "../../src/ai/gods/gods";
import { lotReason, offlineReveal } from "../../src/ai/gods/offlineReveal";
import { STANCES } from "../../src/ai/gods/stance";
import { TINTS } from "../../src/ai/gods/tint";
import { revealGod } from "../../src/ai/revealGod";
import { asSentence, REASON_MAX } from "../../src/ai/revealText";
import { RIVALS, rivalFor } from "../../src/ai/rivals";
import { NO_AI } from "../ai/types";
import type { AiClients } from "../ai/types";
import { createApp } from "../app";
import type { Config } from "../env";
import { levelPrompt } from "../prompts";
import { asEpithet, SAFE_LINES, unfit } from "../revealGuard";
import { REVEAL_PROMPT } from "../revealPrompts";

const config: Config = {
  port: 0, geminiKey: null, elevenLabsKey: null, dataDir: "/nonexistent", publicBaseUrl: null, distDir: "/nonexistent",
  timeouts: { levelMs: 2000, revealMs: 2000, portraitMs: 2000, speechMs: 2000 },
};
const snapshot = { image: `data:image/jpeg;base64,${Buffer.from("a webcam snapshot").toString("base64")}` } as const;
const good = { epithet: "storm-hearted, unyielding", reason: "You stand as calm as a held breath." } as const;
/** What the rival must be when Athena was asked for. */
const instead = (god: GodId): GodId => (god === "poseidon" ? "zeus" : "poseidon");

let close: (() => void) | null = null;
afterEach(() => { close?.(); close = null; });

/** A server whose model gives whatever `answer.value` holds, and that records the prompts it was sent. */
async function serve(json = true): Promise<{ answer: { value: unknown }; prompts: string[]; post: (path: string, body: unknown) => Promise<Response> }> {
  const answer = { value: null as unknown };
  const prompts: string[] = [];
  const model: AiClients["json"] = (request) => { prompts.push(request.prompt); return Promise.resolve(answer.value); };
  const app = await createApp({ config, ai: { ...NO_AI, json: json ? model : null } });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  close = () => { server.close(); };
  const { port } = server.address() as AddressInfo;
  const post = (path: string, body: unknown): Promise<Response> =>
    fetch(`http://127.0.0.1:${String(port)}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { answer, prompts, post };
}

test("the rival rule never gives Athena or the god itself, and keeps any other rival asked for", () => {
  for (const god of GOD_IDS) {
    expect(RIVALS[god], god).not.toBe("athena");
    expect(GODS[god].rivals, god).not.toContain("athena");
    expect(rivalFor(god, "athena"), god).toBe(instead(god));
    for (const wanted of [...GOD_IDS, undefined]) {
      const rival = rivalFor(god, wanted);
      expect(rival, god).not.toBe("athena");
      expect(rival, god).not.toBe(god);
      if (wanted !== undefined && wanted !== god && wanted !== "athena") expect(rival, god).toBe(wanted);
    }
  }
});

test("the server rewrites an Athena rival for every god, changes nothing else, and the prompt forbids her too", async () => {
  const { answer, prompts, post } = await serve();
  for (const god of GOD_IDS) {
    answer.value = { god, ...good, rival_god: "athena" };
    const response = await post("/api/reveal", snapshot);
    expect(await response.json(), god).toEqual({ god, ...good, rival_god: instead(god), portrait_id: null });
  }
  expect(prompts[0]).toBe(REVEAL_PROMPT);
  expect(REVEAL_PROMPT).toContain("Never athena");
});

test("the browser's own scan never picks Athena as the rival, for any god and any draw", async () => {
  const gods = new Set<GodId>();
  const seeds = [...Array.from({ length: 3000 }, (_, seed) => seed), ...Array.from({ length: 3000 }, () => Math.random()), -1, NaN, Infinity];
  for (const seed of seeds) {
    const reveal = offlineReveal({ frame: null, tint: null, seed });
    gods.add(reveal.god);
    expect(reveal.rivalGod, String(seed)).not.toBe("athena");
    expect(reveal.rivalGod, String(seed)).not.toBe(reveal.god);
  }
  expect(gods).toEqual(new Set(GOD_IDS));
  // An answer from an older server that still names Athena is corrected in the browser, and nothing else changes.
  const old = { god: "apollo", ...good, rival_god: "athena", portrait_id: null } as const;
  const reveal = await revealGod({ snapshot: snapshot.image, frame: null, tint: null, seed: 1 }, { request: () => Promise.resolve(old) });
  expect(reveal).toMatchObject({ god: "apollo", ...good, rivalGod: "poseidon", source: "ai" });
});

test("a level request that still carries Athena as the rival never names her as the sender of the monster", async () => {
  const { answer, prompts, post } = await serve();
  answer.value = "not a level";
  for (const god of GOD_IDS) {
    const request = { phrase: "like a Texas thunderstorm", god, rival_god: "athena" } as const;
    const wanted = { ...request, rival_god: instead(god) };
    expect(fallbackLevel(request), god).toEqual(fallbackLevel(wanted));
    expect(levelPrompt(request), god).toBe(levelPrompt(wanted));
    expect(levelPrompt(request), god).toContain(`The rival god ${GODS[instead(god)].name} has sent`);
    if (god !== "athena") expect(JSON.stringify(fallbackLevel(request)) + levelPrompt(request), god).not.toContain("Athena");
    const response = await post("/api/level", request);
    expect(await response.json(), god).toEqual({ level: fallbackLevel(wanted), source: "fallback" });
    expect(prompts.at(-1), god).toBe(levelPrompt(wanted));
  }
});

test("the reason is made into one sentence: a capital, single spaces, one full stop, within the limit", () => {
  const cases: readonly (readonly [string, string])[] = [
    ["you match the deep green mood and restless energy of the surging tide.", "You match the deep green mood and restless energy of the surging tide."],
    ["  Your stance  surges ,\n like a rising tide  ", "Your stance surges, like a rising tide."],
    ["Your stance surges like a rising tide!!", "Your stance surges like a rising tide."],
    ["Your stance surges like a rising tide...", "Your stance surges like a rising tide."],
    ["\"your stance surges like a rising tide.\"", "Your stance surges like a rising tide."],
    ["You stand \"ready\"", "You stand \"ready\"."],
    // What the real model wrote for a gold picture: the god's name in lower case.
    ["You shine with the radiant and warm clothing colours of apollo.", "You shine with the radiant and warm clothing colours of Apollo."],
    [" \n ", ""],
  ];
  for (const [raw, wanted] of cases) expect(asSentence(raw), raw).toBe(wanted);
  const long = asSentence(`you ${"stand firm ".repeat(60)}`);
  expect(long.length).toBeLessThanOrEqual(REASON_MAX);
  expect(long.endsWith(" firm.") || long.endsWith(" stand.")).toBe(true);
  expect(asSentence(`you ${"x".repeat(900)}`)).toHaveLength(REASON_MAX);
  // Every line we wrote ourselves already obeys the rule and speaks to the player. The browser's scan gives them unchanged.
  const offline = [...GOD_IDS.map(lotReason), ...[...Object.values(STANCES), ...Object.values(TINTS)].map(({ reason }) => reason)];
  for (const reason of offline) {
    expect(asSentence(reason), reason).toBe(reason);
    expect(reason).toMatch(/\byou(?:rs?)?\b/i);
  }
  for (const god of GOD_IDS) {
    const lot = offlineReveal({ frame: null, tint: null, seed: GOD_IDS.indexOf(god) });
    expect(lot.reason).toBe(lotReason(lot.god));
    expect(asSentence(SAFE_LINES[god].reason), god).toBe(SAFE_LINES[god].reason);
    expect(asEpithet(SAFE_LINES[god].epithet, 80), god).toBe(SAFE_LINES[god].epithet);
    expect(unfit(god, "reason", SAFE_LINES[god].reason) || unfit(god, "epithet", SAFE_LINES[god].epithet), god).toBe(false);
  }
});

test("the server tidies the lines it shows, swaps one it cannot show for the god's fixed line, and never says it saw nobody", async () => {
  const { answer, post } = await serve();
  const seen = async (epithet: string, reason: string): Promise<{ epithet: string; reason: string }> => {
    answer.value = { god: "poseidon", epithet, reason, rival_god: "apollo" };
    const result = RevealResponseSchema.parse(await (await post("/api/reveal", snapshot)).json());
    expect(result).toMatchObject({ god: "poseidon", rival_god: "apollo", portrait_id: null });
    return { epithet: result.epithet, reason: result.reason };
  };
  const fixed = SAFE_LINES.poseidon;
  const tide = "You match the deep green mood and restless energy of the surging tide.";
  // The answer the real model gave: a lower-case reason.
  expect(await seen("earth-shaking, restless", tide.toLowerCase())).toEqual({ epithet: "earth-shaking, restless", reason: tide });
  expect((await seen(" \"Storm-Hearted, Unyielding.\" ", tide)).epithet).toBe("storm-hearted, unyielding");
  expect((await seen("Breaker of Troy's walls.", tide)).epithet).toBe("breaker of Troy's walls");
  expect((await seen("Poseidon, earth-shaker", tide)).epithet).toBe(fixed.epithet);
  expect((await seen("tide-turning", "You carry a calm that storms cannot shake")).reason).toBe("You carry a calm that storms cannot shake.");
  expect((await seen("tide-turning", "Your wide stance is Poseidon's own.")).reason).toBe("Your wide stance is Poseidon's own.");
  const swapped = [
    "Poseidon claims you, for your stance is the stance of Poseidon.",
    "The player holds a wide, restless stance.",
    "I cannot see you in this picture, so the deep green mood decided it.",
    "There is no person in the photo, but your colours are as stormy as the sea.",
    "Nobody is visible, yet your scene has a restless energy.",
    "You are not in the frame, so your colours decided it.",
  ];
  for (const reason of swapped) expect((await seen("tide-turning", reason)).reason, reason).toBe(fixed.reason);
  // When the model names no god at all the server says unavailable, and the browser then runs its own scan.
  for (const god of ["none", "no person", null]) {
    answer.value = { god, epithet: "unseen", reason: "No player is visible.", rival_god: "athena" };
    expect((await post("/api/reveal", snapshot)).status).toBe(503);
  }
});
