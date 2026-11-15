// Issue #222: a guest who was not there when the fight began (its page closed and it joined again, or it joined
// late) must still be told which fight is on. The host says the start again; a guest already in it is not reset.
import { expect, test } from "vitest";
import { startFight } from "../../src/combat/engine";
import type { CombatState } from "../../src/core/types";
import { ENEMIES } from "../../src/enemies/registry";
import { ASK_EVERY_STATES, createGuestLink } from "../../src/net/guest";
import type { GuestLink } from "../../src/net/guest";
import { ANSWER_EVERY_MS, STATE_EVERY_MS, createHostLink } from "../../src/net/host";
import type { HostLink } from "../../src/net/host";
import { parseMessage } from "../../src/net/messages";
import type { NetMessage } from "../../src/net/messages";
import { joinRoomAgain } from "../../src/net/transport";
import type { NetDeps, RoomTransport, SeatStore } from "../../src/net/transport";

const polyphemus = ENEMIES.find((enemy) => enemy.id === "polyphemus");
if (!polyphemus) throw new Error("missing polyphemus");
const FIRST: CombatState = { ...startFight(polyphemus, 9), players: 2 };
/** The fight with the monster hurt by `hp`: a state that can be told from the others. */
const hurt = (hp: number): CombatState => ({ ...FIRST, enemyHp: FIRST.enemyHp - hp });
const WON: CombatState = { ...FIRST, enemyHp: 0, phase: { kind: "won" } };

interface Seat {
  readonly link: GuestLink;
  /** Everything the host's side delivered to this seat, oldest first. */
  readonly heard: NetMessage[];
  /** What this guest sent to the host. */
  readonly sent: NetMessage[];
  /** Sends the host any message from this seat, as a guest that does not keep to the pacing could. */
  raw(message: NetMessage): void;
}

/**
 * A made-up relay for one room, behaving like server/lib/rooms.ts where it matters here: it passes messages on
 * unread, a new seat has heard nothing that was sent before it, and the host is told "peer" when a guest's
 * connection opens or goes. `quiet` seats open without the host being told, as when a guest that polls comes back
 * to its own seat before the relay noticed it was away.
 */
function room(): { host: HostLink; fromHost: NetMessage[]; join(quiet?: boolean): Seat; drop(): void; reconnect(): void } {
  const fromHost: NetMessage[] = [];
  let hostEars: ((message: NetMessage) => void)[] = [];
  let guestEars: ((message: NetMessage) => void)[] | null = null;
  const pass = (message: NetMessage, ears: readonly ((message: NetMessage) => void)[]): void => {
    const arrived = parseMessage(JSON.parse(JSON.stringify(message)));
    if (arrived) for (const ear of ears) ear(arrived);
  };
  const hostEnd: RoomTransport = {
    send(message) {
      fromHost.push(message);
      if (guestEars) pass(message, guestEars);
      return Promise.resolve(guestEars !== null);
    },
    onMessage(listener) { hostEars.push(listener); },
    close() { hostEars = []; },
  };
  const host = createHostLink(hostEnd);
  const tellHost = (joined: boolean): void => { pass({ type: "peer", joined }, hostEars); };
  return {
    host,
    fromHost,
    join(quiet = false) {
      const ears: ((message: NetMessage) => void)[] = [];
      const heard: NetMessage[] = [];
      const sent: NetMessage[] = [];
      const link = createGuestLink({
        send(message) {
          sent.push(message);
          if (guestEars === ears) pass(message, hostEars);
          return Promise.resolve(true);
        },
        onMessage(listener) { ears.push(listener); },
        close() { if (guestEars === ears) guestEars = null; },
      });
      ears.push((message) => heard.push(message));
      guestEars = ears;
      pass({ type: "peer", joined: true }, ears);
      if (!quiet) tellHost(true);
      return { link, heard, sent, raw: (message) => { if (guestEars === ears) pass(message, hostEars); } };
    },
    drop() {
      guestEars = null;
      tellHost(false);
    },
    reconnect() {
      tellHost(false);
      tellHost(true);
    },
  };
}

const kinds = (messages: readonly NetMessage[]): string[] => messages.map((message) => message.type);

test("a guest whose page closed mid-fight and who joins again is put back into the same fight", () => {
  const net = room();
  const first = net.join();
  net.host.start("polyphemus", "boxer", 9);
  net.host.publish(hurt(1), [], 0);
  expect(first.link.fight()).toEqual({ enemyId: "polyphemus", styleId: "boxer", seed: 9 });
  expect(first.link.view()?.state).toEqual(hurt(1));

  net.drop();
  expect(net.host.guestHere()).toBe(false);
  net.host.publish(hurt(2), [], 100);
  net.host.publish(hurt(3), [], 200);

  // A new page: a new seat that has heard nothing, and a new guest link.
  const back = net.join();
  expect(net.host.guestHere()).toBe(true);
  expect(kinds(back.heard)).toEqual(["peer", "start", "state"]);
  expect(back.link.fight()).toEqual({ enemyId: "polyphemus", styleId: "boxer", seed: 9 });
  expect(back.link.view()?.state, "the newest state comes with it, so a paused host still shows the fight").toEqual(hurt(3));
  expect(back.link.result()).toBeNull();
  expect(back.link.stopped()).toBe(false);

  net.host.publish(hurt(4), [{ type: "whiffed" }], 300);
  expect(back.link.view()).toEqual({ state: hurt(4), events: [{ type: "whiffed" }] });
  net.host.publish(WON, [{ type: "won" }], 400);
  expect(back.link.result()).toBe(true);
  // The states are still numbered upward with no gaps, the one sent again included.
  const states = net.fromHost.flatMap((message) => (message.type === "state" ? message.seq : []));
  expect(states).toEqual(states.map((_, index) => index + 1));
});

test("a guest who joins after the fight began, having never seen its start, is put into it", () => {
  const net = room();
  net.host.start("polyphemus", "boxer", 9);
  net.host.publish(hurt(1), [], 0);
  const late = net.join();
  expect(late.link.fight()).toEqual({ enemyId: "polyphemus", styleId: "boxer", seed: 9 });
  expect(late.link.view()?.state).toEqual(hurt(1));
});

test("the start said again does not reset a guest who is already in that fight", () => {
  const net = room();
  const guest = net.join();
  net.host.start("polyphemus", "boxer", 9);
  net.host.publish(hurt(1), [{ type: "whiffed" }], 0);
  const starts = (): number => net.fromHost.filter((message) => message.type === "start").length;
  expect(starts()).toBe(1);

  // The guest's stream drops and reconnects by itself: same page, same link, and the host hears peer off and on.
  net.reconnect();
  expect(starts()).toBe(2);
  expect(new Set(net.fromHost.flatMap((message) => (message.type === "start" ? message.id : []))).size, "the same id both times").toBe(1);
  expect(guest.link.fight()).toEqual({ enemyId: "polyphemus", styleId: "boxer", seed: 9 });
  expect(guest.link.view(), "the state and the events not yet drawn are kept").toEqual({ state: hurt(1), events: [{ type: "whiffed" }] });

  // An older state is still refused after the repeat: the count was not set back to nothing.
  const ears: ((message: NetMessage) => void)[] = [];
  const direct = createGuestLink({ send: () => Promise.resolve(true), onMessage: (listener) => ears.push(listener), close: () => undefined });
  const tell = (message: NetMessage): void => { for (const ear of ears) ear(message); };
  tell({ type: "start", enemyId: "polyphemus", styleId: "boxer", seed: 9, id: 41 });
  tell({ type: "state", seq: 5, state: hurt(5), events: [] });
  tell({ type: "end", won: false });
  tell({ type: "start", enemyId: "polyphemus", styleId: "boxer", seed: 9, id: 41 });
  tell({ type: "state", seq: 2, state: hurt(2), events: [] });
  expect(direct.view()?.state).toEqual(hurt(5));
  expect(direct.result()).toBe(false);
  // A start with another id is a new fight, even with the same stop, style and seed; so is one with no id (an older host).
  tell({ type: "start", enemyId: "polyphemus", styleId: "boxer", seed: 9, id: 42 });
  expect(direct.view()).toBeNull();
  expect(direct.result()).toBeNull();
  tell({ type: "state", seq: 1, state: hurt(1), events: [] });
  tell({ type: "start", enemyId: "polyphemus", styleId: "boxer", seed: 9 });
  expect(direct.view()).toBeNull();
});

test("a guest who joins after the fight is over, or after the host left it, is not put into it", () => {
  const won = room();
  won.host.start("polyphemus", "boxer", 9);
  won.host.publish(hurt(1), [], 0);
  won.host.publish(WON, [{ type: "won" }], 100);
  const afterWin = won.join();
  expect(kinds(afterWin.heard)).toEqual(["peer"]);
  expect(afterWin.link.fight()).toBeNull();
  expect(afterWin.link.view()).toBeNull();

  const quit = room();
  quit.host.start("polyphemus", "boxer", 9);
  quit.host.publish(hurt(1), [], 0);
  quit.host.stop();
  const afterQuit = quit.join();
  expect(kinds(afterQuit.heard)).toEqual(["peer"]);
  expect(afterQuit.link.fight()).toBeNull();
  // Asking gets no answer either.
  afterQuit.link.close();
  const asker = quit.join(true);
  asker.raw({ type: "ask" });
  quit.host.publish(hurt(2), [], 5000);
  expect(kinds(asker.heard)).toEqual(["peer"]);

  const closed = room();
  closed.host.start("polyphemus", "boxer", 9);
  closed.host.publish(hurt(1), [], 0);
  closed.host.close();
  const before = closed.fromHost.length;
  closed.join();
  expect(closed.fromHost.length).toBe(before);
});

test("only the fight that is on is said again: the next start replaces the last one", () => {
  const net = room();
  net.host.start("polyphemus", "boxer", 9);
  net.host.publish(hurt(1), [], 0);
  net.host.start("polyphemus", "karate", 10);
  const guest = net.join();
  expect(kinds(guest.heard), "no state of the old fight comes with it").toEqual(["peer", "start"]);
  expect(guest.link.fight()).toEqual({ enemyId: "polyphemus", styleId: "karate", seed: 10 });
  expect(guest.link.view()).toBeNull();
  const ids = net.fromHost.flatMap((message) => (message.type === "start" ? message.id : []));
  expect(new Set(ids).size, "each fight has its own id").toBe(2);
});

test("a guest that hears states with no fight asks, and the host answers with the start at most once a second", () => {
  const net = room();
  net.host.start("polyphemus", "boxer", 9);
  net.host.publish(hurt(1), [], 0);
  // Back on its own seat without the relay ever saying it left: the host is told nothing.
  const guest = net.join(true);
  expect(kinds(guest.heard)).toEqual(["peer"]);
  expect(guest.link.fight()).toBeNull();

  let clock = 1000;
  net.host.publish(hurt(2), [], clock);
  expect(kinds(guest.sent)).toEqual(["ask"]);
  expect(guest.link.fight(), "the host answers on its next frame").toBeNull();
  clock += 20;
  net.host.publish(hurt(3), [], clock);
  expect(kinds(guest.heard)).toEqual(["peer", "state", "start", "state"]);
  expect(guest.link.fight()).toEqual({ enemyId: "polyphemus", styleId: "boxer", seed: 9 });
  expect(guest.link.view()?.state, "the state goes out with the answer, not a frame later").toEqual(hurt(3));

  // Once in the fight the guest stops asking.
  for (let i = 0; i < 40; i++) net.host.publish(hurt(4), [], (clock += STATE_EVERY_MS));
  expect(kinds(guest.sent)).toEqual(["ask"]);

  // A guest that asks on every frame is answered once a second, not once per ask, and is not reset by the answers.
  const starts = (): number => net.fromHost.filter((message) => message.type === "start").length;
  const before = starts();
  const from = clock;
  let drawn = 0;
  guest.link.view();
  while (clock - from < ANSWER_EVERY_MS * 3) {
    guest.raw({ type: "ask" });
    net.host.publish(hurt(5), [{ type: "whiffed" }], (clock += 20));
    drawn += guest.link.view()?.events.length ?? 0;
  }
  expect(starts() - before).toBe(3);
  expect(drawn, "no event was lost to a repeat").toBe((ANSWER_EVERY_MS * 3) / 20);
});

test("a guest with no fight asks again about once a second while states keep coming unanswered", () => {
  const ears: ((message: NetMessage) => void)[] = [];
  const sent: NetMessage[] = [];
  createGuestLink({ send: (message) => { sent.push(message); return Promise.resolve(true); }, onMessage: (listener) => ears.push(listener), close: () => undefined });
  for (let seq = 1; seq <= ASK_EVERY_STATES * 2 + 1; seq++) for (const ear of ears) ear({ type: "state", seq, state: hurt(seq), events: [] });
  expect(sent).toEqual([{ type: "ask" }, { type: "ask" }, { type: "ask" }]);
});

test("messages: ask passes, and a start keeps a numeric id and is refused with any other", () => {
  expect(parseMessage({ type: "ask", extra: 1 })).toEqual({ type: "ask" });
  expect(parseMessage({ type: "start", enemyId: "circe", styleId: "boxer", seed: 4, id: 12 })).toEqual({ type: "start", enemyId: "circe", styleId: "boxer", seed: 4, id: 12 });
  expect(parseMessage({ type: "start", enemyId: "circe", styleId: "boxer", seed: 4, id: "12" })).toBeNull();
  expect(parseMessage({ type: "start", enemyId: "circe", styleId: "boxer", seed: 4, id: Number.NaN })).toBeNull();
});

test("a page that was in the room comes back to its own seat with the kept token, and joins as new once the relay has let it go", async () => {
  const calls: string[] = [];
  let seat: string | null = null;
  let seats = 0;
  let status = 0;
  const answer = (code: number, data: unknown) => Promise.resolve({ ok: code === 200, status: code, json: () => Promise.resolve(data) });
  const deps: NetDeps = {
    fetch(url, init) {
      calls.push(`${url.replace("/api/rooms/", "")} ${init.body ?? ""}`);
      if (status !== 0) return answer(status, {});
      if (url.endsWith("/KXTR/join")) {
        if (seat !== null) return answer(409, { error: "room_full" });
        seat = `guest-${String((seats += 1))}`;
        return answer(200, { token: seat });
      }
      if (url.endsWith("/KXTR/send")) return init.body?.includes(`"token":"${seat ?? "nobody"}"`) ? answer(200, { delivered: false }) : answer(401, { error: "denied" });
      return answer(404, { error: "unknown_room" });
    },
    openStream: () => ({ onmessage: null, close: () => undefined }),
  };
  const kept = new Map<string, string>();
  const store: SeatStore = { getItem: (key) => kept.get(key) ?? null, setItem: (key, value) => { kept.set(key, value); }, removeItem: (key) => { kept.delete(key); } };

  expect(await joinRoomAgain(deps, "kxtr", store)).toEqual({ code: "KXTR", token: "guest-1" });
  expect(calls).toEqual(["KXTR/join {}"]);
  // The page reloads: without the kept token the relay says the room is full; with it the page has its seat back.
  expect(await joinRoomAgain(deps, "KXTR", null)).toBe("room_full");
  calls.length = 0;
  expect(await joinRoomAgain(deps, "KXTR", store)).toEqual({ code: "KXTR", token: "guest-1" });
  expect(calls).toEqual(['KXTR/send {"token":"guest-1","message":{"type":"ask"}}']);
  // A token for one room is not tried on another.
  calls.length = 0;
  expect(await joinRoomAgain(deps, "ZZZZ", store)).toBe("unknown_room");
  expect(calls).toEqual(["ZZZZ/join {}"]);
  // The relay freed the seat (away 20 seconds): the old token is refused once, forgotten, and the page joins as new.
  seat = null;
  calls.length = 0;
  expect(await joinRoomAgain(deps, "KXTR", store)).toEqual({ code: "KXTR", token: "guest-2" });
  expect(calls).toEqual(['KXTR/send {"token":"guest-1","message":{"type":"ask"}}', "KXTR/join {}"]);
  expect(await joinRoomAgain(deps, "KXTR", store)).toEqual({ code: "KXTR", token: "guest-2" });
  // Told to slow down, the token is kept for the next try; storage that throws or holds rubbish is the same as none.
  status = 429;
  expect(await joinRoomAgain(deps, "KXTR", store)).toBe("slow_down");
  status = 0;
  expect(await joinRoomAgain(deps, "KXTR", store)).toEqual({ code: "KXTR", token: "guest-2" });
  kept.set([...kept.keys()][0] ?? "", "{not json");
  expect(await joinRoomAgain(deps, "KXTR", store)).toBe("room_full");
  const closedStore: SeatStore = { getItem: () => { throw new Error("no storage"); }, setItem: () => { throw new Error("no storage"); }, removeItem: () => { throw new Error("no storage"); } };
  seat = null;
  expect(await joinRoomAgain(deps, "KXTR", closedStore)).toEqual({ code: "KXTR", token: "guest-3" });
  expect(await joinRoomAgain({ ...deps, fetch: () => Promise.reject(new Error("offline")) }, "KXTR", store)).toBe("unreachable");
});
