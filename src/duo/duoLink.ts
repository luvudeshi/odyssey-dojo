// Two players on one camera: makes the second body the second player of an ordinary two-player fight.
// FightScreen already takes a HostLink for the online rooms (src/net/host.ts) and the FaceTime call uses the same
// one. This builds that very link on a transport that never leaves the page: player two's strikes, read from their
// own body, come in as the guest's messages. So the rules of a room fight hold unchanged: both strike, and the same
// strike made within TOGETHER_MS of each other hits twice as hard.
//
// One thing is added, because here both players stand in front of the monster: each defends for themself. In a
// room only the host defends. Here the defend the attack asks for counts only when both players have made it; if
// either misses it, the attack lands on the health the two share.
import type { CombatEvent, CombatInput, CombatState, MoveDef, PoseFrame } from "../core/types";
import { TOGETHER_MS, createHostLink } from "../net/host";
import type { HostLink } from "../net/host";
import type { NetMessage } from "../net/messages";
import type { RoomTransport } from "../net/transport";
import { createBodyReader } from "./split";

/** Where player two's body and the number of players come from: duoCamera in the game, made-up frames in tests. */
export interface DuoSource {
  second(now: number): PoseFrame | null;
  players(now: number): 1 | 2;
}

export interface DuoOptions {
  /** "each" (the default): both players must make the defend. "first": only player one defends, as in a room. */
  readonly defend?: "each" | "first";
  /** The clock `guestHere` reads; `takeInput` and `publish` are given the time. */
  readonly clock?: () => number;
}

/** A held strike is let go after TOGETHER_MS; the extra covers the slowest frame the fight allows (100 ms). */
const HOLD_MS = TOGETHER_MS + 150;

/** What a defend phase has seen of one player's counter: the same rule as the engine's own (src/combat/engine.ts). */
type Seen = "ready" | "met" | undefined;
function seenAfter(seen: Seen, held: boolean): Seen {
  if (seen === "met" || (seen === "ready" && held)) return "met";
  return held ? seen : "ready";
}

export function createDuoLink(source: DuoSource, moves: ReadonlyMap<string, MoveDef>, options: DuoOptions = {}): HostLink {
  const each = (options.defend ?? "each") === "each";
  const clock = options.clock ?? (() => performance.now());
  let toHost: ((message: NetMessage) => void) | null = null;
  // What the host "sends" has nowhere to go: both players read the same screen.
  const transport: RoomTransport = {
    send: () => Promise.resolve(true),
    onMessage(listener) { toHost = listener; },
    close() { toHost = null; },
  };
  const host = createHostLink(transport);
  const reader = createBodyReader(moves);
  let two = false;
  /** Until this time a strike may still be held back for the other player's, so the link must keep being asked. */
  let holdUntil = -Infinity;
  let secondHeld: ReadonlySet<string> = new Set();
  /** The counter of the attack that is coming, or null outside a defend phase. */
  let counter: string | null = null;
  let seen: [Seen, Seen] = [undefined, undefined];

  /** Reads player two's newest frame. Their strikes count only while they are in the fight. */
  const pump = (now: number): void => {
    const here = source.players(now) === 2;
    if (here !== two) {
      two = here;
      toHost?.({ type: "peer", joined: here });
      if (here) reader.settle();
    }
    const input = reader.read(source.second(now));
    secondHeld = input.held;
    if (!two) return;
    for (const strike of input.struck) toHost?.({ type: "strike", move: strike.move, quality: strike.quality });
    if (input.struck.length > 0) holdUntil = now + HOLD_MS;
  };

  return {
    // With player two gone nothing waits for a second strike. But a strike that was already held back for theirs
    // is still let go: the link says "here" until it has been.
    guestHere() {
      const now = clock();
      pump(now);
      return two || now < holdUntil;
    },
    start(enemyId, styleId, seed) {
      counter = null;
      seen = [undefined, undefined];
      host.start(enemyId, styleId, seed);
    },
    takeInput(local: CombatInput, nowMs: number): CombatInput {
      pump(nowMs);
      if (local.struck.length > 0) holdUntil = nowMs + HOLD_MS;
      const merged = host.takeInput(local, nowMs);
      if (!each || !two || counter === null) return merged;
      const made = [local.held.has(counter), secondHeld.has(counter)] as const;
      seen = [seenAfter(seen[0], made[0]), seenAfter(seen[1], made[1])];
      const both = (seen[0] === "met" || made[0]) && (seen[1] === "met" || made[1]);
      const held = new Set(local.held);
      if (both) held.add(counter);
      else held.delete(counter);
      return { held, struck: merged.struck };
    },
    publish(state: CombatState, events: readonly CombatEvent[], nowMs: number) {
      const next = state.phase.kind === "defend" ? state.phase.attack.counter : null;
      if (next === null || next !== counter || events.some((event) => event.type === "telegraph")) seen = [undefined, undefined];
      counter = next;
      host.publish(state, events, nowMs);
    },
    stop() { host.stop(); },
    close() { host.close(); },
  };
}
