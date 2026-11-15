// The server listens on the whole network so phones can open replay pages, but the routes that spend API credits
// only answer this machine. The socket's address decides, and a header can only take that away, never grant it:
// a request that says it was passed on by a proxy or a tunnel is not local, even from a loopback socket.
import type { IncomingHttpHeaders } from "node:http";
import type { NextFunction, Request, Response } from "express";

const LOOPBACK: readonly string[] = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];

/** Headers a proxy or tunnel adds. cloudflared puts Cf-Connecting-Ip, Cf-Ray and X-Forwarded-For on every request it hands over. */
const RELAY_HEADERS: readonly string[] = ["forwarded", "x-real-ip", "true-client-ip", "cdn-loop", "via"];
const RELAY_PREFIXES: readonly string[] = ["cf-", "x-forwarded-"];

export function isLoopback(address: string | undefined): boolean {
  return address !== undefined && LOOPBACK.includes(address);
}

/**
 * True when any header says the request came through a proxy or a tunnel (scripts/tunnel.mjs opens one to this server).
 * The name alone decides, in any case and with any value, an empty one included. A browser on this machine sends none of these.
 */
export function wasRelayed(headers: IncomingHttpHeaders): boolean {
  return Object.keys(headers).some((raw) => {
    const name = raw.toLowerCase();
    return RELAY_HEADERS.includes(name) || RELAY_PREFIXES.some((prefix) => name.startsWith(prefix));
  });
}

/** True for the API paths any device on the network may call: replays, health, and the online rooms a second laptop joins. None of them spends a key. */
export function isOpenPath(path: string): boolean {
  return path.startsWith("/api/replays/") || path === "/api/health" || path === "/api/health/"
    || path === "/api/rooms" || path.startsWith("/api/rooms/");
}

/**
 * Whether a request for `path` from `address` carrying `headers` may be answered.
 * Express matches routes without regard to case, so this does too.
 */
export function mayAnswer(path: string, address: string | undefined, headers: IncomingHttpHeaders = {}): boolean {
  const lower = path.toLowerCase();
  return !lower.startsWith("/api/") || isOpenPath(lower) || (isLoopback(address) && !wasRelayed(headers));
}

export function localOnly(request: Request, response: Response, next: NextFunction): void {
  if (mayAnswer(request.path, request.socket.remoteAddress, request.headers)) next();
  else response.status(403).json({ error: "local_only" });
}
