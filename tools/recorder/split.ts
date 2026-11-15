/// <reference types="node" />
// Splits a guided session file into one trace file per take: npx tsx tools/recorder/split.ts <session> [out dir]
// Never overwrites. Each trace gets the next free number for its move and person, and that number is stored in the
// file because tests/moves/replay.test.ts asserts the file name equals traceFileName(stored).
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "vite";
import { nextFreeNumber, unpackSession } from "./session";
import { loadTrace, traceFileName } from "./trace";

const [sessionPath, outDir = "tests/fixtures/poses"] = process.argv.slice(2);
if (sessionPath === undefined) {
  process.stderr.write("usage: npx tsx tools/recorder/split.ts <session file> [out dir]\n");
  process.exit(2);
}
const traces = unpackSession(readFileSync(sessionPath, "utf8"));

// The move registry reads its files with import.meta.glob, which only Vite understands, so load it through Vite.
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
const { MOVES } = (await vite.ssrLoadModule("/src/moves/registry.ts")) as typeof import("../../src/moves/registry");
const { problems } = (await vite.ssrLoadModule("/tools/recorder/replay.ts")) as typeof import("./replay");

mkdirSync(outDir, { recursive: true });
const taken = readdirSync(outDir);
for (const stored of traces) {
  const numbered = { ...stored, n: nextFreeNumber(taken, stored.move, stored.person) };
  const name = traceFileName(numbered);
  writeFileSync(join(outDir, name), JSON.stringify(numbered), { flag: "wx" });
  taken.push(name);
  const wrong = problems(loadTrace(numbered), MOVES);
  process.stdout.write(`${name}: ${wrong.length === 0 ? "reads correctly" : wrong.join("; ")}\n`);
}
process.stdout.write(`${String(traces.length)} files written to ${outDir}\n`);
await vite.close();
