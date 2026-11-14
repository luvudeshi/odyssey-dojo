// The server port is always a usable number, whatever the environment says.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { loadConfig, parsePort } from "../env";

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
