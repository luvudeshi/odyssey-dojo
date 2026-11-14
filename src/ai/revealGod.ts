// The god scan from start to finish: ask the server (Gemini) first, and fall back to the scan that runs in the browser.
// Never rejects, and never waits on the network for more than a few seconds.
import type { PoseFrame } from "../core/types";
import type { GodId } from "./gods/gods";
import { offlineReveal } from "./gods/offlineReveal";
import type { Reveal } from "./gods/offlineReveal";
import type { Tint } from "./gods/tint";
import { fetchPortrait, requestReveal } from "./reveal";

/** How long the player may watch "the oracle is looking" before the browser decides instead. */
const REVEAL_BUDGET_MS = 6000;

export interface GodReveal extends Reveal {
  /** The portrait's URL, once it exists: the AI's painting if it arrives in time, else the marble one made here. */
  readonly portrait: Promise<string | null>;
}

export interface ScanInput {
  /** The webcam snapshot as a JPEG data URL. Null (no camera, or the player said no) skips the server entirely. */
  readonly snapshot: string | null;
  /** The player's pose when the snapshot was taken. */
  readonly frame: PoseFrame | null;
  /** The average colour of their clothing. */
  readonly tint: Tint | null;
  readonly seed: number;
}

export interface ScanDeps {
  readonly request?: typeof requestReveal;
  readonly portrait?: typeof fetchPortrait;
  /** Makes the portrait in the browser. Used whenever the AI's does not arrive. */
  readonly drawPortrait?: (god: GodId) => string | null;
  readonly toUrl?: (blob: Blob) => string;
}

export async function revealGod(input: ScanInput, deps: ScanDeps = {}): Promise<GodReveal> {
  const request = deps.request ?? requestReveal;
  const portrait = deps.portrait ?? fetchPortrait;
  const toUrl = deps.toUrl ?? ((blob: Blob) => URL.createObjectURL(blob));
  const local = (god: GodId): string | null => deps.drawPortrait?.(god) ?? null;

  const answer = input.snapshot === null ? null : await request(input.snapshot, { timeoutMs: REVEAL_BUDGET_MS });
  if (answer === null) {
    const reveal = offlineReveal(input);
    return { ...reveal, portrait: Promise.resolve(local(reveal.god)) };
  }
  const painted =
    answer.portrait_id === null
      ? Promise.resolve(null)
      : portrait(answer.portrait_id).then((blob) => (blob === null ? null : toUrl(blob)));
  return {
    god: answer.god,
    epithet: answer.epithet,
    reason: answer.reason,
    rivalGod: answer.rival_god,
    source: "ai",
    portrait: painted.then((url) => url ?? local(answer.god)).catch(() => local(answer.god)),
  };
}
