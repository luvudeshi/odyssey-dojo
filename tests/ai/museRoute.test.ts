// The ?ai=1 page (src/ai/ui/MuseRoute.tsx): which style it fights in, that it hands the Muse's fight nothing but a way
// to leave, and its own camera: off until "Use camera" is pressed on a fight's panel, and stopped when the page goes.
// There is no DOM and no camera here: React's hooks are small stand-ins, the camera session and the fight are stubs.
import type { ReactElement } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { FightingStyle } from "../../src/core/types";
import { CameraPanelContext } from "../../src/hud/cameraPanel";
import type { CameraPanel } from "../../src/hud/cameraPanel";
import { STYLES } from "../../src/styles/registry";

type El = ReactElement<Record<string, unknown>>;

const fakes = vi.hoisted(() => {
  let slots: unknown[] = [];
  let cursor = 0;
  let cleanups: (() => void)[] = [];
  const camera = {
    state: "off",
    start: vi.fn<() => Promise<unknown>>(),
    stop: vi.fn<() => void>(),
    check: vi.fn<(now: number) => void>(),
    status: (): string => camera.state,
    subscribe: (): (() => void) => () => undefined,
  };
  return {
    camera,
    reset(): void { slots = []; cursor = 0; cleanups = []; },
    rewind(): void { cursor = 0; },
    unmount(): void { for (const stop of cleanups.splice(0)) stop(); },
    useState: (initial: unknown): [unknown, (next: unknown) => void] => {
      const at = cursor++;
      if (at >= slots.length) slots.push(typeof initial === "function" ? (initial as () => unknown)() : initial);
      return [slots[at], (next: unknown): void => { slots[at] = next; }];
    },
    // Runs once, during the first render. React would run it just after; nothing here depends on the difference.
    useEffect: (effect: () => undefined | (() => void)): void => {
      const at = cursor++;
      if (at < slots.length) return;
      slots.push(null);
      const stop = effect();
      if (stop) cleanups.push(stop);
    },
    useSyncExternalStore: (_subscribe: unknown, read: () => unknown): unknown => read(),
    opened: [] as unknown[],
    startTracker: (): Promise<never> => Promise.reject(new Error("no camera in a test")),
    MuseFight: (): null => null,
    log: vi.fn<(level: string, event: string, detail?: unknown) => void>(),
  };
});

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: fakes.useState,
  useEffect: fakes.useEffect,
  useSyncExternalStore: fakes.useSyncExternalStore,
}));
vi.mock("../../src/pose/tracker", () => ({ startTracker: fakes.startTracker }));
vi.mock("../../src/pose/cameraSession", () => ({ createCameraSession: (open: unknown) => { fakes.opened.push(open); return fakes.camera; } }));
vi.mock("../../src/ai/ui/MuseFight", () => ({ MuseFight: fakes.MuseFight }));
vi.mock("../../src/core/log", () => ({ log: fakes.log }));

const { MuseRoute, museStyle } = await import("../../src/ai/ui/MuseRoute");

function mount(search = "?ai=1") {
  vi.stubGlobal("window", { location: { search } });
  fakes.reset();
  const onLeave = vi.fn<() => void>();
  const show = () => {
    fakes.rewind();
    const root = MuseRoute({ onLeave }) as El;
    return { root, panel: root.props.value as CameraPanel, fight: root.props.children as El };
  };
  return { show, onLeave };
}

beforeEach(() => { vi.useFakeTimers(); fakes.camera.state = "off"; });
afterEach(() => { fakes.unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetAllMocks(); });

test("the style is the one ?style names, otherwise the first", () => {
  const styles = [{ id: "boxer" }, { id: "karate" }, { id: "jiu_jitsu" }] as unknown as FightingStyle[];
  expect(museStyle("?ai=1&style=karate", styles)).toBe(styles[1]);
  expect(museStyle("?ai=1", styles)).toBe(styles[0]);
  expect(museStyle("?ai=1&style=", styles)).toBe(styles[0]);
  expect(museStyle("?ai=1&style=wizard", styles)).toBe(styles[0]);
  expect(museStyle("?ai=1&style=karate", [])).toBeUndefined();
});

test("it opens the Muse's fight on the keyboard, on a page of her own, and gives it nothing but a way to leave", () => {
  const page = mount();
  const { root, panel, fight } = page.show();
  expect(root.type).toBe(CameraPanelContext);
  expect(fight.type).toBe(fakes.MuseFight);
  expect(Object.keys(fight.props).sort()).toEqual(["god", "onLeave", "standalone", "style", "tracker"]);
  expect(fight.props.style).toBe(STYLES[0]);
  expect(fight.props.tracker).toBeNull();
  expect(fight.props.god).toBeNull();
  expect(fight.props.standalone).toBe(true);
  expect(fight.props.onLeave).toBe(page.onLeave);
  // The camera is not touched until the player asks for it.
  expect(panel.status).toBe("off");
  expect(fakes.camera.start).not.toHaveBeenCalled();
  expect(page.onLeave).not.toHaveBeenCalled();

  const named = mount(`?ai=1&style=${STYLES[STYLES.length - 1]?.id ?? ""}`).show();
  expect(named.fight.props.style).toBe(STYLES[STYLES.length - 1]);
});

test("the page has a camera of its own, opened the way the quest's is", () => {
  expect(fakes.opened).toEqual([fakes.startTracker]);
});

test("Use camera on the fight's panel starts the camera, and the fights that follow are given its tracker", async () => {
  const page = mount();
  const tracker = { read: () => null };
  fakes.camera.start.mockResolvedValue(tracker);
  page.show().panel.onCamera?.();
  expect(fakes.camera.start).toHaveBeenCalledOnce();
  await vi.waitFor(() => { expect(page.show().fight.props.tracker).toBe(tracker); });
  // The panel shows the session's own state.
  fakes.camera.state = "live";
  expect(page.show().panel.status).toBe("live");
});

test("a camera that will not start leaves the fight on the keyboard, with the button still offered", async () => {
  const page = mount();
  fakes.camera.start.mockRejectedValue(new Error("Permission denied"));
  page.show().panel.onCamera?.();
  await vi.waitFor(() => { expect(fakes.log).toHaveBeenCalledWith("warn", "tracker_failed", expect.any(Error)); });
  const after = page.show();
  expect(after.fight.props.tracker).toBeNull();
  expect(after.panel.onCamera).toBeTypeOf("function");
  expect(page.onLeave).not.toHaveBeenCalled();
});

test("the camera's watchdog runs while the page is up; leaving the page stops it and the camera", () => {
  mount().show();
  expect(fakes.camera.check).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1000);
  expect(fakes.camera.check).toHaveBeenCalledTimes(4);
  expect(fakes.camera.stop).not.toHaveBeenCalled();

  fakes.unmount();
  expect(fakes.camera.stop).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(1000);
  expect(fakes.camera.check).toHaveBeenCalledTimes(4);
});
