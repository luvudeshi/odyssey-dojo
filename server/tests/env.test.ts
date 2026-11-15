// The server port is always a usable number, whatever the environment says, and the public address follows a tunnel as it starts and stops.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { loadConfig, parsePort } from "../env";
import { TUNNEL_FILE } from "../lib/address";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

test("a port that is not a whole number from 1 to 65535 falls back to 8787 with a warning", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  expect(parsePort(null)).toBe(8787);
  expect(parsePort("3000")).toBe(3000);
  expect(parsePort("65535")).toBe(65535);
  expect(warn).not.toHaveBeenCalled();
  const bad = ["abc", "80a", "0", "-1", "65536", "99999999999", "8787.5", "1e3", "0x50", "NaN"];
  for (const raw of bad) expect(parsePort(raw), raw).toBe(8787);
  expect(warn).toHaveBeenCalledTimes(bad.length);
});

test("loadConfig reads AI_SERVER_PORT and never yields NaN", () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const root = mkdtempSync(join(tmpdir(), "env-"));
  try {
    vi.stubEnv("AI_SERVER_PORT", "9100");
    expect(loadConfig(root).port).toBe(9100);
    vi.stubEnv("AI_SERVER_PORT", "eighty");
    expect(loadConfig(root).port).toBe(8787);
    vi.stubEnv("AI_SERVER_PORT", "");
    expect(loadConfig(root).port).toBe(8787);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the public address is PUBLIC_BASE_URL or PUBLIC_URL when set, else a running tunnel's, looked up on every read", () => {
  const root = mkdtempSync(join(tmpdir(), "env-"));
  const tunnel = "https://kingston-inside-best-graphic.trycloudflare.com";
  const file = join(root, "server/data", TUNNEL_FILE);
  try {
    vi.stubEnv("PUBLIC_BASE_URL", "");
    vi.stubEnv("PUBLIC_URL", "");
    // One config, as the running server has: it sees the tunnel come and go without a restart.
    const config = loadConfig(root);
    expect(config.publicBaseUrl).toBeNull();
    mkdirSync(join(root, "server/data"), { recursive: true });
    writeFileSync(file, JSON.stringify({ url: tunnel, pid: process.pid }));
    expect(config.publicBaseUrl).toBe(tunnel);
    rmSync(file);
    expect(config.publicBaseUrl).toBeNull();

    writeFileSync(file, JSON.stringify({ url: tunnel, pid: process.pid }));
    vi.stubEnv("PUBLIC_URL", "https://named.example");
    expect(loadConfig(root).publicBaseUrl).toBe("https://named.example");
    vi.stubEnv("PUBLIC_BASE_URL", "http://192.168.1.20:8787");
    expect(loadConfig(root).publicBaseUrl).toBe("http://192.168.1.20:8787");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
