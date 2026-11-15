// The god scan survives one slow or failed answer from the model: the route makes a second attempt, uses the first
// usable answer, and still says "unavailable" inside its limit when both go wrong. The first two tests run on the
// limits the real server uses (TIMEOUTS), so they take a few seconds; they run side by side.
import { afterEach, expect, test, vi } from "vitest";
import { RevealResponseSchema } from "../../src/ai/contracts";
import type { AiClients, ImageRequest, JsonRequest } from "../ai/types";
import { TIMEOUTS } from "../env";
import { captureLog, serve, stalled, timed } from "./support/drill";
import type { Drill } from "./support/drill";

/** Room for a busy machine: an answer may arrive this long after the moment the route decided on it. */
const SLACK_MS = 700;
const QUICK = { levelMs: 400, revealMs: 400, revealHedgeMs: 100, portraitMs: 400, speechMs: 400 } as const;
/** As long as a real snapshot's base64, so a leak into a log would be seen. */
const SNAPSHOT = Buffer.from("a made-up webcam snapshot, as long as a real one would be at the very least, and then some").toString("base64");
const body = { image: `data:image/jpeg;base64,${SNAPSHOT}` } as const;
const athena = { god: "athena", epithet: "storm-hearted, unyielding", reason: "You stand as calm as a held breath.", rival_god: "poseidon" } as const;
const hermes = { god: "hermes", epithet: "light-stepping, laughing", reason: "You look a step ahead already.", rival_god: "apollo" } as const;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

/** A fake model whose calls follow a script, one entry per call, and which remembers what it was sent. */
function model(script: readonly ((request: JsonRequest) => Promise<unknown>)[]): { readonly requests: JsonRequest[]; readonly json: NonNullable<AiClients["json"]> } {
  const requests: JsonRequest[] = [];
  return {
    requests,
    json: (request) => {
      const step = script[requests.length];
      requests.push(request);
      return step === undefined ? Promise.reject(new Error("a third attempt was made")) : step(request);
    },
  };
}
const after = (ms: number, answer: unknown) => (): Promise<unknown> => new Promise((resolve) => { setTimeout(() => { resolve(answer); }, ms); });
const fails = (message: string) => (): Promise<never> => Promise.reject(new Error(message));

let drill: Drill | null = null;
afterEach(() => { drill?.close(); drill = null; vi.restoreAllMocks(); });
/** The server the test is talking to. */
const up = (): Drill => {
  if (drill === null) throw new Error("no server is up");
  return drill;
};

test.concurrent("first attempt slow, second fast: the second's answer comes back about 2.5 s plus its own time after the scan began", async () => {
  const SECOND_TAKES_MS = 300;
  // The first attempt does answer, with a different god, but only after 15 s: far too late to be the one used.
  const fake = model([() => stalled(hermes), after(SECOND_TAKES_MS, athena)]);
  const server = await serve({ json: fake.json }, { timeouts: TIMEOUTS });
  try {
    const { result: response, ms } = await timed(() => server.call("/api/reveal", body));
    expect(response.status).toBe(200);
    expect(RevealResponseSchema.parse(await response.json())).toEqual({ ...athena, portrait_id: null });
    expect(ms).toBeGreaterThanOrEqual(TIMEOUTS.revealHedgeMs + SECOND_TAKES_MS - 20);
    expect(ms).toBeLessThan(TIMEOUTS.revealHedgeMs + SECOND_TAKES_MS + SLACK_MS);
    expect(fake.requests).toHaveLength(2);
    // The two attempts are the same request, and the slow one is cancelled once the other has answered.
    expect(fake.requests[1]?.image).toEqual(fake.requests[0]?.image);
    expect(fake.requests[1]?.prompt).toBe(fake.requests[0]?.prompt);
    expect(fake.requests[0]?.signal.aborted).toBe(true);
  } finally {
    server.close();
  }
});

test.concurrent("both attempts stall for 15 s: unavailable at the limit, under five seconds, and never a third attempt", async () => {
  const fake = model([() => stalled(athena), () => stalled(athena)]);
  const server = await serve({ json: fake.json }, { timeouts: TIMEOUTS });
  try {
    const { result: response, ms } = await timed(() => server.call("/api/reveal", body));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
    expect(ms).toBeGreaterThanOrEqual(TIMEOUTS.revealMs - 20);
    expect(ms).toBeLessThan(TIMEOUTS.revealMs + SLACK_MS);
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests.every((request) => request.signal.aborted)).toBe(true);
  } finally {
    server.close();
  }
});

test("the real limits leave the second attempt as long as a real scan takes, and end before the page stops waiting", () => {
  // Measured on 14 November 2026: a real scan took 0.85 to 2.3 s.
  expect(TIMEOUTS.revealMs - TIMEOUTS.revealHedgeMs).toBeGreaterThanOrEqual(2300);
  expect(TIMEOUTS.revealHedgeMs).toBeGreaterThanOrEqual(2300);
  expect(TIMEOUTS.revealMs).toBeLessThanOrEqual(4800);
});

test("a first attempt that fails fast is tried again at once, and the second answer is used", async () => {
  const log = captureLog();
  const fake = model([fails("upstream said 500"), after(20, athena)]);
  // A wait this long would show in the time taken if the retry waited for it.
  drill = await serve({ json: fake.json }, { timeouts: { ...QUICK, revealMs: 3000, revealHedgeMs: 2000 } });
  const { result: response, ms } = await timed(() => up().call("/api/reveal", body));
  expect(response.status).toBe(200);
  expect(RevealResponseSchema.parse(await response.json()).god).toBe("athena");
  expect(ms).toBeLessThan(1000);
  expect(fake.requests).toHaveLength(2);
  const logged = log.lines.join("\n");
  expect(logged).toContain("reveal_attempt_failed");
  expect(logged).toContain("upstream said 500");
  expect(logged).toContain("reveal_second_attempt");
  expect(logged).not.toContain("reveal_failed");
});

test("an answer that is not a god counts as a failed attempt: the second attempt's god is used", async () => {
  for (const junk of ["not a god", null, { god: "odin", epithet: "x", reason: "y" }, { god: "zeus" }]) {
    const fake = model([after(5, junk), after(5, hermes)]);
    drill = await serve({ json: fake.json }, { timeouts: QUICK });
    const response = await drill.call("/api/reveal", body);
    expect(response.status).toBe(200);
    expect(RevealResponseSchema.parse(await response.json()).god).toBe("hermes");
    expect(fake.requests).toHaveLength(2);
    drill.close();
    drill = null;
  }
});

test("two attempts that fail, in any mix of error and junk, are unavailable at once with exactly two calls", async () => {
  const scripts = [
    [fails("boom"), fails("boom again")],
    [after(5, "junk"), fails("boom")],
    [fails("boom"), after(5, { god: "odin" })],
    [after(5, null), after(5, null)],
  ];
  for (const script of scripts) {
    let painted = false;
    const fake = model(script);
    drill = await serve({ json: fake.json, image: () => { painted = true; return Promise.resolve(PNG); } }, { timeouts: { ...QUICK, revealMs: 3000, revealHedgeMs: 2000 } });
    const { result: response, ms } = await timed(() => up().call("/api/reveal", body));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
    expect(ms).toBeLessThan(1000);
    expect(fake.requests).toHaveLength(2);
    expect(painted).toBe(false);
    drill.close();
    drill = null;
  }
});

test("when both attempts answer, the first one in is used and one portrait is painted, for that god", async () => {
  const prompts: string[] = [];
  const fake = model([after(250, hermes), after(20, athena)]);
  drill = await serve({ json: fake.json, image: ({ prompt }) => { prompts.push(prompt); return Promise.resolve(PNG); } }, { timeouts: QUICK });
  const response = await drill.call("/api/reveal", body);
  const reveal = RevealResponseSchema.parse(await response.json());
  expect(reveal.god).toBe("athena");
  await new Promise((resolve) => setTimeout(resolve, 350));
  expect(prompts).toHaveLength(1);
  expect((await drill.call(`/api/portrait/${String(reveal.portrait_id)}`)).status).toBe(200);
});

test("the snapshot never appears in a log line, whichever way the two attempts go", async () => {
  const log = captureLog();
  const echo = (request: JsonRequest | ImageRequest): Promise<never> => Promise.reject(new Error(`refused: ${String(request.image?.base64)} is not allowed`));
  const scripts = [
    [echo, echo],
    [echo, after(5, athena)],
    [(request: JsonRequest) => stalled(request.image, 60_000), echo],
    [(request: JsonRequest) => stalled(request.image, 60_000), (request: JsonRequest) => stalled(request.image, 60_000)],
    [after(5, { god: "odin", epithet: SNAPSHOT, reason: SNAPSHOT }), after(5, { echoed: SNAPSHOT })],
  ];
  for (const script of scripts) {
    drill = await serve({ json: model(script).json, image: echo }, { timeouts: { ...QUICK, revealMs: 300, revealHedgeMs: 60 } });
    const response = await drill.call("/api/reveal", body);
    const text = await response.text();
    expect(text).not.toContain(SNAPSHOT.slice(0, 24));
    if (response.status === 200) await drill.call(`/api/portrait/${String(RevealResponseSchema.parse(JSON.parse(text)).portrait_id)}`);
    drill.close();
    drill = null;
  }
  const logged = log.lines.join("\n");
  // Every kind of line the route writes turned up, so the check below looked at all of them.
  for (const event of ["reveal_attempt_failed", "reveal_second_attempt", "reveal_failed", "portrait_failed"]) expect(logged).toContain(event);
  expect(logged).toContain("[data]");
  expect(logged).not.toContain(SNAPSHOT.slice(0, 24));
  expect(logged).not.toContain(SNAPSHOT.slice(-24));
  expect(logged).not.toContain(SNAPSHOT.slice(40, 64));
});
