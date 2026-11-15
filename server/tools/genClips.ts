// Makes the audio clips once, ahead of time, so the game plays them with no network:
//   npx tsx server/tools/genClips.ts voices          list the voices this key can use
//   npx tsx server/tools/genClips.ts athena          Athena's lines  -> public/audio/athena/<id>.mp3
//   npx tsx server/tools/genClips.ts story           Homer's lines   -> public/audio/narration/<id>.mp3
//                                                    monster taunts  -> public/audio/taunts/<id>.mp3
//   npx tsx server/tools/genClips.ts sfx             sound effects   -> public/audio/sfx/<event>.mp3
//                                                    (--only=<clip> makes just that one; with --force, only that one again)
//   npx tsx server/tools/genClips.ts music           music, ambience -> public/audio/music/<scene>.mp3
//   npx tsx server/tools/genClips.ts stops           each later stop's ambience and monster sounds
//                                                    -> public/audio/stops/<enemy id>/<clip>.mp3
//                                                    (--only=<enemy id>/<clip> makes just that one; --max=<n> caps the calls)
// Existing clips are kept (add --force to redo them). Each folder's index.json lists what exists.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { NARRATION_LINES, TAUNT_LINES } from "../../src/audio/narrationLines";
import { log } from "../../src/core/log";
import { createElevenLabs, ElevenLabsError } from "../ai/elevenlabs";
import type { AiClients } from "../ai/types";
import { forcedMonsterVoice, forcedVoice, pickMonsterVoice, pickVoice } from "../ai/voices";
import { loadConfig } from "../env";
import { withTimeout } from "../lib/timeout";
import { STOP_AMBIENCE_FORMAT, STOP_CLIP_MAX_BYTES, STOP_CLIPS } from "./stopClips";

interface Line {
  readonly id: string;
  readonly text: string;
}

/** One clip to make: the line, the voice that speaks it and the file it goes to. */
interface Job {
  readonly line: Line;
  readonly voiceId: string;
  readonly target: string;
}

// Best first. The first model the key is allowed to use wins.
const SPEECH_MODELS = ["eleven_v4", "eleven_multilingual_v2"] as const;
/**
 * What each combat event should sound like, and for how many seconds. The last five are not events: the chime for an
 * unlocked achievement and one sound for each kind of defend (src/audio/cues.ts names them).
 */
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
  // The chime is the fifth take, picked by measurement, not by ear (docs/audio-levels.md has the numbers). Asking for
  // "plucked lyre notes ending on a bell tone" and for "plucked harp notes" gave one low pluck each; "small bells" and
  // "a glockenspiel" gave a thin sparkle nearly all above 3 kHz. This one has several notes in its first 0.4 s.
  unlock: ["A short achievement chime: a quick upward arpeggio of four bright notes on a lyre and small bells, warm and sparkling, ending on a clear high note", 1.1],
  defendBlock: ["A sword striking a bronze shield, one short sharp metallic clang at once, dry with almost no ring", 0.6],
  // The dodge is the fifth take. The four before ("a body moving past", "something swinging past and missing", "a thin
  // fast swish", "a thin stick swung very fast") each came back as one thump of under 0.1 s; this one swells and fades over 0.35 s.
  defendDodge: ["A quick breathy swoosh, a short gust of wind sweeping past, bright and airy, like a cloak whipped aside", 0.7],
  // The duck is the second take: the first ("one deep low swish of air, short", asked for as 0.5 s) was a 0.1 s thump.
  defendDuck: ["A heavy wooden club swung hard through the air just overhead, one deep low whoosh passing by", 0.7],
  defendJump: ["A light quick leap off the ground, a soft springy upward whoosh with a faint flutter of cloth, short", 0.5],
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

/** Lists every clip under the stops folder as "<enemy id>/<clip>", the form the game asks for them in. */
function writeStopsIndex(folder: string): void {
  const ids = readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) =>
      readdirSync(join(folder, entry.name)).filter((file) => file.endsWith(".mp3")).map((file) => `${entry.name}/${file.slice(0, -4)}`),
    )
    .sort();
  writeFileSync(join(folder, "index.json"), `${JSON.stringify(ids)}\n`);
  log("info", "index_written", { folder, clips: ids.length });
}

async function athenaLines(): Promise<readonly Line[]> {
  const file = resolve(process.cwd(), "src/audio/athenaLines.ts");
  if (!existsSync(file)) throw new Error("src/audio/athenaLines.ts is not on this branch yet");
  const module = (await import(pathToFileURL(file).href)) as { ATHENA_LINES?: readonly Line[] };
  return module.ATHENA_LINES ?? [];
}

/** Speaks each line into its file, skipping files that exist unless `force`. The first model that works is kept for the rest. */
async function speakClips(speech: NonNullable<AiClients["speech"]>, jobs: readonly Job[], force: boolean): Promise<void> {
  let model: string | null = null;
  for (const { line, voiceId, target } of jobs) {
    if (existsSync(target) && !force) continue;
    const models: readonly string[] = model === null ? SPEECH_MODELS : [model];
    for (const candidate of models) {
      try {
        const bytes = await withTimeout(30000, (signal) => speech({ text: line.text, voiceId, model: candidate, signal }));
        writeFileSync(target, bytes);
        model = candidate;
        log("info", "clip_written", { id: line.id, model: candidate, bytes: bytes.length });
        break;
      } catch (error) {
        log("warn", "clip_failed", { id: line.id, model: candidate, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
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

  if (command === "stops") {
    const folder = join(PUBLIC, "stops");
    const only = flags.filter((flag) => flag.startsWith("--only=")).map((flag) => flag.slice("--only=".length));
    const unknown = only.filter((key) => !Object.hasOwn(STOP_CLIPS, key));
    if (unknown.length > 0) throw new Error(`no such stop clip: ${unknown.join(", ")}`);
    const cap = Number(flags.find((flag) => flag.startsWith("--max="))?.slice("--max=".length) ?? Number.POSITIVE_INFINITY);
    let calls = 0;
    for (const [key, { prompt, seconds, loop }] of Object.entries(STOP_CLIPS)) {
      if (only.length > 0 && !only.includes(key)) continue;
      const target = join(folder, `${key}.mp3`);
      if (existsSync(target) && !force) continue;
      // Not "calls >= cap": a cap that is not a number stops the run instead of lifting the limit.
      if (!(calls < cap)) {
        log("warn", "call_cap_reached", { calls, next: key });
        break;
      }
      calls++;
      try {
        const bytes = await withTimeout(120000, (signal) =>
          sound(loop ? { prompt, seconds, loop, format: STOP_AMBIENCE_FORMAT, signal } : { prompt, seconds, signal }),
        );
        if (bytes.length > STOP_CLIP_MAX_BYTES) {
          log("warn", "clip_too_big", { id: key, bytes: bytes.length });
          continue;
        }
        mkdirSync(join(target, ".."), { recursive: true });
        writeFileSync(target, bytes);
        log("info", "clip_written", { id: key, bytes: bytes.length });
      } catch (error) {
        log("warn", "clip_failed", { id: key, error: error instanceof Error ? error.message : String(error) });
        // A refused key, a spent quota or a malformed request fails the same way for every clip, so stop spending calls.
        if (error instanceof ElevenLabsError && (REFUSED.has(error.httpStatus) || error.httpStatus === 422 || error.httpStatus === 429)) throw error;
      }
    }
    log("info", "stops_done", { calls });
    mkdirSync(folder, { recursive: true });
    writeStopsIndex(folder);
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
    const jobs = (await athenaLines()).map((line) => ({ line, voiceId: voice.id, target: join(folder, `${line.id}.mp3`) }));
    await speakClips(speech, jobs, force);
    writeIndex(folder);
    return;
  }

  if (command === "story") {
    const narration = join(PUBLIC, "narration");
    const taunts = join(PUBLIC, "taunts");
    mkdirSync(narration, { recursive: true });
    mkdirSync(taunts, { recursive: true });
    const jobs: Job[] = [];
    const speakers: Record<string, string> = {};
    for (const line of [...NARRATION_LINES, ...TAUNT_LINES]) {
      const homer = line.speaker === "homer";
      const voice = homer
        ? pickVoice("homer", available, forcedVoice("homer"))
        : pickMonsterVoice(line.enemyId, available, forcedMonsterVoice(line.enemyId));
      if (voice === null) throw new Error("this key has no voices it can use through the API");
      speakers[homer ? "homer" : line.enemyId] = voice.name;
      jobs.push({ line, voiceId: voice.id, target: join(homer ? narration : taunts, `${line.id}.mp3`) });
    }
    log("info", "story_voices", speakers);
    await speakClips(speech, jobs, force);
    writeIndex(narration);
    writeIndex(taunts);
    return;
  }

  if (command === "sfx") {
    const folder = join(PUBLIC, "sfx");
    mkdirSync(folder, { recursive: true });
    const only = flags.filter((flag) => flag.startsWith("--only=")).map((flag) => flag.slice("--only=".length));
    const unknown = only.filter((event) => !Object.hasOwn(SOUNDS, event));
    if (unknown.length > 0) throw new Error(`no such sound effect: ${unknown.join(", ")}`);
    for (const [event, [prompt, seconds]] of Object.entries(SOUNDS)) {
      if (only.length > 0 && !only.includes(event)) continue;
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

  throw new Error("usage: genClips.ts voices | athena | story | sfx | music | stops [--force]");
}

main().catch((error: unknown) => {
  log("error", "gen_clips_failed", error);
  process.exitCode = 1;
});
