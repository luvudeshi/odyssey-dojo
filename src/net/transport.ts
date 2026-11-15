// Talks to the room relay in server/routes/rooms.ts: create, join, an event stream in, POSTs out.
// The browser's fetch and EventSource are passed in, so tests run this with made-up ones.
import { parseMessage } from "./messages";
import type { NetMessage } from "./messages";

/** One member's line to the other member of the room. */
export interface RoomTransport {
  /** Resolves true when the relay passed it to the other member's open stream. Never rejects. */
  send(message: NetMessage): Promise<boolean>;
  /** Called for every well-formed message from the other member, and for the relay's "peer" messages. */
  onMessage(listener: (message: NetMessage) => void): void;
  close(): void;
}

/** The part of EventSource this uses. */
export interface EventStream {
  onmessage: ((event: { data: unknown }) => void) | null;
  close(): void;
}

export interface NetDeps {
  readonly fetch: (url: string, init: { method: string; headers?: Record<string, string>; body?: string }) => Promise<{
    readonly ok: boolean;
    readonly status: number;
    json(): Promise<unknown>;
  }>;
  readonly openStream: (url: string) => EventStream;
}

export type RoomError = "unknown_room" | "room_full" | "too_many_rooms" | "unreachable";

function field(value: unknown, name: string): string | null {
  if (typeof value !== "object" || value === null) return null;
  const found = (value as Record<string, unknown>)[name];
  return typeof found === "string" && found !== "" ? found : null;
}

async function post(deps: NetDeps, url: string, body?: unknown): Promise<{ status: number; data: unknown } | null> {
  try {
    const response = await deps.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    return { status: response.status, data: await response.json().catch(() => null) };
  } catch {
    return null;
  }
}

/** Letters only, upper case: what the host reads out and the guest types. */
export function cleanCode(text: string): string {
  return text.replace(/[^a-z]/gi, "").toUpperCase().slice(0, 8);
}

export async function createRoom(deps: NetDeps, base = ""): Promise<{ code: string; token: string } | RoomError> {
  const answer = await post(deps, `${base}/api/rooms`);
  if (!answer) return "unreachable";
  if (answer.status === 503) return "too_many_rooms";
  const code = field(answer.data, "code");
  const token = field(answer.data, "token");
  return answer.status === 200 && code && token ? { code, token } : "unreachable";
}

export async function joinRoom(deps: NetDeps, code: string, base = ""): Promise<{ code: string; token: string } | RoomError> {
  const cleaned = cleanCode(code);
  if (cleaned === "") return "unknown_room";
  const answer = await post(deps, `${base}/api/rooms/${cleaned}/join`);
  if (!answer) return "unreachable";
  if (answer.status === 404) return "unknown_room";
  if (answer.status === 409) return "room_full";
  const token = field(answer.data, "token");
  return answer.status === 200 && token ? { code: cleaned, token } : "unreachable";
}

/** Opens the member's event stream and returns the line to the other member. */
export function openRoom(deps: NetDeps, room: { code: string; token: string }, base = ""): RoomTransport {
  const listeners: ((message: NetMessage) => void)[] = [];
  const path = `${base}/api/rooms/${cleanCode(room.code)}`;
  const stream = deps.openStream(`${path}/events?token=${encodeURIComponent(room.token)}`);
  stream.onmessage = (event) => {
    if (typeof event.data !== "string") return;
    let raw: unknown;
    try {
      raw = JSON.parse(event.data);
    } catch {
      return;
    }
    const message = parseMessage(raw);
    if (message) for (const listener of listeners) listener(message);
  };
  return {
    async send(message) {
      const answer = await post(deps, `${path}/send`, { token: room.token, message });
      return answer?.status === 200 && typeof answer.data === "object" && answer.data !== null && "delivered" in answer.data
        ? answer.data.delivered === true
        : false;
    },
    onMessage(listener) {
      listeners.push(listener);
    },
    close() {
      stream.onmessage = null;
      stream.close();
    },
  };
}
