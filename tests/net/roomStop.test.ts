// The host quitting a shared fight to the map must reach the guest, and the next start must clear it.
import { expect, test } from "vitest";
import { createGuestLink } from "../../src/net/guest";
import { createHostLink } from "../../src/net/host";
import { parseMessage } from "../../src/net/messages";
import type { NetMessage } from "../../src/net/messages";

test("stop reaches the guest until the next fight starts", () => {
  const sent: NetMessage[] = [];
  const ears: ((message: NetMessage) => void)[] = [];
  const host = createHostLink({
    send: (message) => { sent.push(message); ears.forEach((ear) => { ear(message); }); return Promise.resolve(true); },
    onMessage: () => undefined,
    close: () => undefined,
  });
  const guest = createGuestLink({ send: () => Promise.resolve(true), onMessage: (listener) => ears.push(listener), close: () => undefined });
  expect(parseMessage({ type: "stop" })).toEqual({ type: "stop" });
  host.start("polyphemus", "boxer", 3);
  expect(guest.stopped()).toBe(false);
  host.stop();
  expect(sent.at(-1)).toEqual({ type: "stop" });
  expect(guest.stopped()).toBe(true);
  host.start("polyphemus", "boxer", 4);
  expect(guest.stopped()).toBe(false);
});
