// The "power is ready" banner: its words for every god and for no god, when it shows, and when Athena announces it.
import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { GODS, GOD_IDS } from "../../src/ai/gods/gods";
import type { GodId } from "../../src/ai/gods/gods";
import { PowerReady } from "../../src/ai/power/PowerReady";
import {
  LENDER, MAX_ANNOUNCEMENTS, READY_START, REMIND_MS, RETRY_MS, champion, isPowerKey, missed, nextCheckIn, powerLive, powerPrompt, powerUsable,
  trackReady,
} from "../../src/ai/power/powerPrompt";
import type { ReadyTrack } from "../../src/ai/power/powerPrompt";
import { ATHENA_LINES } from "../../src/audio/athenaLines";
import { POWER_MOVES } from "../../src/combat/engine";
import { MOVES } from "../../src/moves/registry";

const CLIP_INDEX = JSON.parse(readFileSync("public/audio/athena/index.json", "utf8")) as string[];
const WHO: readonly (GodId | null)[] = [...GOD_IDS, null];

describe("powerPrompt", () => {
  test.each(WHO)("%s: the move spends the meter, has a key, and Athena has a clip that calls it", (god) => {
    const prompt = powerPrompt(god, false);
    const owner = GODS[god ?? LENDER];
    expect(prompt.god).toBe(owner.id);
    expect(prompt.accent).toBe(owner.accent);
    expect(prompt.moveId).toBe(owner.power.moveId);
    expect(POWER_MOVES.has(prompt.moveId)).toBe(true);
    const def = MOVES.get(prompt.moveId);
    expect(def?.kind).toBe("strike");
    // The banner shouts the same word the prompt card and the power effect do.
    expect(prompt.move).toBe(def?.prompt);
    expect(prompt.move).toBe(owner.power.name);
    expect(prompt.key).not.toBeNull();
    expect(prompt.key).toBe(def?.key.toUpperCase());
    expect(prompt.callId).toBe(`call_${prompt.moveId}`);
    expect(ATHENA_LINES.some((line) => line.id === prompt.callId)).toBe(true);
    expect(CLIP_INDEX).toContain(prompt.callId);
    expect(existsSync(`public/audio/athena/${prompt.callId}.mp3`)).toBe(true);
  });

  test("the title names the player's god, or says Athena lends her aegis when there is none", () => {
    expect(GOD_IDS.map((god) => powerPrompt(god, false).title)).toEqual([
      "ZEUS'S POWER IS READY", "POSEIDON'S POWER IS READY", "ATHENA'S POWER IS READY",
      "HERMES'S POWER IS READY", "ARTEMIS'S POWER IS READY", "APOLLO'S POWER IS READY",
    ]);
    const lent = powerPrompt(null, false);
    expect(lent.title).toBe("ATHENA LENDS YOU HER AEGIS");
    expect(lent.move).toBe("AEGIS PUSH");
    expect(lent.god).toBe("athena");
  });

  test("with a hero the title names the hero, whatever god owns the power", () => {
    const prompt = powerPrompt("artemis", true, "Odysseus");
    expect(prompt.title).toBe("ODYSSEUS'S POWER IS READY");
    expect(prompt.move).toBe("MOON ARROW");
    expect(prompt.how).toBe(`Press ${prompt.key}`);
    expect(powerPrompt("zeus", false, "Zeus").title).toBe("ZEUS'S POWER IS READY");
  });

  test.each(WHO)("%s on camera: the god's own one-line gesture, short enough for two lines of the banner", (god) => {
    const prompt = powerPrompt(god, false);
    expect(prompt.how).toBe(GODS[god ?? LENDER].power.blurb);
    // With " or press 2" after it, two lines of the banner's right-hand column (about 27 characters each).
    expect(prompt.how.length).toBeLessThanOrEqual(42);
    expect(prompt.how).not.toMatch(/press/i);
  });

  test("the gesture names the part the detector waits for: hands together for the sun burst, the hand dropped for the arrow", () => {
    // sunBurst.ts fires only if the hands were together in the last half second; moonArrow.ts only when the string hand leaves the shoulder.
    expect(powerPrompt("apollo", false).how).toMatch(/hands together/i);
    expect(MOVES.get("sun_burst")?.hint).toMatch(/hands together/i);
    expect(powerPrompt("artemis", false).how).toMatch(/drop/i);
    expect(MOVES.get("moon_arrow")?.hint).toMatch(/drop/i);
  });

  test.each(WHO)("%s on the keyboard: the instruction is the key, read from the move's definition", (god) => {
    const prompt = powerPrompt(god, true);
    const key = MOVES.get(prompt.moveId)?.key ?? "";
    expect(key).toMatch(/^[1-6]$/);
    expect(prompt.how).toBe(`Press ${key}`);
    expect(prompt.key).toBe(key);
  });

  test("the six gods have six different moves, keys and colours", () => {
    const prompts = GOD_IDS.map((god) => powerPrompt(god, true));
    for (const field of ["moveId", "key", "accent", "title"] as const) {
      expect(new Set(prompts.map((prompt) => prompt[field])).size, field).toBe(6);
    }
    expect(new Set(prompts.map((prompt) => prompt.moveId))).toEqual(new Set(POWER_MOVES));
  });
});

describe("powerUsable", () => {
  test("only a full meter counts, and nothing that is not a number", () => {
    expect([0, 0.5, 0.999, 1, 1.2, Number.NaN, Number.POSITIVE_INFINITY].map((power) => powerUsable(power))).toEqual([
      false, false, false, true, true, false, false,
    ]);
  });

  test("a full meter is of no use in the finishing move or after the result", () => {
    expect(["intro", "defend", "strike", "recover"].map((phase) => powerUsable(1, phase))).toEqual([true, true, true, true]);
    expect(["finisher", "won", "lost"].map((phase) => powerUsable(1, phase))).toEqual([false, false, false]);
  });
});

describe("powerLive", () => {
  test("the power move is taken only while a card is up: the engine's own two phases, read from its source", () => {
    expect(["defend", "strike"].map((phase) => powerLive(phase))).toEqual([true, true]);
    expect(["intro", "recover", "finisher", "won", "lost"].map((phase) => powerLive(phase))).toEqual([false, false, false, false, false]);
    // No phase given (the lab page): only the meter decides, as for powerUsable.
    expect(powerLive()).toBe(true);
    // If the engine opens another phase to the power, this fails and the banner must follow.
    const open = /const open = ([^;]+);/.exec(readFileSync("src/combat/engine.ts", "utf8"))?.[1] ?? "";
    expect([...open.matchAll(/state\.phase\.kind === "(\w+)"/g)].map((match) => match[1])).toEqual(["defend", "strike"]);
  });

  test("the key on the banner's cap is the key that is kept, and no other", () => {
    for (const god of WHO) {
      const prompt = powerPrompt(god, true);
      const key = MOVES.get(prompt.moveId)?.key ?? "";
      expect(isPowerKey(prompt.key, key)).toBe(true);
      expect(isPowerKey(prompt.key, "j")).toBe(false);
      expect(isPowerKey(prompt.key, " ")).toBe(false);
    }
    expect(isPowerKey("Space", " ")).toBe(true);
    expect(isPowerKey("J", "j")).toBe(true);
    expect(isPowerKey(null, "3")).toBe(false);
  });
});

/** Feeds the tracker one reading every 100 ms and returns the times it announced. */
function run(powerAt: (ms: number) => number, untilMs: number, heard: (ms: number) => boolean = () => true): number[] {
  const said: number[] = [];
  let track: ReadyTrack = READY_START;
  for (let ms = 0; ms <= untilMs; ms += 100) {
    const result = trackReady(track, powerAt(ms), ms);
    track = result.track;
    if (!result.announce) continue;
    if (heard(ms)) said.push(ms);
    else track = missed(track, ms);
  }
  return said;
}

describe("trackReady", () => {
  test("announces the moment the meter fills, once more ten seconds later, and never a third time", () => {
    expect(run((ms) => (ms < 2000 ? ms / 2000 : 1), 60_000)).toEqual([2000, 2000 + REMIND_MS]);
    expect(MAX_ANNOUNCEMENTS).toBe(2);
    expect(REMIND_MS).toBe(10_000);
  });

  test("a meter spent before the reminder is announced once", () => {
    expect(run((ms) => (ms >= 1000 && ms < 6000 ? 1 : 0.4), 30_000)).toEqual([1000]);
  });

  test("a meter that is spent and fills again is announced again, twice at most each time", () => {
    const power = (ms: number): number => (ms < 1000 ? 0.8 : ms < 4000 ? 1 : ms < 20_000 ? 0.6 : 1);
    expect(run(power, 50_000)).toEqual([1000, 20_000, 30_000]);
  });

  test("says nothing while the meter is short of full, and a reading that is not a number counts as empty", () => {
    expect(run((ms) => Math.min(0.99, ms / 10_000), 30_000)).toEqual([]);
    expect(trackReady(READY_START, Number.NaN, 0)).toEqual({ track: READY_START, announce: false });
    const full = trackReady(READY_START, 1, 500).track;
    expect(trackReady(full, Number.NaN, 600).track).toBe(READY_START);
  });

  test("an announcement that was not heard is tried again soon, and does not use up a turn", () => {
    // A phase line holds the voice until 2.5 s: the first try at 0 s is refused, the retry lands, the reminder follows.
    const said = run(() => 1, 60_000, (ms) => ms >= 2500);
    expect(said).toEqual([RETRY_MS, RETRY_MS + REMIND_MS]);
    // Never heard at all (no clip): it keeps asking, a few seconds apart, and nothing is ever said.
    expect(run(() => 1, 30_000, () => false)).toEqual([]);
  });

  test("nextCheckIn says when to ask again, and null once there is nothing left to say", () => {
    expect(nextCheckIn(READY_START, 0)).toBeNull();
    const first = trackReady(READY_START, 1, 1000).track;
    expect(nextCheckIn(first, 1000)).toBe(REMIND_MS);
    expect(nextCheckIn(first, 4000)).toBe(REMIND_MS - 3000);
    expect(nextCheckIn(missed(first, 1000), 1000)).toBe(RETRY_MS);
    const second = trackReady(first, 1, 1000 + REMIND_MS).track;
    expect(second.said).toBe(2);
    expect(nextCheckIn(second, 1000 + REMIND_MS)).toBeNull();
    expect(missed(READY_START, 0)).toBe(READY_START);
  });
});

describe("the PowerReady banner", () => {
  const html = (props: Parameters<typeof PowerReady>[0]): string => renderToStaticMarkup(createElement(PowerReady, props));

  test("with no god it draws nothing until the meter is full", () => {
    for (const power of [0, 0.4, 0.99, Number.NaN]) expect(html({ god: null, power, keyboard: true, phase: "defend" })).toBe("");
  });

  test.each(GOD_IDS)("%s: while the meter fills, a still plate names the god the player is the champion of, in the god's colour", (god) => {
    for (const power of [0, 0.4, 0.99]) {
      for (const phase of ["intro", "defend", "strike", "recover", undefined]) {
        const out = html(phase === undefined ? { god, power, keyboard: false } : { god, power, keyboard: false, phase });
        expect(out).toMatch(new RegExp(`^<div class="power-ready power-ready--champion power-ready--${god}"`));
        expect(out).toContain(">Champion of<");
        expect(out).toContain(`>${GODS[god].name}<`);
        expect(out).toContain(`--power-ready-accent:${GODS[god].accent}`);
        // It is not the banner: nothing to press, and it is not read out.
        expect(out).not.toContain("power-ready--live");
        expect(out).not.toContain("<kbd");
        expect(out).not.toContain("aria-live");
      }
    }
  });

  test("the plate leaves when the banner comes (it names the god itself), and for the finishing move and the result", () => {
    expect(html({ god: "poseidon", power: 1, keyboard: false, phase: "defend" })).not.toContain("power-ready--champion");
    // With a hero there is no plate while the meter fills, and the full banner names the hero.
    expect(html({ god: "artemis", hero: "Odysseus", power: 0.5, keyboard: true, phase: "strike" })).toBe("");
    expect(html({ god: "artemis", hero: "Odysseus", power: 1, keyboard: true, phase: "defend" })).toContain("ODYSSEUS&#x27;S POWER IS READY");
    for (const phase of ["finisher", "won", "lost"]) {
      expect(html({ god: "poseidon", power: 0.5, keyboard: false, phase })).toBe("");
      expect(champion("poseidon", 0.5, phase)).toBeNull();
    }
    expect(champion("poseidon", 0.5, "strike")).toEqual({ name: "Poseidon", god: "poseidon", accent: GODS.poseidon.accent });
    expect(champion(null, 0.5, "strike")).toBeNull();
    expect(champion("hades" as GodId, 0.5, "strike")).toBeNull();
    expect(html({ god: "hades" as GodId, power: 0.5, keyboard: false })).toBe("");
  });

  test.each(WHO)("%s: shows the title, the move, the gesture and the key, in the god's colour", (god) => {
    const prompt = powerPrompt(god, false);
    const out = html({ god, power: 1, keyboard: false });
    expect(out).toContain(prompt.title.replace("'", "&#x27;"));
    expect(out).toContain(prompt.move);
    expect(out).toContain(prompt.how);
    expect(out).toContain(`--power-ready-accent:${prompt.accent}`);
    expect(out).toMatch(new RegExp(`<kbd[^>]*>${prompt.key ?? "?"}</kbd>`));
    expect(out).toMatch(/^<div class="power-ready power-ready--live /);
  });

  test("on the keyboard the instruction is the key alone", () => {
    const out = html({ god: "poseidon", power: 1, keyboard: true });
    expect(out).toContain("power-ready--keys");
    expect(out).toMatch(/Press <kbd[^>]*>2<\/kbd>/);
    expect(out).not.toContain(GODS.poseidon.power.blurb);
  });

  test("leaves for the finishing move and the result, and stays through the beats between prompts", () => {
    for (const phase of ["finisher", "won", "lost"]) expect(html({ god: "zeus", power: 1, keyboard: false, phase })).toBe("");
    for (const phase of ["defend", "strike", "recover"]) expect(html({ god: "zeus", power: 1, keyboard: false, phase })).not.toBe("");
  });

  test.each(WHO)("%s: between cards a full banner stays up but waits, and with a card up it asks", (god) => {
    for (const keyboard of [true, false]) {
      for (const phase of ["recover", "intro"]) {
        const out = html({ god, power: 1, keyboard, phase });
        expect(out).toMatch(/^<div class="power-ready power-ready--live [^"]*power-ready--waiting"/);
        expect(out).toContain('<div class="power-ready__wait" aria-hidden="false">On the next card</div>');
        // A press is marked as kept only after it is made.
        expect(out).not.toContain("power-ready--queued");
        // The move's name stays; the plate is the same size, so nothing jumps when the card comes.
        expect(out).toContain(powerPrompt(god, keyboard).move);
        expect(out).toContain("<kbd");
      }
      for (const phase of ["defend", "strike", undefined]) {
        const out = html(phase === undefined ? { god, power: 1, keyboard } : { god, power: 1, keyboard, phase });
        expect(out).not.toContain("power-ready--waiting");
        expect(out).toContain('<div class="power-ready__wait" aria-hidden="true">On the next card</div>');
      }
    }
  });

  test("a god it does not know draws nothing instead of throwing", () => {
    expect(html({ god: "hades" as GodId, power: 1, keyboard: false })).toBe("");
  });
});
