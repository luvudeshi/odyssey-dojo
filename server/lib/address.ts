// Works out the address a phone on the same Wi-Fi should open to reach this server.
import { networkInterfaces } from "node:os";

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
  /** PUBLIC_BASE_URL, when the person running the server set one. */
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
