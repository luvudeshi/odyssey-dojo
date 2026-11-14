// The browser side of the god scan: both calls answer null on any trouble and never reject or hang.
import { expect, test } from "vitest";
import { fetchPortrait, requestReveal } from "../../src/ai/reveal";

const SNAPSHOT = "data:image/jpeg;base64,AAAA";
const good = { god: "athena", epithet: "grey-eyed, unyielding", reason: "You stand as calm as a held breath.", rival_god: "poseidon", portrait_id: "abc" } as const;
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const image = (type: string, bytes = [1, 2, 3]): Response => new Response(new Uint8Array(bytes), { headers: { "Content-Type": type } });
const answers = (make: () => Response): typeof fetch => () => Promise.resolve(make());
/** A server that never answers and ignores the abort signal. */
const hangs: typeof fetch = () => new Promise<Response>(() => undefined);
/** A server that never answers but gives up when the request is aborted, like the real fetch. */
const stalls: typeof fetch = (_input, init) =>
  new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener("abort", () => { reject(new Error("aborted")); });
  });

test("requestReveal posts the snapshot as JSON and returns the validated answer", async () => {
  const calls: { url: unknown; method: string | undefined; body: unknown }[] = [];
  const fetcher: typeof fetch = (input, init) => {
    calls.push({ url: input, method: init?.method, body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
    return Promise.resolve(json(good));
  };
  expect(await requestReveal(SNAPSHOT, { fetcher })).toEqual(good);
  expect(calls).toEqual([{ url: "/api/reveal", method: "POST", body: { image: SNAPSHOT } }]);
  expect(await requestReveal(SNAPSHOT, { fetcher: answers(() => json({ ...good, portrait_id: null })) })).toEqual({ ...good, portrait_id: null });
});

test("requestReveal is null when the server is unavailable, down, slow or answers with junk", async () => {
  const cases: (typeof fetch)[] = [
    answers(() => json({ error: "unavailable" }, 503)),
    answers(() => json({ error: "server_error" }, 500)),
    () => Promise.reject(new TypeError("fetch failed")),
    () => { throw new Error("no fetch here"); },
    answers(() => new Response("<html>a proxy error page</html>")),
    answers(() => json({ ...good, god: "odin" })),
    answers(() => json({ god: "athena" })),
    answers(() => json({ ...good, portrait_id: 7 })),
    hangs,
    stalls,
  ];
  for (const fetcher of cases) {
    const started = Date.now();
    expect(await requestReveal(SNAPSHOT, { fetcher, timeoutMs: 40 })).toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
  }
});

test("fetchPortrait asks for the portrait by id and returns the image", async () => {
  const urls: unknown[] = [];
  const fetcher: typeof fetch = (input) => {
    urls.push(input);
    return Promise.resolve(image("image/png"));
  };
  const portrait = await fetchPortrait("abc/1", { fetcher });
  expect(urls).toEqual(["/api/portrait/abc%2F1"]);
  expect(portrait?.type).toBe("image/png");
  expect(portrait?.size).toBe(3);
});

test("fetchPortrait is null when there is no portrait, on any failure, or when it takes too long", async () => {
  const cases: (typeof fetch)[] = [
    answers(() => new Response(null, { status: 204 })),
    answers(() => json({ error: "not_found" }, 404)),
    answers(() => json({ error: "server_error" }, 500)),
    answers(() => new Response("<html>a proxy error page</html>", { headers: { "Content-Type": "text/html" } })),
    answers(() => image("image/png", [])),
    () => Promise.reject(new TypeError("fetch failed")),
    hangs,
    stalls,
  ];
  for (const fetcher of cases) {
    const started = Date.now();
    expect(await fetchPortrait("abc", { fetcher, timeoutMs: 40 })).toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
  }
});
