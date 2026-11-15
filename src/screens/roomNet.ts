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
};

/** The address a phone on the same Wi-Fi can reach, from the server; null when the server does not answer. */
export async function fetchLanBase(): Promise<string | null> {
  try {
    const response = await fetch(`/api/rooms/address?port=${window.location.port}`);
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "base" in body && typeof body.base === "string") return body.base;
  } catch {
    // No server: the caller falls back to this page's own address.
  }
  return null;
}
