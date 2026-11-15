// The god scan: the server names a god or says "unavailable" quickly, and a portrait request never fails loudly.
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test, vi } from "vitest";
import { GOD_IDS, RevealResponseSchema } from "../../src/ai/contracts";
import { RIVALS } from "../../src/ai/rivals";
import { NO_AI } from "../ai/types";
import type { AiClients, ImageRequest, JsonRequest } from "../ai/types";
import { createApp } from "../app";
import type { Config } from "../env";
import { createPortraitStore } from "../lib/portraits";
import { SAFE_LINES, speaksOfThePlayer } from "../revealGuard";
import { portraitPrompt, REVEAL_PROMPT } from "../revealPrompts";

const config: Config = {
  port: 0, geminiKey: null, elevenLabsKey: null, dataDir: "/nonexistent", publicBaseUrl: null, distDir: "/nonexistent",
  timeouts: { levelMs: 80, revealMs: 80, portraitMs: 80, speechMs: 80 },
};
const SNAPSHOT = Buffer.from("a webcam snapshot").toString("base64");
const body = { image: `data:image/jpeg;base64,${SNAPSHOT}` } as const;
const good = { god: "athena", epithet: "storm-hearted, unyielding", reason: "You stand as calm as a held breath.", rival_god: "poseidon" } as const;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([4, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);
const never = <T>(): Promise<T> => new Promise<T>(() => undefined);
const sees = (answer: unknown): AiClients["json"] => () => Promise.resolve(answer);

let close: (() => void) | null = null;
afterEach(() => { close?.(); close = null; vi.restoreAllMocks(); });

async function serve(ai: Partial<AiClients>, portraitMs = config.timeouts.portraitMs): Promise<(path: string, json?: unknown) => Promise<Response>> {
  const app = await createApp({ config: { ...config, timeouts: { ...config.timeouts, portraitMs } }, ai: { ...NO_AI, ...ai } });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  close = () => { server.close(); };
  const { port } = server.address() as AddressInfo;
  return (path, json) =>
    fetch(`http://127.0.0.1:${String(port)}${path}`, json === undefined ? {} : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json),
    });
}

async function reveal(call: (path: string, json?: unknown) => Promise<Response>): Promise<ReturnType<typeof RevealResponseSchema.parse>> {
  const response = await call("/api/reveal", body);
  expect(response.status).toBe(200);
  return RevealResponseSchema.parse(await response.json());
}

test("with no key the reveal is unavailable at once, and a bad body is a 400", async () => {
  const call = await serve({});
  const response = await call("/api/reveal", body);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "unavailable" });
  const bad: unknown[] = [{}, { image: 7 }, { image: "data:image/png;base64,AAAA" }, { image: "data:image/jpeg;base64," }, { image: "data:image/jpeg;base64,<script>" }];
  for (const json of bad) expect((await call("/api/reveal", json)).status).toBe(400);
});

test("a good answer comes back as the god, and the model is sent the bare snapshot, the prompt and a schema", async () => {
  const requests: JsonRequest[] = [];
  const call = await serve({ json: (request) => { requests.push(request); return Promise.resolve(good); } });
  expect(await reveal(call)).toEqual({ ...good, portrait_id: null });
  expect(requests).toHaveLength(1);
  expect(requests[0]?.image).toEqual({ mime: "image/jpeg", base64: SNAPSHOT });
  expect(requests[0]?.prompt).toBe(REVEAL_PROMPT);
  expect(JSON.stringify(requests[0]?.schema)).toContain("rival_god");
});

test("a rival that is the god itself, missing or unknown is replaced from the Homeric table", async () => {
  for (const rival of ["athena", "odin", undefined, 4]) {
    const call = await serve({ json: sees({ ...good, rival_god: rival }) });
    expect((await reveal(call)).rival_god).toBe("poseidon");
    close?.();
    close = null;
  }
  for (const god of GOD_IDS) {
    expect(GOD_IDS).toContain(RIVALS[god]);
    expect(RIVALS[god]).not.toBe(god);
  }
});

test("the answer's strings are tidied and cut to the contract's limits", async () => {
  const call = await serve({ json: sees({ god: " Athena ", epithet: "  storm-hearted,\n unyielding ", reason: `you ${"x".repeat(900)}`, rival_god: "ZEUS" }) });
  const result = await reveal(call);
  expect(result.god).toBe("athena");
  expect(result.rival_god).toBe("zeus");
  expect(result.epithet).toBe("storm-hearted, unyielding");
  expect(result.reason).toHaveLength(240);
});

test("a line about the player's body, age, looks or gender is swapped for the god's fixed line", async () => {
  const cases = [
    { epithet: "grey-eyed, unyielding", reason: good.reason, swapped: ["epithet"] },
    { epithet: "white-armed, fair-haired", reason: "Your golden hair shines like the sun.", swapped: ["epithet", "reason"] },
    { epithet: "Lady of the bow", reason: good.reason, swapped: ["epithet"] },
    { epithet: good.epithet, reason: "You are a handsome young man with a commanding stance.", swapped: ["reason"] },
    { epithet: "bold, commanding", reason: "Your striking red jacket and warm grin command the room.", swapped: [] },
  ] as const;
  for (const { epithet, reason, swapped } of cases) {
    const call = await serve({ json: sees({ ...good, god: "artemis", epithet, reason }) });
    const result = await reveal(call);
    expect(result.epithet).toBe(swapped.some((field) => field === "epithet") ? SAFE_LINES.artemis.epithet : epithet);
    expect(result.reason).toBe(swapped.some((field) => field === "reason") ? SAFE_LINES.artemis.reason : reason);
    close?.();
    close = null;
  }
  for (const god of GOD_IDS) {
    const { epithet, reason } = SAFE_LINES[god];
    expect(speaksOfThePlayer(epithet)).toBe(false);
    expect(speaksOfThePlayer(reason)).toBe(false);
    expect(RevealResponseSchema.safeParse({ god, epithet, reason, rival_god: RIVALS[god], portrait_id: null }).success).toBe(true);
  }
});

test("an error that echoes the request cannot put the snapshot in the log", async () => {
  const snapshot = Buffer.from("a much longer webcam snapshot, as long as a real one would be at the very least").toString("base64");
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const echo = (request: JsonRequest | ImageRequest): Promise<never> =>
    Promise.reject(new Error(`bad request: ${String(request.image?.base64)} was refused`));
  const failed = await serve({ json: echo });
  expect((await failed("/api/reveal", { image: `data:image/jpeg;base64,${snapshot}` })).status).toBe(503);
  close?.();
  const call = await serve({ json: sees(good), image: echo });
  const response = await call("/api/reveal", { image: `data:image/jpeg;base64,${snapshot}` });
  const { portrait_id: id } = RevealResponseSchema.parse(await response.json());
  expect((await call(`/api/portrait/${String(id)}`)).status).toBe(204);
  const logged = warn.mock.calls.map((call) => String(call[0])).join("\n");
  expect(logged).toContain("reveal_failed");
  expect(logged).toContain("portrait_failed");
  expect(logged).toContain("bad request: [data] was refused");
  expect(logged).not.toContain(snapshot.slice(0, 24));
  expect(logged).not.toContain(snapshot.slice(-24));
});

test("a model that throws, hangs or returns junk is unavailable, quickly", async () => {
  const cases: AiClients["json"][] = [
    () => Promise.reject(new Error("boom")),
    () => never(),
    sees("not a god"),
    sees(null),
    sees({ ...good, god: "odin" }),
    sees({ god: "zeus" }),
  ];
  for (const json of cases) {
    let painted = false;
    const call = await serve({ json, image: () => { painted = true; return Promise.resolve(PNG); } });
    const started = Date.now();
    const response = await call("/api/reveal", body);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(painted).toBe(false);
    close?.();
    close = null;
  }
});

test("a painted portrait is served with the content type read from its first bytes", async () => {
  for (const [bytes, type] of [[PNG, "image/png"], [JPEG, "image/jpeg"], [WEBP, "image/webp"]] as const) {
    const requests: ImageRequest[] = [];
    const call = await serve({ json: sees({ ...good, god: "hermes" }), image: (request) => { requests.push(request); return Promise.resolve(bytes); } });
    const { portrait_id: id } = await reveal(call);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(requests[0]?.image).toEqual({ mime: "image/jpeg", base64: SNAPSHOT });
    expect(requests[0]?.prompt).toBe(portraitPrompt("hermes"));
    const response = await call(`/api/portrait/${String(id)}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(type);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(Buffer.from(await response.arrayBuffer()).equals(bytes)).toBe(true);
    close?.();
    close = null;
  }
});

test("the reveal does not wait for the portrait", async () => {
  let finish: (bytes: Buffer) => void = () => undefined;
  const call = await serve({ json: sees(good), image: () => new Promise((resolve) => { finish = resolve; }) }, 5000);
  const started = Date.now();
  const { portrait_id: id } = await reveal(call);
  expect(Date.now() - started).toBeLessThan(2000);
  finish(PNG);
  expect((await call(`/api/portrait/${String(id)}`)).status).toBe(200);
});

test("a portrait that fails, hangs, is empty, is not an image or was never asked for is a 204, quickly", async () => {
  const cases: AiClients["image"][] = [
    () => Promise.reject(new Error("boom")),
    () => never(),
    () => Promise.resolve(null),
    () => Promise.resolve(Buffer.alloc(0)),
    () => Promise.resolve(Buffer.from("<html>not an image</html>")),
  ];
  for (const image of cases) {
    const call = await serve({ json: sees(good), image });
    const { portrait_id: id } = await reveal(call);
    const started = Date.now();
    const response = await call(`/api/portrait/${String(id)}`);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(Date.now() - started).toBeLessThan(2000);
    close?.();
    close = null;
  }
  const call = await serve({ json: sees(good), image: () => Promise.resolve(PNG) });
  expect((await call("/api/portrait/no-such-id")).status).toBe(204);
  expect((await call("/api/portrait/%2e%2e%2f.env")).status).toBe(204);
  // Express cannot decode this id, which must still not be a 500.
  const mangled = await call("/api/portrait/%E0%A4%A");
  expect(mangled.status).toBe(204);
  expect(await mangled.text()).toBe("");
});

test("a hanging portrait is given up on counting from the reveal, not from when it is asked for", async () => {
  const call = await serve({ json: sees(good), image: () => never() }, 600);
  const { portrait_id: id } = await reveal(call);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const started = Date.now();
  expect((await call(`/api/portrait/${String(id)}`)).status).toBe(204);
  expect(Date.now() - started).toBeLessThan(450);
});

test("only the newest 20 portraits are kept", async () => {
  const call = await serve({ json: sees(good), image: () => Promise.resolve(PNG) });
  const ids: string[] = [];
  for (let index = 0; index < 21; index += 1) ids.push(String((await reveal(call)).portrait_id));
  expect(new Set(ids).size).toBe(21);
  expect((await call(`/api/portrait/${String(ids[0])}`)).status).toBe(204);
  expect((await call(`/api/portrait/${String(ids[1])}`)).status).toBe(200);
  expect((await call(`/api/portrait/${String(ids[20])}`)).status).toBe(200);
});

test("the portrait store forgets a portrait when its time is up and survives a painting that rejects", async () => {
  const store = createPortraitStore({ keepMs: 30 });
  const id = store.add(Promise.resolve(PNG));
  expect(await store.get(id)).toEqual({ bytes: PNG, type: "image/png" });
  expect(await store.get(store.add(Promise.reject(new Error("boom"))))).toBeNull();
  await new Promise((resolve) => setTimeout(resolve, 80));
  expect(await store.get(id)).toBeNull();
});

test("the prompts carry the hard rules and every god has a portrait", () => {
  for (const god of GOD_IDS) expect(REVEAL_PROMPT).toContain(god);
  expect(REVEAL_PROMPT).toMatch(/ONLY from the expression, the stance, the colours of the clothing and the energy of the pose/);
  expect(REVEAL_PROMPT).toMatch(/Never mention or use body shape, size, age, gender, skin, hair, face or attractiveness/);
  expect(REVEAL_PROMPT).toMatch(/Do not identify the person/);
  expect(REVEAL_PROMPT).toMatch(/never a body part, hair, skin, eyes, height, age or beauty/);
  expect(REVEAL_PROMPT).toMatch(/no gendered word/);
  expect(REVEAL_PROMPT).toMatch(/judge only the one nearest the centre/);
  expect(REVEAL_PROMPT).toMatch(/sea-coloured clothing/);
  expect(REVEAL_PROMPT).toMatch(/golden clothing/);
  // The prompt's own example epithets must pass the check the answers are held to.
  const examples = /such as "([^"]+)" or "([^"]+)"/.exec(REVEAL_PROMPT)?.slice(1) ?? [];
  expect(examples).toHaveLength(2);
  for (const example of examples) expect(speaksOfThePlayer(example)).toBe(false);
  const looks = new Set<string>();
  for (const god of GOD_IDS) {
    const prompt = portraitPrompt(god);
    expect(prompt).toMatch(/facial structure, proportions, hairstyle, expression and pose/);
    expect(prompt).toMatch(/clearly recognisable/);
    expect(prompt).toMatch(/Add no text/);
    expect(prompt).toMatch(/laurel wreath/);
    expect(prompt).toMatch(/portray only the one nearest the centre/);
    expect(prompt).toMatch(/The figure is clothed/);
    expect(prompt).not.toMatch(/upright|centred/);
    looks.add(prompt);
  }
  expect(looks.size).toBe(GOD_IDS.length);
  expect(portraitPrompt("zeus")).toMatch(/white marble statue bust.*thunderbolt/s);
  expect(portraitPrompt("apollo")).toMatch(/red-figure Greek vase painting.*lyre/s);
  expect(portraitPrompt("hermes")).toMatch(/red-figure/);
});
