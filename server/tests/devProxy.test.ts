// Local play with `npm run dev:all` goes browser -> Vite -> Vite's proxy -> the server.
// The guard refuses anything that says it was passed on, so the proxy must not add such a header. This runs the real proxy to see.
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, loadConfigFromFile } from "vite";
import type { ProxyOptions } from "vite";
import { afterAll, afterEach, expect, test } from "vitest";
import { NO_AI } from "../ai/types";
import { createApp } from "../app";
import type { Config } from "../env";

const config: Config = {
  port: 0, geminiKey: null, elevenLabsKey: null, dataDir: "/nonexistent", publicBaseUrl: null, distDir: "/nonexistent",
  timeouts: { levelMs: 80, revealMs: 80, portraitMs: 80, speechMs: 80 },
};
const LEVEL = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phrase: "quick and precise", god: "athena", rival_god: "zeus" }) };

// An empty page for Vite to serve; only its proxy is under test.
const root = mkdtempSync(join(tmpdir(), "odyssey-vite-"));
writeFileSync(join(root, "index.html"), "<!doctype html><title>dev</title>");
afterAll(() => { rmSync(root, { recursive: true, force: true }); });

const closers: (() => unknown)[] = [];
afterEach(async () => {
  for (const closer of closers.splice(0)) await closer();
});

/** The real app on a loopback port. */
async function listenApp(): Promise<string> {
  const app = await createApp({ config, ai: NO_AI });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  closers.push(() => { server.close(); });
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

/** The proxy rules from this repo's vite.config.ts with every option kept, pointed at `target` instead of port 8787. */
async function repoProxy(target: string): Promise<Record<string, ProxyOptions>> {
  const loaded = await loadConfigFromFile({ command: "serve", mode: "development" }, fileURLToPath(new URL("../../vite.config.ts", import.meta.url)));
  const rules = loaded?.config.server?.proxy ?? {};
  return Object.fromEntries(Object.entries(rules).map(([path, rule]) => [path, { ...(typeof rule === "string" ? {} : rule), target }]));
}

/** A Vite dev server with those proxy rules, on a free loopback port. */
async function listenVite(proxy: Record<string, ProxyOptions>): Promise<string> {
  const vite = await createServer({
    configFile: false, root, logLevel: "silent", cacheDir: join(root, ".vite"),
    server: { host: "127.0.0.1", port: 0, proxy, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true },
  });
  await vite.listen();
  closers.push(() => vite.close());
  return `http://127.0.0.1:${String((vite.httpServer?.address() as AddressInfo).port)}`;
}

test("a spending route called through the dev proxy, as the game does in npm run dev:all, is still answered", async () => {
  const proxy = await repoProxy(await listenApp());
  expect(Object.keys(proxy)).toContain("/api");
  const dev = await listenVite(proxy);
  expect((await fetch(`${dev}/api/level`, LEVEL)).status).toBe(200);
  expect((await fetch(`${dev}/api/health`)).status).toBe(200);
  expect((await fetch(`${dev}/api/portrait/x`)).status).not.toBe(403);
});

test("with xfwd turned on the same proxy would be refused, so vite.config.ts must leave it off", async () => {
  const proxy = await repoProxy(await listenApp());
  const dev = await listenVite(Object.fromEntries(Object.entries(proxy).map(([path, rule]) => [path, { ...rule, xfwd: true }])));
  expect((await fetch(`${dev}/api/level`, LEVEL)).status).toBe(403);
  expect((await fetch(`${dev}/api/health`)).status).toBe(200);
});
