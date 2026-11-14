// The god scan uses the server when it answers and the browser's own scan when it does not.
import { expect, test } from "vitest";
import type { RevealResponse } from "../../src/ai/contracts";
import { GOD_IDS } from "../../src/ai/gods/gods";
import { revealGod } from "../../src/ai/revealGod";

const answer: RevealResponse = { god: "athena", epithet: "grey-eyed", reason: "A steady stance.", rival_god: "poseidon", portrait_id: "p1" };
const input = { snapshot: "data:image/jpeg;base64,AAAA", frame: null, tint: null, seed: 42 };
const drawPortrait = (god: string): string => `marble:${god}`;
const toUrl = (): string => "blob:painted";

test("the server's god is used, with the AI portrait when it arrives", async () => {
  const reveal = await revealGod(input, {
    request: () => Promise.resolve(answer),
    portrait: () => Promise.resolve(new Blob(["x"], { type: "image/png" })),
    drawPortrait, toUrl,
  });
  expect(reveal).toMatchObject({ god: "athena", epithet: "grey-eyed", rivalGod: "poseidon", source: "ai" });
  expect(await reveal.portrait).toBe("blob:painted");
});

test("a missing, failed or absent AI portrait falls back to the one drawn in the browser", async () => {
  const cases = [
    { request: () => Promise.resolve(answer), portrait: () => Promise.resolve(null) },
    { request: () => Promise.resolve(answer), portrait: () => Promise.reject(new Error("boom")) },
    { request: () => Promise.resolve({ ...answer, portrait_id: null }), portrait: () => Promise.reject(new Error("unused")) },
  ];
  for (const deps of cases) {
    const reveal = await revealGod(input, { ...deps, drawPortrait, toUrl });
    expect(reveal.source).toBe("ai");
    expect(await reveal.portrait).toBe("marble:athena");
  }
});

test("with no answer from the server, or no snapshot, the browser picks the god and never calls out for a portrait", async () => {
  let asked = 0;
  const request = (): Promise<null> => { asked += 1; return Promise.resolve(null); };
  const portrait = (): Promise<never> => Promise.reject(new Error("must not be called"));
  const offline = await revealGod(input, { request, portrait, drawPortrait, toUrl });
  expect(asked).toBe(1);
  expect(offline.source).toBe("offline");
  expect(GOD_IDS).toContain(offline.god);
  expect(offline.rivalGod).not.toBe(offline.god);
  expect(await offline.portrait).toBe(`marble:${offline.god}`);

  const noCamera = await revealGod({ ...input, snapshot: null }, { request, portrait, toUrl });
  expect(asked).toBe(1);
  expect(noCamera.source).toBe("offline");
  expect(await noCamera.portrait).toBeNull();
  expect(noCamera).toMatchObject({ god: offline.god, epithet: offline.epithet });
});
