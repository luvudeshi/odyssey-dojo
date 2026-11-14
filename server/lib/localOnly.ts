// The server listens on the whole network so phones can open replay pages, but the routes that spend API credits
// only answer this machine. The socket's own address decides; headers such as X-Forwarded-For are never trusted.
import type { NextFunction, Request, Response } from "express";

const LOOPBACK: readonly string[] = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];

export function isLoopback(address: string | undefined): boolean {
  return address !== undefined && LOOPBACK.includes(address);
}

/** True for the API paths any device on the network may call: replays and health. */
export function isOpenPath(path: string): boolean {
  return path.startsWith("/api/replays/") || path === "/api/health" || path === "/api/health/";
}

/** Whether a request for `path` from `address` may be answered. Express matches routes without regard to case, so this does too. */
export function mayAnswer(path: string, address: string | undefined): boolean {
  const lower = path.toLowerCase();
  return !lower.startsWith("/api/") || isOpenPath(lower) || isLoopback(address);
}

export function localOnly(request: Request, response: Response, next: NextFunction): void {
  if (mayAnswer(request.path, request.socket.remoteAddress)) next();
  else response.status(403).json({ error: "local_only" });
}
