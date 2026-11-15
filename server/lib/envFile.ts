// Reads a .env file into the environment. Node's own loader reads the bytes as plain UTF-8, so a file saved by a
// Windows tool with a byte order mark loses its first key, and one written by PowerShell's ">" (UTF-16) loses them all.
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { log } from "../../src/core/log";

/** The text of a .env file: UTF-8 with or without a byte order mark, or little-endian UTF-16 with one. */
export function decodeEnvFile(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString("utf16le");
  const text = bytes.toString("utf8");
  return text.startsWith("﻿") ? text.slice(1) : text;
}

/**
 * Sets every variable in the file that the environment does not have yet, as process.loadEnvFile does.
 * A file that is not there is not an error. Values are never logged.
 */
export function loadEnvFile(file: string, env: NodeJS.ProcessEnv = process.env): void {
  let bytes: Buffer;
  try {
    bytes = readFileSync(file);
  } catch (error) {
    const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
    if (!missing) log("warn", "env_file_unreadable", error);
    return;
  }
  for (const [name, value] of Object.entries(parseEnv(decodeEnvFile(bytes)))) {
    if (value !== undefined) env[name] ??= value;
  }
}
