// Makes the audio clips once, ahead of time, so the game plays them with no network:
//   npx tsx server/tools/genClips.ts voices          list the voices this key can use
//   npx tsx server/tools/genClips.ts athena          Athena's lines  -> public/audio/athena/<id>.mp3
//   npx tsx server/tools/genClips.ts sfx             sound effects   -> public/audio/sfx/<event>.mp3
// Existing clips are kept (add --force to redo them). Each folder's index.json lists what exists.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { log } from "../../src/core/log";
import { createElevenLabs } from "../ai/elevenlabs";
import type { Voice } from "../ai/types";
import { loadConfig } from "../env";
import { withTimeout } from "../lib/timeout";

interface Line {
  readonly id: string;
  readonly text: string;
}

// Best first. The first model the key is allowed to use wins.
const SPEECH_MODELS = ["eleven_v4", "eleven_multilingual_v2"] as const;
// Names tried in order for Athena: a clear, commanding woman's voice. Override with ATHENA_VOICE_ID.
const ATHENA_VOICES = ["Alice", "Matilda", "Charlotte", "Sarah", "Lily", "Rachel", "Jessica", "Laura"] as const;

/** What each combat event should sound like, and for how many seconds. */
const SOUNDS: Readonly<Record<string, readonly [prompt: string, seconds: number]>> = {
  telegraph: ["A giant winding up a heavy wooden club in a stone cave, low ominous whoosh rising in tension", 1],
  defended: ["A bronze shield blocking a heavy blow, sharp metallic clang with a short ring", 0.8],
  playerHit: ["A heavy blunt impact on a body, dull painful thud with a crunch", 0.7],
  opening: ["A short bright magical shimmer, rising chime", 0.6],
  enemyHit: ["A powerful punch landing on a giant monster, meaty impact with a deep monstrous grunt", 0.9],
  whiffed: ["A fast whoosh of air from a missed punch", 0.5],
  phaseChanged: ["One deep war drum hit with a low monstrous growl echoing in a cave", 1.5],
  finished: ["A giant cyclops roaring in agony as a huge wooden stake strikes home, massive impact, cave echo", 2.5],
  powerUnleashed: ["A divine thunderclap with a burst of crackling holy energy", 2],
  won: ["A short triumphant ancient Greek fanfare of brass horns and drums", 3],
  lost: ["A dark low descending drone with distant thunder, the sound of defeat", 3],
};

const PUBLIC = resolve(process.cwd(), "public/audio");

function writeIndex(folder: string): void {
  const ids = readdirSync(folder).filter((file) => file.endsWith(".mp3")).map((file) => file.slice(0, -4)).sort();
  writeFileSync(join(folder, "index.json"), `${JSON.stringify(ids)}\n`);
  log("info", "index_written", { folder, clips: ids.length });
}

async function athenaLines(): Promise<readonly Line[]> {
  const file = resolve(process.cwd(), "src/audio/athenaLines.ts");
  if (!existsSync(file)) throw new Error("src/audio/athenaLines.ts is not on this branch yet");
  const module = (await import(pathToFileURL(file).href)) as { ATHENA_LINES?: readonly Line[] };
  return module.ATHENA_LINES ?? [];
}

function pickVoice(voices: readonly Voice[]): Voice {
  const wanted = process.env.ATHENA_VOICE_ID;
  const chosen =
    voices.find((voice) => voice.id === wanted) ??
    ATHENA_VOICES.flatMap((name) => voices.filter((voice) => voice.name.toLowerCase().startsWith(name.toLowerCase())))[0] ??
    voices[0];
  if (!chosen) throw new Error("this key has no voices it can use through the API");
  return chosen;
}

async function main(): Promise<void> {
  const [command = "", ...flags] = process.argv.slice(2);
  const force = flags.includes("--force");
  const config = loadConfig();
  if (config.elevenLabsKey === null) throw new Error("ELEVENLABS_API_KEY is not set in .env");
  const eleven = createElevenLabs(config.elevenLabsKey);
  const { speech, sound, voices } = eleven;
  if (!speech || !sound || !voices) throw new Error("the ElevenLabs client is incomplete");
  const available = await withTimeout(15000, (signal) => voices(signal));

  if (command === "voices") {
    for (const voice of available) log("info", "voice", voice);
    return;
  }

  if (command === "athena") {
    const folder = join(PUBLIC, "athena");
    mkdirSync(folder, { recursive: true });
    const voice = pickVoice(available);
    log("info", "athena_voice", voice);
    let model: string | null = null;
    for (const line of await athenaLines()) {
      const target = join(folder, `${line.id}.mp3`);
      if (existsSync(target) && !force) continue;
      const models: readonly string[] = model === null ? SPEECH_MODELS : [model];
      for (const candidate of models) {
        try {
          const bytes = await withTimeout(30000, (signal) =>
            speech({ text: line.text, voiceId: voice.id, model: candidate, signal }),
          );
          writeFileSync(target, bytes);
          model = candidate;
          log("info", "clip_written", { id: line.id, model: candidate, bytes: bytes.length });
          break;
        } catch (error) {
          log("warn", "clip_failed", { id: line.id, model: candidate, error: error instanceof Error ? error.message : String(error) });
        }
      }
    }
    writeIndex(folder);
    return;
  }

  if (command === "sfx") {
    const folder = join(PUBLIC, "sfx");
    mkdirSync(folder, { recursive: true });
    for (const [event, [prompt, seconds]] of Object.entries(SOUNDS)) {
      const target = join(folder, `${event}.mp3`);
      if (existsSync(target) && !force) continue;
      try {
        const bytes = await withTimeout(60000, (signal) => sound({ prompt, seconds, signal }));
        writeFileSync(target, bytes);
        log("info", "clip_written", { id: event, bytes: bytes.length });
      } catch (error) {
        log("warn", "clip_failed", { id: event, error: error instanceof Error ? error.message : String(error) });
      }
    }
    writeIndex(folder);
    return;
  }

  throw new Error("usage: genClips.ts voices | athena | sfx [--force]");
}

main().catch((error: unknown) => {
  log("error", "gen_clips_failed", error);
  process.exitCode = 1;
});
