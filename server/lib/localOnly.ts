// The server listens on the whole network so phones can open replay pages, but the routes that spend API credits
// only answer this machine. The socket's address decides, and a header can only take that away, never grant it:
// a request that says it was passed on by a proxy or a tunnel is not local, even from a loopback socket.
// Such a request gets the room paths a guest needs, the account paths, and nothing else under /api/, and its join attempts are counted.
// The account paths carry a password, so they answer the tunnel (HTTPS) and this machine only, never another device on plain HTTP.
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

const ACCOUNT = /^\/api\/account\/(?:status|signup|signin|signout|save)\/?$/;

/**
 * True for the account paths: a player signs in from any browser, so the tunnel reaches them as well as this machine.
 * Another device on the network does not: this server speaks plain HTTP there, and a name, a password and a session
 * token would cross the venue's Wi-Fi for anyone to read. Through the tunnel they travel inside HTTPS.
 * They are named one by one, so a route added under /api/account/ later is closed until it is added here.
 * None of them spends a key, each reads a small body of its own, and routes/account.ts bounds what a stranger can ask of them.
 */
export function isAccountPath(path: string): boolean {
  return ACCOUNT.test(path);
}

/** True for the API paths any device on the network may call: replays, health and the online rooms a second laptop joins. None of them spends a key. */
export function isOpenPath(path: string): boolean {
  return path.startsWith("/api/replays/") || path === "/api/health" || path === "/api/health/"
    || path === "/api/rooms" || path.startsWith("/api/rooms/");
}

/** True for the API paths that read a small body of their own, so the app's large JSON parser must leave them alone (../app). */
export function readsOwnBody(path: string): boolean {
  return isOpenPath(path) || isAccountPath(path);
}

/**
 * True for the only API paths that answer a request that was passed on: what a guest needs inside a room (join, events, send, address)
 * and the account paths. Making a room is not one of them: that is "/api/rooms" itself, with nothing after it.
 */
export function isTunnelPath(path: string): boolean {
  return /^\/api\/rooms\/[^/]/.test(path) || isAccountPath(path);
}

/**
 * Whether a request for `path` from `address` carrying `headers` may be answered.
 * Express matches routes without regard to case, so this does too.
 */
export function mayAnswer(path: string, address: string | undefined, headers: IncomingHttpHeaders = {}): boolean {
  const lower = path.toLowerCase();
  if (!lower.startsWith("/api/")) return true;
  // A loopback socket is this machine's own browser or a tunnel that runs here. Another device is refused whatever headers it sends.
  if (isAccountPath(lower)) return isLoopback(address);
  if (wasRelayed(headers)) return isTunnelPath(lower);
  return isOpenPath(lower) || isLoopback(address);
}

/** Join attempts one address may make in JOIN_WINDOW_MS. A room code is 4 letters, so guessing must be slow. */
export const JOIN_LIMIT = 20;
export const JOIN_WINDOW_MS = 60_000;
const MAX_CALLERS = 5000;
const JOIN = /^\/api\/rooms\/[^/]+\/join\/?$/i;

/**
 * Counts join attempts per caller in fixed windows. The returned function says whether this attempt is still within the limit.
 * It remembers at most `maxCallers` callers at once; past that a new caller is refused until old windows have run out.
 */
export function createJoinLimit(limit: number = JOIN_LIMIT, windowMs: number = JOIN_WINDOW_MS, maxCallers: number = MAX_CALLERS): (caller: string, now?: number) => boolean {
  const windows = new Map<string, { startMs: number; count: number }>();
  return (caller, now = Date.now()) => {
    const current = windows.get(caller);
    if (current !== undefined && now - current.startMs < windowMs) {
      current.count += 1;
      return current.count <= limit;
    }
    if (windows.size >= maxCallers) {
      for (const [key, window] of windows) if (now - window.startMs >= windowMs) windows.delete(key);
      if (windows.size >= maxCallers && !windows.has(caller)) return false;
    }
    windows.set(caller, { startMs: now, count: 1 });
    return true;
  };
}

/**
 * Who a join attempt is counted against. cloudflared runs on this machine and names the visitor in Cf-Connecting-Ip,
 * so that header counts only from a loopback socket. Any other device is counted by its own address, whatever it claims.
 */
function callerOf(request: Request): string {
  const address = request.socket.remoteAddress;
  const visitor = request.headers["cf-connecting-ip"];
  if (isLoopback(address) && typeof visitor === "string" && visitor.trim() !== "") return visitor.trim().slice(0, 64);
  return address ?? "unknown";
}

/** The guard as middleware. Each one keeps its own count of join attempts. */
export function createGuard(joinAllowed: (caller: string) => boolean = createJoinLimit()): (request: Request, response: Response, next: NextFunction) => void {
  return (request, response, next) => {
    const address = request.socket.remoteAddress;
    if (!mayAnswer(request.path, address, request.headers)) {
      response.status(403).json({ error: "local_only" });
      return;
    }
    // A browser on this machine is not counted. Everything else is: the tunnel's visitors and the devices on the network.
    const outside = wasRelayed(request.headers) || !isLoopback(address);
    if (outside && request.method === "POST" && JOIN.test(request.path) && !joinAllowed(callerOf(request))) {
      response.status(429).set("Retry-After", String(JOIN_WINDOW_MS / 1000)).json({ error: "too_many_joins" });
      return;
    }
    next();
  };
}

export const localOnly = createGuard();
