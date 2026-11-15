// The AI calls the routes depend on, as plain functions so tests can swap in fakes.
// A missing key leaves the function null, and the route answers with its fallback.

export interface InlineImage {
  readonly mime: string;
  /** Bare base64, no data: prefix. */
  readonly base64: string;
}

export interface JsonRequest {
  readonly prompt: string;
  readonly image?: InlineImage;
  /** A plain JSON Schema object the answer must match. */
  readonly schema: unknown;
  readonly signal: AbortSignal;
  /** Told which model gave the answer. The preflight check prints it. */
  readonly onModel?: (model: string) => void;
}

export interface ImageRequest {
  readonly prompt: string;
  readonly image: InlineImage;
  readonly signal: AbortSignal;
}

export interface SpeechRequest {
  readonly text: string;
  readonly voiceId: string;
  readonly model: string;
  readonly signal: AbortSignal;
}

export interface SoundRequest {
  readonly prompt: string;
  readonly seconds: number;
  /** Ask for a sound whose end runs into its start. Off unless set. */
  readonly loop?: boolean;
  /** The audio format to ask for, as the API names it. Left out: MP3 at 128 kbps. */
  readonly format?: string;
  readonly signal: AbortSignal;
}

export interface MusicRequest {
  readonly prompt: string;
  readonly seconds: number;
  readonly signal: AbortSignal;
}

export interface Voice {
  readonly id: string;
  readonly name: string;
}

export interface AiClients {
  /** Text (and optionally one image) in, parsed JSON out. Throws on any failure. */
  readonly json: ((request: JsonRequest) => Promise<unknown>) | null;
  /** One image plus a prompt in, image bytes out. Null when the model returned no image. */
  readonly image: ((request: ImageRequest) => Promise<Buffer | null>) | null;
  /** Text in, MP3 bytes out. */
  readonly speech: ((request: SpeechRequest) => Promise<Buffer>) | null;
  /** A sound described in words in, MP3 bytes out. */
  readonly sound: ((request: SoundRequest) => Promise<Buffer>) | null;
  /** The voices this key may use. */
  readonly voices: ((signal: AbortSignal) => Promise<readonly Voice[]>) | null;
}

export const NO_AI: AiClients = { json: null, image: null, speech: null, sound: null, voices: null };
