// The "How do you fight?" screen itself: what it asks the server, what the card shows and what Fight hands back.
// There is no DOM here. React's hooks are replaced by small stand-ins, the component is called as a function and its element tree is read.
// So this checks what the screen does, not how it looks, and not React's own scheduling.
import { isValidElement } from "react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fightFromLevel } from "../../src/ai/adapt";
import { LevelRequestSchema, LevelSpecSchema } from "../../src/ai/contracts";
import type { LevelSpec } from "../../src/ai/contracts";
import { fallbackLevel } from "../../src/ai/fallbacks";
import { EXAMPLE_PHRASES, MAX_EPITHET_LENGTH, MAX_PHRASE_LENGTH } from "../../src/ai/ui/phrase";
import { ENEMIES } from "../../src/enemies/registry";
import { MOVES } from "../../src/moves/registry";

type Screen = typeof import("../../src/ai/ui/StyleScreen").StyleScreen;
type Props = Parameters<Screen>[0];
type Done = Parameters<Props["onDone"]>[0];
type El = ReactElement<Record<string, unknown>>;

const fakes = vi.hoisted(() => {
  let slots: unknown[] = [];
  let cursor = 0;
  let cleanups: (() => void)[] = [];
  return {
    reset(): void { slots = []; cursor = 0; cleanups = []; },
    rewind(): void { cursor = 0; },
    unmount(): void { for (const stop of cleanups.splice(0)) stop(); },
    useState: (initial: unknown): [unknown, (next: unknown) => void] => {
      const at = cursor++;
      if (at >= slots.length) slots.push(typeof initial === "function" ? (initial as () => unknown)() : initial);
      const set = (next: unknown): void => { slots[at] = typeof next === "function" ? (next as (was: unknown) => unknown)(slots[at]) : next; };
      return [slots[at], set];
    },
    useRef: (initial: unknown): unknown => {
      const at = cursor++;
      if (at >= slots.length) slots.push({ current: initial });
      return slots[at];
    },
    // Runs once, during the first render. React would run it just after; nothing here depends on the difference.
    useEffect: (effect: () => undefined | (() => void)): void => {
      const at = cursor++;
      if (at < slots.length) return;
      slots.push(null);
      const stop = effect();
      if (stop) cleanups.push(stop);
    },
    prepareLine: vi.fn<(speaker: string, line: string) => Promise<string | null>>(),
    speakLine: vi.fn<(speaker: string, line: string) => Promise<boolean>>(),
    stopNarration: vi.fn<() => void>(),
    log: vi.fn<(level: string, event: string, detail?: unknown) => void>(),
  };
});

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: fakes.useState,
  useRef: fakes.useRef,
  useEffect: fakes.useEffect,
}));
vi.mock("../../src/audio/narration", () => ({ prepareLine: fakes.prepareLine, speakLine: fakes.speakLine, stopNarration: fakes.stopNarration }));
vi.mock("../../src/core/log", () => ({ log: fakes.log }));

class FakeRecognizer {
  static made: FakeRecognizer[] = [];
  static brokenMicrophone = false;
  maxAlternatives = 1;
  onresult: ((event: { results: { transcript: string; confidence: number }[][] }) => void) | null = null;
  onerror: (() => void) | null = null;
  onend: (() => void) | null = null;
  started = 0;
  aborted = 0;
  constructor() {
    FakeRecognizer.made.push(this);
  }
  start(): void {
    if (FakeRecognizer.brokenMicrophone) throw new Error("no microphone");
    this.started += 1;
  }
  abort(): void {
    this.aborted += 1;
  }
}

interface Call {
  readonly url: string;
  readonly init: RequestInit | undefined;
  readonly body: unknown;
  readonly answer: (response: Response) => void;
  readonly fail: (error: Error) => void;
}

const PHRASE = "like a Texas thunderstorm";
const REQUEST = { phrase: PHRASE, god: "zeus", rival_god: "poseidon", epithet: "Stormcaller" } as const;
/** A level only the stubbed server gives: the bundled fallback for the phrase with a title of its own. */
const LEVEL: LevelSpec = LevelSpecSchema.parse({ ...fallbackLevel(REQUEST), title: "The Title Only The Server Gave" });
const fromServer = (level: LevelSpec): Response => new Response(JSON.stringify({ level, source: "ai" }));

function elements(node: unknown, found: El[] = []): El[] {
  if (Array.isArray(node)) {
    for (const child of node as unknown[]) elements(child, found);
  } else if (isValidElement<Record<string, unknown>>(node)) {
    found.push(node);
    elements(node.props.children, found);
  }
  return found;
}

function words(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return (node as unknown[]).map(words).join("");
  return isValidElement<Record<string, unknown>>(node) ? words(node.props.children) : "";
}

function fire(element: El | undefined, handler: string, ...args: unknown[]): void {
  const found = element?.props[handler];
  if (typeof found !== "function") throw new Error(`nothing on the screen has that ${handler} handler`);
  (found as (...given: unknown[]) => void)(...args);
}

/** Loads the screen fresh (it looks for speech recognition once, when the module loads) and renders it with the stand-in hooks. */
async function mount(extra: { epithet?: string; onBack?: () => void } = {}, options: { speech?: boolean } = {}) {
  const ticks: (() => void)[] = [];
  const clearInterval = vi.fn<(id: number) => void>();
  vi.stubGlobal("window", {
    setInterval: (tick: () => void): number => { ticks.push(tick); return 7; },
    clearInterval,
    ...(options.speech === true ? { webkitSpeechRecognition: FakeRecognizer } : {}),
  });
  const calls: Call[] = [];
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => new Promise<Response>((answer, fail) => {
    calls.push({ url, init, body: typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined, answer, fail });
  }));
  fakes.reset();
  vi.resetModules();
  const { StyleScreen } = await import("../../src/ai/ui/StyleScreen");
  const done: Done[] = [];
  const props: Props = { god: "zeus", rivalGod: "poseidon", onDone: (fight) => { done.push(fight); }, ...extra };

  const show = () => {
    fakes.rewind();
    const tree: unknown = StyleScreen(props);
    const all = elements(tree);
    const withClass = (name: string): El[] => all.filter((element) => String(element.props.className).split(" ").includes(name));
    return {
      text: words(tree),
      withClass,
      lines: (name: string): string[] => withClass(name).map(words),
      button: (label: string): El | undefined => all.find((element) => element.type === "button" && words(element) === label),
      input: all.find((element) => element.type === "input"),
      form: all.find((element) => element.type === "form"),
    };
  };
  const type = (value: string): void => { fire(show().input, "onChange", { target: { value } }); };
  const submit = (): void => { fire(show().form, "onSubmit", { preventDefault: () => undefined }); };
  const card = async (): Promise<ReturnType<typeof show>> => {
    await vi.waitFor(() => { expect(show().withClass("style-card")).toHaveLength(1); });
    return show();
  };
  return { show, type, submit, card, calls, done, ticks, clearInterval };
}

beforeEach(() => {
  // The server has no voice unless a test gives it one.
  fakes.prepareLine.mockResolvedValue(null);
  fakes.speakLine.mockResolvedValue(false);
});

afterEach(() => {
  fakes.unmount();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  FakeRecognizer.made = [];
  FakeRecognizer.brokenMicrophone = false;
});

test("the first step asks, offers four different examples and will not build from an empty box", async () => {
  const screen = await mount();
  const asked = screen.show();
  expect(asked.text).toContain("How do you fight?");
  expect(asked.input?.props.value).toBe("");
  expect(asked.input?.props.maxLength).toBe(MAX_PHRASE_LENGTH);
  expect(asked.input?.props.placeholder).toBe(EXAMPLE_PHRASES[0]);
  expect(asked.button("Build my fight")?.props.disabled).toBe(true);
  // No speech recognition here and no onBack given, so neither button is offered.
  expect(asked.button("Speak it")).toBeUndefined();
  expect(asked.button("Back")).toBeUndefined();

  const chips = asked.lines("style-chip");
  expect(chips).toHaveLength(4);
  expect(new Set(chips).size).toBe(4);
  for (const chip of chips) expect(EXAMPLE_PHRASES).toContain(chip);

  fire(asked.withClass("style-chip")[2], "onClick");
  const picked = screen.show();
  expect(picked.input?.props.value).toBe(chips[2]);
  expect(picked.button("Build my fight")?.props.disabled).toBe(false);
  // The examples stay put from one render to the next.
  expect(picked.lines("style-chip")).toEqual(chips);
  expect(screen.calls).toHaveLength(0);

  // The placeholder moves on to the next example on the timer.
  screen.ticks[0]?.();
  expect(screen.show().input?.props.placeholder).toBe(EXAMPLE_PHRASES[1]);
});

test("Build sends the tidied phrase with the player's god, the rival and the epithet, and shows the working step", async () => {
  const screen = await mount({ epithet: "  Stormcaller " });
  screen.type("  like a   Texas\nthunderstorm ");
  screen.submit();

  const working = screen.show();
  expect(working.lines("style-working")).toEqual(["The Muse is composing..."]);
  expect(working.withClass("style-working")[0]?.props.role).toBe("status");
  expect(working.lines("style-said")).toEqual([PHRASE]);

  expect(screen.calls).toHaveLength(1);
  expect(screen.calls[0]?.url).toBe("/api/level");
  expect(screen.calls[0]?.init?.method).toBe("POST");
  expect(screen.calls[0]?.body).toEqual(REQUEST);
  expect(LevelRequestSchema.parse(screen.calls[0]?.body)).toEqual(REQUEST);
});

test("the card shows the fight the server made, and Fight hands back that fight as an enemy the engine runs", async () => {
  const screen = await mount({ epithet: "Stormcaller" });
  screen.type(PHRASE);
  screen.submit();
  screen.calls[0]?.answer(fromServer(LEVEL));

  const card = await screen.card();
  expect(card.lines("style-title")).toEqual([LEVEL.title]);
  expect(card.lines("style-heard")).toEqual([`We heard: ${LEVEL.interpretation}`]);
  expect(card.lines("style-monster")).toEqual([LEVEL.monster.name]);
  expect(card.lines("style-setting")).toEqual([LEVEL.arena.setting]);
  expect(card.lines("style-phase")).toEqual(LEVEL.phases.map((phase) => phase.name));
  expect(card.withClass("style-swatch").map((swatch) => swatch.props.style)).toEqual(LEVEL.arena.palette.map((background) => ({ background })));
  // The note is only for a bundled fight.
  expect(card.withClass("style-note")).toHaveLength(0);
  expect(fakes.prepareLine).toHaveBeenCalledExactlyOnceWith("homer", LEVEL.narration_intro);

  expect(screen.done).toHaveLength(0);
  fire(card.button("Fight"), "onClick");
  expect(screen.done).toHaveLength(1);
  const fight = screen.done[0];
  expect(fight?.source).toBe("ai");
  expect(fight?.level).toEqual(LEVEL);
  expect(fight?.enemy).toEqual(fightFromLevel(LEVEL, ENEMIES, MOVES));
  expect(fight?.enemy.name).toBe(LEVEL.monster.name);
  expect(fight?.enemy.title).toBe(LEVEL.title);
  // It is the made fight, not a quest stop handed back unchanged.
  for (const stop of ENEMIES) expect(fight?.enemy).not.toEqual(stop);
  // It keeps the id of the quest stop that lends it a model and an arena. So whoever mounts this screen must not
  // report the fight to the quest as that stop beaten: the quest's "ended" action would mark the real stop as cleared.
  expect(ENEMIES.map((stop) => stop.id)).toContain(fight?.enemy.id);
  expect(fakes.stopNarration).toHaveBeenCalled();
});

test("with the server out of reach the card shows a bundled fight and says so", async () => {
  const screen = await mount({ epithet: "Stormcaller" });
  screen.type(PHRASE);
  screen.submit();
  screen.calls[0]?.fail(new Error("server not up"));

  const card = await screen.card();
  const bundled = fallbackLevel(REQUEST);
  expect(card.lines("style-title")).toEqual([bundled.title]);
  expect(card.lines("style-note")).toEqual(["The Muse was out of reach, so this one comes from the old songs."]);
  fire(card.button("Fight"), "onClick");
  expect(screen.done).toEqual([{ enemy: fightFromLevel(bundled, ENEMIES, MOVES), level: bundled, source: "fallback" }]);
});

test("a server that refuses the request or answers with something that is not a level also ends in a bundled fight", async () => {
  for (const answer of [new Response("{}", { status: 400 }), new Response(JSON.stringify({ level: { title: "half a level" }, source: "ai" }))]) {
    const screen = await mount();
    screen.type(PHRASE);
    screen.submit();
    screen.calls[0]?.answer(answer);
    const card = await screen.card();
    expect(card.withClass("style-note")).toHaveLength(1);
    fire(card.button("Fight"), "onClick");
    expect(screen.done[0]?.source).toBe("fallback");
    fakes.unmount();
  }
});

test("an epithet longer than the server allows is cut to fit, and an empty one is left out", async () => {
  const long = await mount({ epithet: "e".repeat(MAX_EPITHET_LENGTH + 40) });
  long.type(PHRASE);
  long.submit();
  expect(long.calls[0]?.body).toEqual({ ...REQUEST, epithet: "e".repeat(MAX_EPITHET_LENGTH) });
  expect(LevelRequestSchema.safeParse(long.calls[0]?.body).success).toBe(true);
  fakes.unmount();

  for (const epithet of ["", "   \n"]) {
    const blank = await mount({ epithet });
    blank.type(PHRASE);
    blank.submit();
    expect(blank.calls[0]?.body).toEqual({ phrase: PHRASE, god: "zeus", rival_god: "poseidon" });
    fakes.unmount();
  }

  const none = await mount();
  none.type(PHRASE);
  none.submit();
  expect(none.calls[0]?.body).toEqual({ phrase: PHRASE, god: "zeus", rival_god: "poseidon" });
});

test("a box with nothing visible in it sends nothing", async () => {
  const screen = await mount();
  for (const blank of ["", "   ", "\n\t", "​‍⁠", "\u0000\u0007"]) {
    screen.type(blank);
    expect(screen.show().button("Build my fight")?.props.disabled).toBe(true);
    screen.submit();
    expect(screen.show().text).toContain("How do you fight?");
  }
  expect(screen.calls).toHaveLength(0);
});

test("Try another phrase goes back to the question with the phrase kept, and asks again on the next Build", async () => {
  const screen = await mount();
  screen.type(`  ${PHRASE}  `);
  screen.submit();
  screen.calls[0]?.answer(fromServer(LEVEL));
  const card = await screen.card();

  fire(card.button("Try another phrase"), "onClick");
  const asked = screen.show();
  expect(asked.text).toContain("How do you fight?");
  expect(asked.input?.props.value).toBe(PHRASE);
  expect(fakes.stopNarration).toHaveBeenCalled();
  expect(screen.done).toHaveLength(0);

  screen.type("like my cat at 3am");
  screen.submit();
  expect(screen.calls).toHaveLength(2);
  expect(screen.calls[1]?.body).toEqual({ phrase: "like my cat at 3am", god: "zeus", rival_god: "poseidon" });
});

test("Homer reads the intro while its card is showing, and stays silent if the player has moved on by the time the voice is ready", async () => {
  const voices: ((url: string | null) => void)[] = [];
  fakes.prepareLine.mockImplementation(() => new Promise((ready) => { voices.push(ready); }));
  fakes.speakLine.mockResolvedValue(true);

  const stayed = await mount();
  stayed.type(PHRASE);
  stayed.submit();
  stayed.calls[0]?.answer(fromServer(LEVEL));
  await stayed.card();
  voices[0]?.("blob:intro");
  await vi.waitFor(() => { expect(fakes.speakLine).toHaveBeenCalledExactlyOnceWith("homer", LEVEL.narration_intro); });
  fakes.unmount();
  fakes.speakLine.mockClear();

  const left = await mount();
  left.type(PHRASE);
  left.submit();
  left.calls[0]?.answer(fromServer(LEVEL));
  fire((await left.card()).button("Try another phrase"), "onClick");
  voices[1]?.("blob:intro");
  await Promise.resolve();
  await Promise.resolve();
  expect(fakes.speakLine).not.toHaveBeenCalled();
  fakes.unmount();

  // No voice on the server: nothing is spoken and nothing breaks.
  const mute = await mount();
  mute.type(PHRASE);
  mute.submit();
  mute.calls[0]?.answer(fromServer(LEVEL));
  await mute.card();
  voices[2]?.(null);
  await Promise.resolve();
  await Promise.resolve();
  expect(fakes.speakLine).not.toHaveBeenCalled();
});

test("leaving the screen stops the timer and the voice, and a fight that arrives afterwards changes nothing", async () => {
  const screen = await mount();
  screen.type(PHRASE);
  screen.submit();
  fakes.unmount();
  expect(screen.clearInterval).toHaveBeenCalledExactlyOnceWith(7);
  expect(fakes.stopNarration).toHaveBeenCalled();

  screen.calls[0]?.answer(fromServer(LEVEL));
  await new Promise((resolve) => { setTimeout(resolve, 20); });
  expect(screen.show().lines("style-working")).toHaveLength(1);
  expect(fakes.prepareLine).not.toHaveBeenCalled();
  expect(screen.done).toHaveLength(0);
});

test("Back is offered when the caller gives onBack, and calls it", async () => {
  const onBack = vi.fn<() => void>();
  const screen = await mount({ onBack });
  fire(screen.show().button("Back"), "onClick");
  expect(onBack).toHaveBeenCalledOnce();
});

test("Speak it puts the surest thing heard in the box, and stops listening when the recogniser ends", async () => {
  const screen = await mount({}, { speech: true });
  fire(screen.show().button("Speak it"), "onClick");
  const session = FakeRecognizer.made[0];
  expect(session?.started).toBe(1);
  expect(session?.maxAlternatives).toBe(3);
  const listening = screen.show();
  expect(listening.button("Speak it")).toBeUndefined();
  expect(listening.button("Listening...")).toBeDefined();
  expect(listening.input?.props.placeholder).toBe("Listening...");

  session?.onresult?.({ results: [[{ transcript: "like a moose.", confidence: 0.2 }, { transcript: " Like a goose. ", confidence: 0.9 }]] });
  expect(screen.show().input?.props.value).toBe("Like a goose");
  // Nothing heard leaves the box as it was.
  session?.onresult?.({ results: [[{ transcript: "  ", confidence: 1 }]] });
  session?.onresult?.({ results: [] });
  expect(screen.show().input?.props.value).toBe("Like a goose");

  session?.onend?.();
  expect(screen.show().button("Speak it")).toBeDefined();
  expect(session?.aborted).toBe(0);
});

test("listening is cut off by pressing the button again, by Build and by leaving the screen", async () => {
  const screen = await mount({}, { speech: true });
  fire(screen.show().button("Speak it"), "onClick");
  fire(screen.show().button("Listening..."), "onClick");
  expect(FakeRecognizer.made[0]?.aborted).toBe(1);
  expect(screen.show().button("Speak it")).toBeDefined();
  // A result from the session that was cut off is ignored.
  FakeRecognizer.made[0]?.onresult?.({ results: [[{ transcript: "too late", confidence: 1 }]] });
  expect(screen.show().input?.props.value).toBe("");

  fire(screen.show().button("Speak it"), "onClick");
  screen.type(PHRASE);
  screen.submit();
  expect(FakeRecognizer.made[1]?.aborted).toBe(1);
  expect(screen.calls).toHaveLength(1);
  fakes.unmount();

  const leaving = await mount({}, { speech: true });
  fire(leaving.show().button("Speak it"), "onClick");
  fakes.unmount();
  expect(FakeRecognizer.made[2]?.aborted).toBe(1);
});

test("a microphone that will not start leaves the typed path working", async () => {
  FakeRecognizer.brokenMicrophone = true;
  const screen = await mount({}, { speech: true });
  fire(screen.show().button("Speak it"), "onClick");
  expect(fakes.log).toHaveBeenCalledWith("warn", "speech_unavailable", expect.any(Error));
  expect(screen.show().button("Speak it")).toBeDefined();
  screen.type(PHRASE);
  screen.submit();
  expect(screen.calls).toHaveLength(1);
});
