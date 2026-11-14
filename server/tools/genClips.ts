// Makes the audio clips once, ahead of time, so the game plays them with no network:
//   npx tsx server/tools/genClips.ts voices          list the voices this key can use
//   npx tsx server/tools/genClips.ts athena          Athena's lines  -> public/audio/athena/<id>.mp3
//   npx tsx server/tools/genClips.ts sfx             sound effects   -> public/audio/sfx/<event>.mp3
//   npx tsx server/tools/genClips.ts music           music, ambience -> public/audio/music/<scene>.mp3
// Existing clips are kept (add --force to redo them). Each folder's index.json lists what exists.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { log } from "../../src/core/log";
import { createElevenLabs, ElevenLabsError } from "../ai/elevenlabs";
import { forcedVoice, pickVoice } from "../ai/voices";
import { loadConfig } from "../env";
import { withTimeout } from "../lib/timeout";

interface Line {
  readonly id: string;
  readonly text: string;
}

// Best first. The first model the key is allowed to use wins.
const SPEECH_MODELS = ["eleven_v4", "eleven_multilingual_v2"] as const;
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

interface Track {
  /** "music" is made by the music endpoint; "ambience" by the sound-effects endpoint, asked to loop. */
  readonly kind: "music" | "ambience";
  readonly prompt: string;
  readonly seconds: number;
}

/** One clip per music scene in src/audio/music.ts. Prompts describe the sound only: no artist, film, game or existing piece. */
const MUSIC: Readonly<Record<string, Track>> = {
  menu: {
    kind: "ambience",
    prompt:
      "Ambience inside a huge stone sea cave: water drips echoing off the rock, a low wind drone through the tunnels, surf rolling outside the cave mouth. Continuous and even, no music, no voices",
    seconds: 30,
  },
  fight: {
    kind: "music",
    prompt:
      "Instrumental battle music with an ancient Greek feel, for a fight against a giant in a cave. Driving frame drums and low war drums at a steady fast tempo, a plucked lyre ostinato, a shrill aulos reed melody, a low drone underneath. Tense and heroic. Full intensity from the first beat to the last, with no intro, no outro and no fade out, so it can loop. No vocals.",
    seconds: 48,
  },
  win: {
    kind: "music",
    prompt:
      "A short victory sting with an ancient Greek feel: a bright lyre flourish, an aulos fanfare and one final frame drum hit that rings out. Triumphant. Instrumental, no vocals.",
    seconds: 6,
  },
  loss: {
    kind: "music",
    prompt:
      "A short defeat sting with an ancient Greek feel: a slow descending lyre phrase over a dark low drone, then one deep drum hit that dies away. Mournful. Instrumental, no vocals.",
    seconds: 6,
  },
};
/** The HTTP statuses that mean this key or plan may not use an endpoint at all. */
const REFUSED: ReadonlySet<number> = new Set([401, 402, 403]);

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

async function main(): Promise<void> {
  const [command = "", ...flags] = process.argv.slice(2);
  const force = flags.includes("--force");
  const config = loadConfig();
  if (config.elevenLabsKey === null) throw new Error("ELEVENLABS_API_KEY is not set in .env");
  const eleven = createElevenLabs(config.elevenLabsKey);
  const { speech, sound, voices, music } = eleven;
  if (!speech || !sound || !voices) throw new Error("the ElevenLabs client is incomplete");

  if (command === "music") {
    const folder = join(PUBLIC, "music");
    mkdirSync(folder, { recursive: true });
    // Once the music endpoint refuses this plan, the rest of the clips go straight to the sound-effects endpoint.
    let refused = false;
    for (const [scene, { kind, prompt, seconds }] of Object.entries(MUSIC)) {
      const target = join(folder, `${scene}.mp3`);
      if (existsSync(target) && !force) continue;
      const asSound = (): Promise<Buffer> =>
        withTimeout(120000, (signal) => sound({ prompt, seconds, loop: kind === "ambience", signal }));
      try {
        let endpoint = "sound-generation";
        let bytes: Buffer;
        if (kind === "ambience" || refused) {
          bytes = await asSound();
        } else {
          try {
            bytes = await withTimeout(240000, (signal) => music({ prompt, seconds, signal }));
            endpoint = "music";
          } catch (error) {
            if (!(error instanceof ElevenLabsError) || !REFUSED.has(error.httpStatus)) throw error;
            log("warn", "music_refused", { scene, error: error.message });
            refused = true;
            bytes = await asSound();
          }
        }
        writeFileSync(target, bytes);
        log("info", "clip_written", { id: scene, endpoint, bytes: bytes.length });
      } catch (error) {
        log("warn", "clip_failed", { id: scene, error: error instanceof Error ? error.message : String(error) });
        // A request the API calls malformed will fail the same way for every clip, so stop instead of spending more calls.
        if (error instanceof ElevenLabsError && error.httpStatus === 422) throw error;
      }
    }
    writeIndex(folder);
    return;
  }

  const available = await withTimeout(15000, (signal) => voices(signal));

  if (command === "voices") {
    for (const voice of available) log("info", "voice", voice);
    return;
  }

  if (command === "athena") {
    const folder = join(PUBLIC, "athena");
    mkdirSync(folder, { recursive: true });
    const voice = pickVoice("athena", available, forcedVoice("athena"));
    if (voice === null) throw new Error("this key has no voices it can use through the API");
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

  throw new Error("usage: genClips.ts voices | athena | sfx | music [--force]");
}

main().catch((error: unknown) => {
  log("error", "gen_clips_failed", error);
  process.exitCode = 1;
});
