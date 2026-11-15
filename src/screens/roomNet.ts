// The browser's own fetch and EventSource, in the shape src/net/transport.ts asks for.
import type { EventStream, NetDeps } from "../net/transport";

export const browserDeps: NetDeps = {
  fetch: (url, init) => fetch(url, init),
  openStream(url) {
    const source = new EventSource(url);
    const stream: EventStream = { onmessage: null, close: () => { source.close(); } };
    source.onmessage = (event: MessageEvent<unknown>) => { stream.onmessage?.({ data: event.data }); };
    return stream;
  },
  beacon: (url, body) => navigator.sendBeacon(url, body),
  onPageGone(gone) {
    // A page only put aside (kept for Back) is still in its room, so it says nothing.
    const on = (event: PageTransitionEvent): void => { if (!event.persisted) gone(); };
    window.addEventListener("pagehide", on);
    return () => { window.removeEventListener("pagehide", on); };
  },
};

/** How long the address lookup may take before the caller falls back to this page's own address. */
export const LAN_BASE_TIMEOUT_MS = 3000;

/** The address a phone on the same Wi-Fi can reach, from the server; null when the server does not answer in `timeoutMs`. */
export async function fetchLanBase(timeoutMs: number): Promise<string | null> {
  try {
    const response = await fetch(`/api/rooms/address?port=${window.location.port}`, { signal: AbortSignal.timeout(timeoutMs) });
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "base" in body && typeof body.base === "string") return body.base;
  } catch {
    // No server: the caller falls back to this page's own address.
  }
  return null;
}
