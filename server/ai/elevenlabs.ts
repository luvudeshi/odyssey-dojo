// ElevenLabs over plain fetch. Endpoints, headers and field names were checked against the API reference on 2026-11-14.
import type { AiClients, MusicRequest } from "./types";

const API = "https://api.elevenlabs.io";
const FORMAT = "mp3_44100_128";
// The API's default sound model is deprecated; always name the current one.
const SOUND_MODEL = "eleven_text_to_sound_v3";
// Music clips are long, so they use a lower bitrate than speech to keep the download small.
const MUSIC_FORMAT = "mp3_44100_96";
const MUSIC_MODEL = "music_v1";

/** v4 takes only stability and similarity; the older models also take speed. */
function voiceSettings(model: string): Record<string, number> {
  const base = { stability: 0.45, similarity_boost: 0.75 };
  return model.startsWith("eleven_v4") ? base : { ...base, speed: 0.92 };
}

export class ElevenLabsError extends Error {
  constructor(readonly httpStatus: number, body: string) {
    super(`elevenlabs ${String(httpStatus)}: ${body.slice(0, 300)}`);
    this.name = "ElevenLabsError";
  }
}

export interface ElevenLabs extends Pick<AiClients, "speech" | "sound" | "voices"> {
  /** A piece of instrumental music described in words in, MP3 bytes out. Only the clip tool uses it. */
  readonly music: (request: MusicRequest) => Promise<Buffer>;
}

export function createElevenLabs(apiKey: string): ElevenLabs {
  async function call(path: string, init: RequestInit): Promise<Response> {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    });
    if (!response.ok) throw new ElevenLabsError(response.status, await response.text().catch(() => ""));
    return response;
  }
  const audio = async (path: string, body: unknown, signal: AbortSignal): Promise<Buffer> => {
    const response = await call(path, { method: "POST", body: JSON.stringify(body), signal });
    return Buffer.from(await response.arrayBuffer());
  };

  return {
    speech({ text, voiceId, model, signal }) {
      return audio(
        `/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${FORMAT}`,
        { text, model_id: model, voice_settings: voiceSettings(model) },
        signal,
      );
    },
    sound({ prompt, seconds, loop, format, signal }) {
      return audio(
        `/v1/sound-generation?output_format=${format ?? FORMAT}`,
        {
          text: prompt,
          duration_seconds: Math.min(30, Math.max(0.5, seconds)),
          prompt_influence: 0.5,
          loop: loop ?? false,
          model_id: SOUND_MODEL,
        },
        signal,
      );
    },
    music({ prompt, seconds, signal }) {
      return audio(
        `/v1/music?output_format=${MUSIC_FORMAT}`,
        {
          prompt,
          music_length_ms: Math.round(Math.min(600, Math.max(3, seconds)) * 1000),
          model_id: MUSIC_MODEL,
          force_instrumental: true,
        },
        signal,
      );
    },
    async voices(signal) {
      const response = await call("/v2/voices?page_size=100", { method: "GET", signal });
      const body = (await response.json()) as { voices?: { voice_id?: unknown; name?: unknown }[] };
      return (body.voices ?? []).flatMap((voice) =>
        typeof voice.voice_id === "string" && typeof voice.name === "string"
          ? [{ id: voice.voice_id, name: voice.name }]
          : [],
      );
    },
  };
}
