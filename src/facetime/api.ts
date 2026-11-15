// The page's side of the game server's FaceTime routes (server/routes/facetime.ts). The keys stay on the server:
// the page only ever gets a room address and a short-lived token for its own seat in that room.
import type { CallFailure } from "./callMachine";

export interface RoomSeat {
  readonly url: string;
  readonly token: string;
  readonly room: string;
  readonly identity: string;
}

/** What the call service says about a call, reduced to what the game acts on. */
export type RemoteCall = "ringing" | "active" | "over" | "unknown";

export type Answer<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly why: CallFailure; readonly message: string };

export interface FaceTimeApi {
  /** Whether the server has what it needs. `missing` lists the names of the settings that are not there. */
  status(): Promise<{ readonly ready: boolean; readonly missing: readonly string[] }>;
  /** A new room and this page's seat in it. */
  seat(): Promise<Answer<RoomSeat>>;
  /** Rings the phone and bridges the call into the room. */
  call(to: string, room: string): Promise<Answer<{ readonly callId: string }>>;
  callState(callId: string): Promise<RemoteCall>;
}

const FAILURES: readonly CallFailure[] = ["not_set_up", "bad_number", "line_busy", "unverified", "unauthorized", "network", "no_answer", "greet_late", "room_lost", "service"];
const STATES: readonly RemoteCall[] = ["ringing", "active", "over", "unknown"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function refusal(body: unknown, fallback: CallFailure): { ok: false; why: CallFailure; message: string } {
  const named = isRecord(body) && typeof body.error === "string" ? FAILURES.find((each) => each === body.error) : undefined;
  const message = isRecord(body) && typeof body.message === "string" ? body.message : "";
  return { ok: false, why: named ?? fallback, message };
}

export function createFaceTimeApi(fetcher: typeof fetch = (url, init) => fetch(url, init)): FaceTimeApi {
  const ask = async (path: string, json?: unknown): Promise<{ ok: boolean; body: unknown } | null> => {
    try {
      const response = await fetcher(path, json === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json) });
      const body: unknown = await response.json().catch(() => null);
      return { ok: response.ok, body };
    } catch {
      // No game server at all.
      return null;
    }
  };
  return {
    async status() {
      const answer = await ask("/api/facetime/status");
      if (!answer?.ok || !isRecord(answer.body)) return { ready: false, missing: [] };
      const missing = Array.isArray(answer.body.missing) ? answer.body.missing.filter((each): each is string => typeof each === "string") : [];
      return { ready: answer.body.ready === true, missing };
    },
    async seat() {
      const answer = await ask("/api/facetime/seat", {});
      if (!answer) return { ok: false, why: "not_set_up", message: "" };
      const body = answer.body;
      if (answer.ok && isRecord(body) && typeof body.url === "string" && typeof body.token === "string" && typeof body.room === "string" && typeof body.identity === "string") {
        return { ok: true, value: { url: body.url, token: body.token, room: body.room, identity: body.identity } };
      }
      return refusal(body, "not_set_up");
    },
    async call(to, room) {
      const answer = await ask("/api/facetime/call", { to, room });
      if (!answer) return { ok: false, why: "network", message: "" };
      if (answer.ok && isRecord(answer.body) && typeof answer.body.callId === "string") return { ok: true, value: { callId: answer.body.callId } };
      return refusal(answer.body, "service");
    },
    async callState(callId) {
      const answer = await ask(`/api/facetime/call/${encodeURIComponent(callId)}`);
      if (!answer?.ok || !isRecord(answer.body)) return "unknown";
      return STATES.find((each) => isRecord(answer.body) && each === answer.body.state) ?? "unknown";
    },
  };
}
