// A page that reaches the relay through a proxy which keeps a stream open on the relay's side after the browser
// has gone (Vercel's rewrite does) must never open the event stream: the relay would not see the member leave.
// With `pollOnly` the link asks by long polling from the first moment.
import { expect, test } from "vitest";
import type { NetMessage } from "../../src/net/messages";
import { openRoom } from "../../src/net/transport";
import type { EventStream, NetDeps } from "../../src/net/transport";

/** A relay made of one list of answers to `/poll`; after the list it holds every poll until the link closes. */
function fakeRelay(answers: readonly unknown[]): { deps: NetDeps; asked: string[]; streams: string[] } {
  const asked: string[] = [];
  const streams: string[] = [];
  let next = 0;
  const deps: NetDeps = {
    fetch: (url, init) => {
      asked.push(url);
      if (next < answers.length) {
        const data = answers[next++];
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
      }
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => { reject(new Error("aborted")); });
      });
    },
    openStream: (url): EventStream => {
      streams.push(url);
      return { onmessage: null, onerror: null, close: () => undefined };
    },
    pollOnly: true,
  };
  return { deps, asked, streams };
}

test("a poll-only link never opens the event stream and hears what the polls bring", async () => {
  const relay = fakeRelay([
    { messages: [{ seq: 1, message: { type: "peer", joined: true } }], seq: 1, peer: true },
    { messages: [{ seq: 2, message: { type: "strike", move: "jab", quality: 0.8 } }], seq: 2, peer: true },
  ]);
  const heard: NetMessage[] = [];
  const link = openRoom(relay.deps, { code: "ABCD", token: "t" });
  link.onMessage((message) => heard.push(message));
  await expect.poll(() => heard.length).toBe(2);
  link.close();
  expect(relay.streams).toEqual([]);
  expect(heard).toEqual([{ type: "peer", joined: true }, { type: "strike", move: "jab", quality: 0.8 }]);
  expect(relay.asked[0]).toContain("/api/rooms/ABCD/poll?");
  expect(relay.asked[0]).toContain("after=0");
  expect(relay.asked[2]).toContain("after=2");
});

test("without the switch the link opens the stream as before", () => {
  const relay = fakeRelay([]);
  const link = openRoom({ ...relay.deps, pollOnly: false }, { code: "ABCD", token: "t" });
  link.close();
  expect(relay.streams.length).toBe(1);
  // It never polled; the one call is the link saying it left as it closed.
  expect(relay.asked).toEqual(["/api/rooms/ABCD/leave"]);
});
