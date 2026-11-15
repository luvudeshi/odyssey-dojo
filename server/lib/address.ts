// Works out the address a phone should open to reach this server: a tunnel's https address while one is up, else the Wi-Fi one.
import { readFileSync, statSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";

type Interfaces = ReturnType<typeof networkInterfaces>;

const HOST = /^(?:[a-z0-9.-]+|\[[0-9a-f:]+\])(?::\d{1,5})?$/i;

/** The first IPv4 address other machines can reach. Self-assigned 169.254 addresses are skipped: they mean no network answered. */
export function lanAddress(interfaces: Interfaces = networkInterfaces()): string | null {
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254.")) return entry.address;
    }
  }
  return null;
}

export interface Arrival {
  /** PUBLIC_BASE_URL or PUBLIC_URL when the person running the server set one, else the address of a running tunnel. */
  readonly publicBaseUrl: string | null;
  readonly lan: string | null;
  /** The port the request came in on, which is the one a phone must use too. */
  readonly port: number | undefined;
  readonly protocol: string;
  /** The request's own Host header. It comes from the caller, so it is only used when it looks like a host. */
  readonly host: string | undefined;
}

/** The start of every link handed to a phone, with no trailing slash. */
export function baseUrl(arrival: Arrival): string {
  if (arrival.publicBaseUrl !== null) return arrival.publicBaseUrl.replace(/\/+$/, "");
  if (arrival.lan !== null && arrival.port !== undefined) return `http://${arrival.lan}:${String(arrival.port)}`;
  const host = arrival.host !== undefined && HOST.test(arrival.host) ? arrival.host : `localhost:${String(arrival.port ?? 80)}`;
  return `${arrival.protocol === "https" ? "https" : "http"}://${host}`;
}

/** What scripts/tunnel.mjs keeps in the data folder while its tunnel is up: `{ "url": "https://...", "pid": 1234 }`. */
export const TUNNEL_FILE = "tunnel.json";
/** The script touches the file every 5 seconds. One left behind by a crash or a reboot is ignored once it is this old. */
export const TUNNEL_STALE_MS = 20_000;
/** The file holds one address and one process id. A bigger one is not ours and is not read. */
export const TUNNEL_FILE_MAX_BYTES = 1024;

/** An address a phone can open from anywhere: https and a host, with no path, query, fragment or credentials. Anything else is null. */
export function publicAddress(raw: unknown): string | null {
  if (typeof raw !== "string" || !URL.canParse(raw)) return null;
  const url = new URL(raw);
  // The string must be the address and nothing more, so a path, "https://host/?", a name and password or an odd spelling are all refused.
  return url.protocol === "https:" && (raw === url.origin || raw === `${url.origin}/`) ? url.origin : null;
}

function isRunning(pid: unknown): boolean {
  // To kill(), 0 and negative numbers mean a group of processes, and 1 is always there.
  if (typeof pid !== "number" || !Number.isSafeInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

/**
 * The address of the tunnel that scripts/tunnel.mjs has open, or null. Read on every use, so the server needs no restart.
 * The file counts only while the script that wrote it is running and still touching it, and only if it holds a bare https address.
 */
export function tunnelAddress(dataDir: string, now: number = Date.now()): string | null {
  const file = join(dataDir, TUNNEL_FILE);
  try {
    const stat = statSync(file);
    // The size is looked at before the file is read, so a huge one costs nothing.
    if (stat.size > TUNNEL_FILE_MAX_BYTES || Math.abs(now - stat.mtimeMs) > TUNNEL_STALE_MS) return null;
    const saved: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (typeof saved !== "object" || saved === null || !("url" in saved) || !("pid" in saved)) return null;
    return isRunning(saved.pid) ? publicAddress(saved.url) : null;
  } catch {
    // No file, or one that cannot be read: no tunnel.
    return null;
  }
}
