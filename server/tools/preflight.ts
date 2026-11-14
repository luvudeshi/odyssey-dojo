// Run this before the judges arrive. It prints one line per check and exits 1 only if the demo would break:
//   npx tsx server/tools/preflight.ts             every check
//   npx tsx server/tools/preflight.ts --offline   skip the two calls that need the internet
// It never prints a key, and it spends no ElevenLabs credits.
import { resolve } from "node:path";
import { createElevenLabs } from "../ai/elevenlabs";
import { createGemini } from "../ai/gemini";
import { loadConfig } from "../env";
import type { Result } from "../lib/preflightChecks";
import {
  checkClips,
  checkElevenLabs,
  checkGemini,
  checkKeys,
  checkPoseFiles,
  checkServer,
  formatLine,
  summary,
} from "../lib/preflightChecks";

/** How long the voices list may take. It is a small GET, so this is generous. */
const VOICES_MS = 8000;

async function main(): Promise<void> {
  const offline = process.argv.includes("--offline");
  const root = process.cwd();
  const config = loadConfig(root);
  const secrets = [config.geminiKey, config.elevenLabsKey];
  const results: Result[] = [];
  // A person reads this in a terminal, so it is plain lines on stdout, not the JSON lines log() writes.
  const say = (text: string): void => { process.stdout.write(`${text}\n`); };
  const report = (line: Result): void => {
    results.push(line);
    say(formatLine(line, secrets));
  };

  report(checkClips(resolve(root, "public/audio")));
  report(checkPoseFiles(resolve(root, "public")));
  report(checkKeys({ gemini: config.geminiKey !== null, elevenLabs: config.elevenLabsKey !== null }));
  if (offline) {
    report({ level: "SKIP", name: "gemini", detail: "--offline" });
    report({ level: "SKIP", name: "elevenlabs", detail: "--offline" });
  } else {
    const json = config.geminiKey === null ? null : createGemini(config.geminiKey).json;
    const voices = config.elevenLabsKey === null ? null : createElevenLabs(config.elevenLabsKey).voices;
    // Both at once, so a dead network costs one timeout, not two.
    const [gemini, eleven] = await Promise.all([
      checkGemini(json, config.timeouts.levelMs),
      checkElevenLabs(voices, VOICES_MS),
    ]);
    report(gemini);
    report(eleven);
  }
  report(await checkServer(config.port));

  const { line, exitCode } = summary(results);
  say(line);
  process.exitCode = exitCode;
}

main().catch((error: unknown) => {
  process.stdout.write(`FAIL preflight: it crashed (${error instanceof Error ? error.message : String(error)})\n`);
  process.exitCode = 1;
});
