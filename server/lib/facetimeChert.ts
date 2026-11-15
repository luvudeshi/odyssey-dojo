// Talks to Chert, the service that owns the FaceTime line: places the outbound call and asks how a call is doing.
// The request (address, headers, body) is written from Chert's setup page. NO REAL CALL HAS BEEN PLACED WITH IT:
// the error codes and the names of the fields in Chert's answers are read loosely, so a different spelling still
// lands on the right plain message.
//
// The key is sent to app.trychert.com and nowhere else, and it is never put in a log, an error or an answer.
import type { FaceTimeConfig } from "./facetimeEnv";

export const CHERT_ORIGIN = "https://app.trychert.com";
export const CHERT_CALLS = `${CHERT_ORIGIN}/api/v1/calls`;
/** Chert gives up on us after this long; so do we. */
export const CHERT_TIMEOUT_MS = 15_000;

/** The same names as CallFailure in src/facetime/callMachine.ts. */
export type ChertFailure = "line_busy" | "unverified" | "unauthorized" | "network" | "bad_number" | "service";

export const CHERT_MESSAGES: Readonly<Record<ChertFailure, string>> = {
  line_busy: "The game's FaceTime line is on another call. Try again in a minute.",
  unverified: "This phone has not been checked yet. Ask your friend to text the game's number once, then call again.",
  unauthorized: "The FaceTime service refused the server's key. Check CHERT_API_KEY and CHERT_PROJECT_ID.",
  network: "The FaceTime service could not be reached. Check the internet connection.",
  bad_number: "The FaceTime service did not accept that phone number.",
  service: "The FaceTime service could not place the call.",
};

export interface OutboundCall {
  /** The friend's phone, +country form. */
  readonly to: string;
  /** A token the bridge joins the room with. */
  readonly bridgeToken: string;
  /** The game's own identity in the room: the participant the bridge carries to and from the phone. */
  readonly agentIdentity: string;
  /** 8 to 200 characters, new for every request. */
  readonly idempotencyKey: string;
}

export interface ChertRequest {
  readonly url: string;
  readonly init: { readonly method: "POST" | "GET"; readonly headers: Readonly<Record<string, string>>; readonly body?: string };
}

const headers = (config: FaceTimeConfig): Record<string, string> => ({
  Authorization: `Bearer ${config.chertKey}`,
  "X-Chert-Project-Id": config.chertProject,
});

/** The request that places the call, as data, so a test can hold every part of it to the setup page. */
export function callRequest(config: FaceTimeConfig, call: OutboundCall): ChertRequest {
  return {
    url: CHERT_CALLS,
    init: {
      method: "POST",
      headers: { ...headers(config), "Content-Type": "application/json", "Idempotency-Key": call.idempotencyKey },
      body: JSON.stringify({
        direction: "outbound",
        mode: "customer_managed",
        line_id: config.chertLine,
        destination: call.to,
        media: { audio: true, video: true },
        livekit_url: config.livekitUrl,
        participant_token: call.bridgeToken,
        // ASSUMED: "remote" is seen from the bridge, so this names the game's participant. If Chert means the
        // bridge's own identity, this is the one line to change (the bridge's is the subject of bridgeToken).
        remote_participant_identity: call.agentIdentity,
      }),
    },
  };
}

export function stateRequest(config: FaceTimeConfig, callId: string): ChertRequest {
  return { url: `${CHERT_CALLS}/${encodeURIComponent(callId)}`, init: { method: "GET", headers: headers(config) } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every short string in an error answer that could be its code: error, code, type, error.code, error.type, plus the messages. */
function errorWords(body: unknown): string {
  if (!isRecord(body)) return "";
  const parts: unknown[] = [body.error, body.code, body.type, body.message, body.detail];
  if (isRecord(body.error)) parts.push(body.error.code, body.error.type, body.error.message);
  return parts.filter((part): part is string => typeof part === "string").join(" ").toLowerCase();
}

/** Which plain failure an answer from Chert means. */
export function failureOf(status: number, body: unknown): ChertFailure {
  const words = errorWords(body);
  if (/line_in_use|line_in_call|line_busy|\bbusy\b/.test(words)) return "line_busy";
  if (/unverified|not_verified|not verified|verif/.test(words)) return "unverified";
  if (status === 401 || status === 403) return "unauthorized";
  if (/destination|phone|e164|invalid_number/.test(words)) return "bad_number";
  if (status === 409 || status === 423) return "line_busy";
  return "service";
}

export type Placed =
  | { readonly ok: true; readonly callId: string; readonly queued: boolean }
  | { readonly ok: false; readonly why: ChertFailure; readonly status: number };

function idOf(body: unknown): string | null {
  if (!isRecord(body)) return null;
  for (const found of [body.id, body.call_id, isRecord(body.call) ? body.call.id : undefined, isRecord(body.data) ? body.data.id : undefined]) {
    if (typeof found === "string" && found !== "") return found;
  }
  return null;
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

async function send(fetcher: Fetcher, request: ChertRequest): Promise<{ status: number; body: unknown } | null> {
  // The key goes to Chert's own address only, whatever a caller built.
  if (!request.url.startsWith(`${CHERT_ORIGIN}/`)) throw new Error("refusing to send the Chert key to another address");
  try {
    const response = await fetcher(request.url, { ...request.init, signal: AbortSignal.timeout(CHERT_TIMEOUT_MS) });
    const body: unknown = await response.json().catch(() => null);
    return { status: response.status, body };
  } catch {
    // The error is not passed on: some fetch errors quote the request.
    return null;
  }
}

export async function placeCall(fetcher: Fetcher, config: FaceTimeConfig, call: OutboundCall): Promise<Placed> {
  const answer = await send(fetcher, callRequest(config, call));
  if (!answer) return { ok: false, why: "network", status: 0 };
  if (answer.status >= 200 && answer.status < 300) {
    const callId = idOf(answer.body);
    // 202: the line is busy and the call waits its turn ("when_busy": "queue"). It still has an id to ask about.
    return callId === null ? { ok: false, why: "service", status: answer.status } : { ok: true, callId, queued: answer.status === 202 };
  }
  return { ok: false, why: failureOf(answer.status, answer.body), status: answer.status };
}

export type RemoteCall = "ringing" | "active" | "over" | "unknown";

/** Chert's word for a call's state, reduced to what the game acts on. The words are guesses at Chert's; an unknown one changes nothing. */
export function remoteState(raw: string): RemoteCall {
  const word = raw.toLowerCase();
  // Whole words only: "pending" is not "end".
  const is = (words: string): boolean => new RegExp(`(^|[_ -])(${words})($|[_ -])`).test(word);
  if (is("end|ended|complete|completed|fail|failed|failure|cancel|canceled|cancelled|declined|rejected|no[_-]?answer|unanswered|missed|hung[_-]?up|hangup|busy|timeout|timed[_-]?out|error")) return "over";
  if (/ring|dial|queue|pending|creat|initiat|connecting/.test(word)) return "ringing";
  if (/active|answer|connected|in_progress|in-progress|bridg|live/.test(word)) return "active";
  return "unknown";
}

export async function callState(fetcher: Fetcher, config: FaceTimeConfig, callId: string): Promise<{ readonly state: RemoteCall; readonly raw: string }> {
  const answer = await send(fetcher, stateRequest(config, callId));
  if (!answer || answer.status < 200 || answer.status >= 300 || !isRecord(answer.body)) return { state: "unknown", raw: "" };
  const body = answer.body;
  const raw = [body.state, body.status, isRecord(body.call) ? body.call.state : undefined, isRecord(body.data) ? body.data.state : undefined]
    .find((each): each is string => typeof each === "string") ?? "";
  // Only a short plain word is passed on to the page.
  return { state: remoteState(raw), raw: /^[\w -]{1,40}$/.test(raw) ? raw : "" };
}
