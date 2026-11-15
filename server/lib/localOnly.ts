// The server listens on the whole network so phones can open replay pages, but the routes that spend API credits
// only answer this machine. The socket's address decides, and a header can only take that away, never grant it:
// a request that says it was passed on by a proxy or a tunnel is not local, even from a loopback socket.
// Such a request gets the room paths a guest needs, the account paths, the hall of heroes, and nothing else under /api/, and its join attempts are counted.
// The account paths carry a password, so they answer the tunnel (HTTPS) and this machine only, never another device on plain HTTP.
// PUBLIC_ACCOUNTS=1 is for a server behind its own HTTPS proxy on another address (the hosted copy): there they also answer a request that was passed on.
import type { IncomingHttpHeaders } from "node:http";
import { isIP } from "node:net";
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

const ACCOUNT = /^\/api\/account\/(?:status|signup|signin|signout|save|fights|rename|password)\/?$/;

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

/**
 * True for the hall of heroes: the best scores, read by anybody who has the game open, through the tunnel as well as on
 * this machine. It carries hero names and scores, no password and no token that matters, and routes/heroes.ts answers
 * it from memory. Another device on the network is still refused, as for the account paths: accounts are off there.
 */
export function isHeroesPath(path: string): boolean {
  return path === "/api/heroes" || path === "/api/heroes/";
}

/** True for the API paths any device on the network may call: replays, health and the online rooms a second laptop joins. None of them spends a key. */
export function isOpenPath(path: string): boolean {
  return path.startsWith("/api/replays/") || path === "/api/health" || path === "/api/health/"
    || path === "/api/rooms" || path.startsWith("/api/rooms/");
}

/**
 * True for the API paths that read a small body of their own, so the app's large JSON parser must leave them alone (../app).
 * The hall of heroes reads no body at all, and a stranger must not be able to make the server hold one for it.
 */
export function readsOwnBody(path: string): boolean {
  return isOpenPath(path) || isAccountPath(path) || isHeroesPath(path);
}

/**
 * True for the only API paths that answer a request that was passed on: what a guest needs inside a room (join, events, send, address)
 * the account paths and the hall of heroes. Making a room is not one of them: that is "/api/rooms" itself, with nothing after it.
 */
export function isTunnelPath(path: string): boolean {
  return /^\/api\/rooms\/[^/]/.test(path) || isAccountPath(path) || isHeroesPath(path);
}

/**
 * True when PUBLIC_ROOMS=1: this server is the room server behind a public page (docs/rooms-tunnel.md, "The hosted
 * copy"), so a request that was passed on may also make a room. Off unless the value is exactly "1", so a laptop behaves as it always has.
 * It opens that one path and nothing else, and the room limits (./roomLimits) bound what a stranger can do with it.
 */
export function publicRooms(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.PUBLIC_ROOMS?.trim() === "1";
}

/**
 * True when PUBLIC_ACCOUNTS=1: this server is the game server behind a public page (docs/accounts.md, "On a public
 * server"). Every visitor's request then reaches it through its own proxy, from that proxy's address and not from
 * this machine, so the account paths and the hall of heroes also answer a request that was passed on to a socket
 * that is not loopback. Off unless the value is exactly "1", so a laptop behaves as it always has.
 * It opens those paths and nothing else. The proxy must speak HTTPS to the visitor: a password travels on these paths.
 *
 * The same setting, and only it, makes the account routes and the hall count a caller by that proxy's own
 * X-Forwarded-For entry (lastHop below) and stop reading Cf-Connecting-Ip, which such a proxy passes on as the caller
 * wrote it. PUBLIC_ROOMS=1 alone does not: without PUBLIC_ACCOUNTS=1 these routes count callers as they always have.
 */
export function publicAccounts(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.PUBLIC_ACCOUNTS?.trim() === "1";
}

/** Making a room: "/api/rooms" itself, with or without one closing slash, and nothing after it. */
function isRoomsRoot(path: string): boolean {
  return path === "/api/rooms" || path === "/api/rooms/";
}

/**
 * The network an address counts as. One home or phone is given a whole IPv6 /64 and can use any address in it,
 * so an IPv6 address is cut to its first four groups. An IPv4 address is kept whole.
 */
export function network(address: string): string {
  const plain = (address.split("%")[0] ?? "").toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(plain);
  if (mapped !== null) return mapped[1] ?? plain;
  if (!plain.includes(":")) return plain;
  const [head = "", tail] = plain.split("::");
  const groups = head === "" ? [] : head.split(":");
  const end = tail === undefined || tail === "" ? [] : tail.split(":");
  if (tail !== undefined) while (groups.length + end.length < 8) groups.push("0");
  return `${[...groups, ...end].slice(0, 4).map((group) => group.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/**
 * With PUBLIC_ROOMS=1 the server sits behind its own proxy (Caddy in deploy/vultr), and every request reaches it from
 * that proxy's one address. The proxy writes the address it took the request from as the last entry of
 * X-Forwarded-For, so that entry is the counting key: one budget per caller, not one for the whole internet.
 * Only the last entry is read. The ones before it are whatever the caller sent. Null when it is not an address.
 * It is only ever a counting key: it never makes a request local. A server that callers reach with no proxy in
 * between must not set PUBLIC_ROOMS: there a caller writes this header itself, and only the shared caps hold it.
 * The entry is whoever spoke to the proxy. When that is another proxy (the public page on Vercel passes /api/ on),
 * everybody who came through it is one caller: see ./roomLimits, "one caller can be a whole venue".
 */
export function lastHop(headers: IncomingHttpHeaders): string | null {
  const value = headers["x-forwarded-for"];
  const last = (typeof value === "string" ? value : "").split(",").pop()?.trim() ?? "";
  return last.length <= 64 && isIP(last) !== 0 ? network(last) : null;
}

/**
 * Whether a request for `path` from `address` carrying `headers` may be answered.
 * Express matches routes without regard to case, so this does too.
 * `roomsArePublic` is what publicRooms() said: with it a request that was passed on may make a room as well.
 * Making a room is a POST, so with the flag on no other method opens that path: a route added there later stays closed.
 * `accountsArePublic` is what publicAccounts() said: with it a request that was passed on reaches the account paths
 * and the hall of heroes on any socket. One with no proxy header is another device speaking plain HTTP, and stays refused.
 */
export function mayAnswer(
  path: string, address: string | undefined, headers: IncomingHttpHeaders = {}, roomsArePublic = false, method = "POST", accountsArePublic = false,
): boolean {
  const lower = path.toLowerCase();
  if (!lower.startsWith("/api/")) return true;
  // A loopback socket is this machine's own browser or a tunnel that runs here. Another device is refused whatever
  // headers it sends, unless this server was told it sits behind its own proxy (PUBLIC_ACCOUNTS=1) and the request was passed on.
  if (isAccountPath(lower) || isHeroesPath(lower)) return isLoopback(address) || (accountsArePublic && wasRelayed(headers));
  if (wasRelayed(headers)) return isTunnelPath(lower) || (roomsArePublic && isRoomsRoot(lower) && method.toUpperCase() === "POST");
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
 * With PUBLIC_ROOMS=1 every request comes from the server's own proxy, so the socket address is the same for the whole
 * world and one stranger would use up everybody's joins. There the proxy's own entry in X-Forwarded-For is the caller,
 * and Cf-Connecting-Ip is not read at all: that proxy passes it on as the caller wrote it.
 */
export function joinCaller(address: string | undefined, headers: IncomingHttpHeaders, roomsArePublic = false): string {
  if (roomsArePublic) return lastHop(headers) ?? address ?? "unknown";
  const visitor = headers["cf-connecting-ip"];
  if (isLoopback(address) && typeof visitor === "string" && visitor.trim() !== "") return visitor.trim().slice(0, 64);
  return address ?? "unknown";
}

/**
 * The guard as middleware. Each one keeps its own count of join attempts.
 * `roomsArePublic` and `accountsArePublic` are asked on every request, because the server reads its .env after this file is loaded.
 */
export function createGuard(
  joinAllowed: (caller: string) => boolean = createJoinLimit(),
  roomsArePublic: () => boolean = publicRooms,
  accountsArePublic: () => boolean = publicAccounts,
): (request: Request, response: Response, next: NextFunction) => void {
  return (request, response, next) => {
    const address = request.socket.remoteAddress;
    const open = roomsArePublic();
    if (!mayAnswer(request.path, address, request.headers, open, request.method, accountsArePublic())) {
      response.status(403).json({ error: "local_only" });
      return;
    }
    // A browser on this machine is not counted. Everything else is: the tunnel's visitors and the devices on the network.
    const outside = wasRelayed(request.headers) || !isLoopback(address);
    if (outside && request.method === "POST" && JOIN.test(request.path) && !joinAllowed(joinCaller(address, request.headers, open))) {
      response.status(429).set("Retry-After", String(JOIN_WINDOW_MS / 1000)).json({ error: "too_many_joins" });
      return;
    }
    next();
  };
}

export const localOnly = createGuard();
