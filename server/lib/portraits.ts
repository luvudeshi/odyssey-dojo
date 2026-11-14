// Portraits being painted, held in memory only and forgotten after two minutes. Nothing here touches the disk or the log.
import { randomUUID } from "node:crypto";

export interface Portrait {
  readonly bytes: Buffer;
  /** The Content-Type worked out from the first bytes. */
  readonly type: string;
}

export interface PortraitStore {
  /** Keeps a portrait that is still being painted and returns the id to ask for it by. */
  add(painting: Promise<Buffer | null>): string;
  /** Waits for the painting. Null when the id is unknown or forgotten, the painting failed, or it is not an image. */
  get(id: string): Promise<Portrait | null>;
}

function contentType(bytes: Buffer): string | null {
  const head = bytes.toString("latin1", 0, 12);
  if (head.startsWith("\x89PNG\r\n\x1a\n")) return "image/png";
  if (head.startsWith("\xff\xd8\xff")) return "image/jpeg";
  if (head.startsWith("RIFF") && head.slice(8) === "WEBP") return "image/webp";
  return null;
}

function toPortrait(bytes: Buffer | null): Portrait | null {
  const type = bytes === null ? null : contentType(bytes);
  return bytes === null || type === null ? null : { bytes, type };
}

export function createPortraitStore(options: { readonly max?: number; readonly keepMs?: number } = {}): PortraitStore {
  const max = options.max ?? 20;
  const keepMs = options.keepMs ?? 120_000;
  // A Map keeps insertion order, so the first key is always the oldest portrait.
  const portraits = new Map<string, Promise<Portrait | null>>();

  return {
    add(painting) {
      const id = randomUUID();
      portraits.set(id, painting.then(toPortrait, () => null));
      for (const oldest of portraits.keys()) {
        if (portraits.size <= max) break;
        portraits.delete(oldest);
      }
      // unref: a portrait waiting to be forgotten must not keep the server alive.
      setTimeout(() => portraits.delete(id), keepMs).unref();
      return id;
    },
    get(id) {
      return portraits.get(id) ?? Promise.resolve(null);
    },
  };
}
