// A LiveKit access token, signed here with node:crypto so the server needs no extra package. It is a plain HS256
// JWT: the issuer is the API key, the subject is the participant's identity, and a "video" grant names the one room
// the holder may join and what it may do there. The secret never leaves this process; only the signed token does.
import { createHmac, timingSafeEqual } from "node:crypto";

export interface TokenRequest {
  readonly apiKey: string;
  readonly apiSecret: string;
  /** Who the holder is in the room. */
  readonly identity: string;
  readonly room: string;
  /** Seconds the token can be used to join. */
  readonly ttlSeconds: number;
  /** Seconds since 1970. */
  readonly nowSeconds: number;
  /** Shown as the participant's name. */
  readonly name?: string;
}

export interface TokenClaims {
  readonly iss: string;
  readonly sub: string;
  readonly jti: string;
  readonly nbf: number;
  readonly exp: number;
  readonly name?: string;
  readonly video: { readonly room: string; readonly roomJoin: true; readonly canPublish: true; readonly canSubscribe: true; readonly canPublishData: true };
}

/** What a room-service token carries: no identity and no room, only the right to make and delete rooms. */
export interface RoomServiceClaims {
  readonly iss: string;
  readonly nbf: number;
  readonly exp: number;
  readonly video: { readonly roomCreate: true };
}

const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64url");
const sign = (text: string, secret: string): Buffer => createHmac("sha256", secret).update(text).digest();

export function mintToken(request: TokenRequest): string {
  const claims: TokenClaims = {
    iss: request.apiKey,
    sub: request.identity,
    jti: request.identity,
    // A few seconds of slack, for a clock that runs a little ahead of LiveKit's.
    nbf: request.nowSeconds - 10,
    exp: request.nowSeconds + request.ttlSeconds,
    ...(request.name === undefined ? {} : { name: request.name }),
    video: { room: request.room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
  };
  const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}`;
  return `${body}.${sign(body, request.apiSecret).toString("base64url")}`;
}

/**
 * A token for LiveKit's room service (its server API), not for joining: the grant is `roomCreate`, which is what
 * DeleteRoom asks for. It names no room and no participant, lives a few seconds, and goes only to LiveKit.
 */
export function mintRoomServiceToken(request: Pick<TokenRequest, "apiKey" | "apiSecret" | "ttlSeconds" | "nowSeconds">): string {
  const claims: RoomServiceClaims = { iss: request.apiKey, nbf: request.nowSeconds - 10, exp: request.nowSeconds + request.ttlSeconds, video: { roomCreate: true } };
  const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}`;
  return `${body}.${sign(body, request.apiSecret).toString("base64url")}`;
}

/** The claims of a token signed with `apiSecret`, or null when the signature is wrong or it is not such a token. For tests and checks. */
export function readToken(token: string, apiSecret: string): TokenClaims | null {
  return readClaims(token, apiSecret) as TokenClaims | null;
}

/** The same check for a room-service token. Null for a join token: that one names a room and has no `roomCreate`. */
export function readRoomServiceToken(token: string, apiSecret: string): RoomServiceClaims | null {
  const claims = readClaims(token, apiSecret) as { video?: { roomCreate?: unknown } } | null;
  return claims?.video?.roomCreate === true ? (claims as RoomServiceClaims) : null;
}

function readClaims(token: string, apiSecret: string): unknown {
  const [header, payload, signature, extra] = token.split(".");
  if (header === undefined || payload === undefined || signature === undefined || extra !== undefined) return null;
  const given = Buffer.from(signature, "base64url");
  const wanted = sign(`${header}.${payload}`, apiSecret);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;
  try {
    const head = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as { alg?: unknown };
    if (head.alg !== "HS256") return null;
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
  } catch {
    return null;
  }
}
