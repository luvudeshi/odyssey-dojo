// Run this before the judges arrive. It prints one line per check and exits 1 only on a FAIL (a missing Athena clip or pose file):
//   npx tsx server/tools/preflight.ts             every check
//   npx tsx server/tools/preflight.ts --offline   skip the two calls that need the internet
// It never prints a key or any part of the database's address, and it spends no ElevenLabs credits.
import { resolve } from "node:path";
import { createElevenLabs } from "../ai/elevenlabs";
import { createGemini } from "../ai/gemini";
import { loadConfig } from "../env";
import { dbSecrets, isChecked, openDb } from "../lib/db";
import type { DatabaseAnswer, Result } from "../lib/preflightChecks";
import {
  checkAccounts,
  checkClips,
  checkElevenLabs,
  checkGemini,
  checkKeys,
  checkPoseFiles,
  checkServer,
  formatLine,
  hide,
  skipAccounts,
  summary,
} from "../lib/preflightChecks";

/** How long the voices list may take. It is a small GET, so this is generous. */
const VOICES_MS = 8000;
/** The keys and the parts of the database's address, kept here so the crash line below can hide them too. */
let secrets: readonly (string | null)[] = [];

/**
 * Opens the database the way the server does (same address, same CA file, same limits), asks it one `select 1` and
 * closes it. Nothing is written. What comes back is a reason and a short code, never the driver's message.
 */
async function askDatabase(url: string, caFile: string | null): Promise<DatabaseAnswer> {
  let why: { reason: string; code: string | null } = { reason: "no_answer", code: null };
  const started = Date.now();
  const db = await openDb(url, { caFile, onOff: (reason, code) => { why = { reason, code }; } });
  if (db === null) return { open: false, ...why };
  await db.close();
  return { open: true, checked: isChecked(url, caFile), ms: Date.now() - started };
}

async function main(): Promise<void> {
  const offline = process.argv.includes("--offline");
  const root = process.cwd();
  const config = loadConfig(root);
  const databaseUrl = config.databaseUrl ?? null;
  const caFile = config.databaseCaFile ?? null;
  secrets = [config.geminiKey, config.elevenLabsKey, ...dbSecrets(databaseUrl)];
  const keys = { gemini: config.geminiKey !== null, elevenLabs: config.elevenLabsKey !== null };
  const results: Result[] = [];
  // A person reads this in a terminal, so it is plain lines on stdout, not the JSON lines log() writes.
  const say = (text: string): void => { process.stdout.write(`${text}\n`); };
  const report = (line: Result): void => {
    results.push(line);
    say(formatLine(line, secrets));
  };

  report(checkClips(resolve(root, "public/audio")));
  report(checkPoseFiles(resolve(root, "public")));
  report(checkKeys(keys));
  if (offline) {
    report({ level: "SKIP", name: "gemini", detail: "--offline" });
    report({ level: "SKIP", name: "elevenlabs", detail: "--offline" });
  } else {
    const json = config.geminiKey === null ? null : createGemini(config.geminiKey).json;
    const voices = config.elevenLabsKey === null ? null : createElevenLabs(config.elevenLabsKey).voices;
    // Both at once, so a dead network costs one timeout, not two.
    const [gemini, eleven] = await Promise.all([
      // The scan's limit: this is one tiny call, and the level's own limit is the long one.
      checkGemini(json, config.timeouts.revealMs),
      checkElevenLabs(voices, VOICES_MS),
    ]);
    report(gemini);
    report(eleven);
  }
  report(await checkServer(config.port, keys));
  report(offline ? skipAccounts(databaseUrl !== null) : await checkAccounts(databaseUrl === null ? null : () => askDatabase(databaseUrl, caFile), config.port));

  const { line, exitCode } = summary(results);
  say(line);
  process.exitCode = exitCode;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(`${hide(`FAIL preflight: it crashed (${message})`, secrets)}\n`);
  process.exitCode = 1;
});
