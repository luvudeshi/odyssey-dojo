// What the share panel does, with no React and no DOM: the words on the card, the line that says what will be
// uploaded, and the share itself as a small state machine (idle -> uploading -> shared | failed).
// Share is held ("preparing") until the card on screen is the finished one, so the card uploaded is the card the player sees.
import { GODS } from "../../ai/gods/gods";
import type { GodReveal } from "../../ai/revealGod";
import { log } from "../../core/log";
import { GOLD } from "../cardPalette";
import { MAX_CARD_BYTES, MAX_VIDEO_BYTES } from "../contracts";
import type { ReplayMeta } from "../contracts";
import type { GodCardData } from "../godCard";
import { uploadReplay } from "../upload";
import type { ReplayLinks } from "../upload";

export interface ShareFight {
  /** The god from the scan. Null when the scan was skipped: the card is then of Odysseus himself. */
  readonly god: Pick<GodReveal, "god" | "epithet"> | null;
  readonly won: boolean;
  readonly enemyName: string;
  /** The enemy's title, e.g. "The Cyclops of the Cave". */
  readonly fightTitle: string;
  readonly score: number;
  /** The fighting style's name, e.g. "Boxer". */
  readonly style: string;
}

/** Everything on the card except its two pictures. */
export type CardWords = Omit<GodCardData, "portrait" | "qr">;

export function cardWords(fight: ShareFight, hasQr = false): CardWords {
  const god = fight.god === null ? null : GODS[fight.god.god];
  const style = fight.style.trim() === "" ? "" : `Fighting style: ${fight.style.trim()} · `;
  return {
    godName: god?.name ?? "Odysseus",
    // Odysseus gives himself this title when he shouts his name to Polyphemus (Odyssey 9.504).
    epithet: fight.god?.epithet ?? "sacker of cities",
    domain: god?.domain ?? "King of Ithaca",
    enemyName: fight.enemyName,
    fightTitle: fight.fightTitle,
    score: Number.isFinite(fight.score) ? fight.score : 0,
    won: fight.won,
    accent: god?.accent ?? GOLD,
    footer: `${style}${hasQr ? "Scan to watch the fight" : "Odyssey Dojo, HackUTA 2026"}`,
  };
}

/** What the phone page is told about the fight, cut to the lengths the server accepts. */
export function replayMeta(words: CardWords): ReplayMeta {
  return {
    godName: words.godName.slice(0, 60),
    epithet: words.epithet.slice(0, 120),
    enemyName: words.enemyName.slice(0, 60),
    fightTitle: words.fightTitle.slice(0, 120),
    score: Math.max(-1e9, Math.min(1e9, words.score)),
    won: words.won,
  };
}

export function cardFileName(godName: string): string {
  const slug = godName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `odyssey-dojo-${slug === "" ? "card" : slug}.png`;
}

/** True when the upload would send this card: it has been painted, and it is not too big for the server. */
export function sendsCard(card: Blob | null): boolean {
  return card !== null && card.size > 0 && card.size <= MAX_CARD_BYTES;
}

/** True when the upload would send this video: there is one, and it is not too big for the server. */
export function sendsVideo(video: Blob | null): video is Blob {
  return video !== null && video.size > 0 && video.size <= MAX_VIDEO_BYTES;
}

/** The longest Share is held for the god's portrait. The scan gives up on the AI's painting after 13 seconds, so only a picture that never loads gets this far. */
export const PORTRAIT_WAIT_MS = 15_000;

/**
 * The god's portrait, loaded by `load`. Null when there is none, when it is broken, or when it takes longer than `waitMs`.
 * Never rejects. A portrait that comes later than the limit is left off: the card that was shared stays the card on screen.
 */
export function portraitWithin<T>(
  portrait: Promise<string | null> | undefined,
  load: (url: string | null) => Promise<T | null>,
  waitMs = PORTRAIT_WAIT_MS,
): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { resolve(null); }, waitMs);
    const settle = (value: T | null): void => {
      clearTimeout(timer);
      resolve(value);
    };
    (portrait ?? Promise.resolve(null)).then(load).then(settle, () => { settle(null); });
  });
}

/** What a paint of the card was made from. */
export interface PaintedFrom<P> {
  readonly words: CardWords;
  readonly portrait: P | null;
  /** False while the god's portrait is still on its way: a card painted then carries the placeholder emblem. */
  readonly settled: boolean;
}

/** True when the last paint that finished is the card for what the panel holds now: the same words, the same portrait, and the portrait settled. */
export function cardFinished<P>(painted: PaintedFrom<P> | null, now: PaintedFrom<P>): boolean {
  return painted !== null && painted.settled && now.settled && painted.words === now.words && painted.portrait === now.portrait;
}

export type ShareState =
  // The card on screen is not the finished one yet (the god's portrait is still coming, or it is being repainted).
  | { readonly kind: "preparing" }
  | { readonly kind: "idle" }
  | { readonly kind: "uploading"; readonly stage: "card" | "video" }
  // videoFailed: the video was sent and the server did not take it, so the phone page has no video.
  | { readonly kind: "shared"; readonly links: ReplayLinks; readonly videoFailed: boolean }
  | { readonly kind: "failed" };

export type ShareEvent =
  | { readonly type: "start" }
  | { readonly type: "video" }
  | { readonly type: "done"; readonly links: ReplayLinks | null; readonly videoFailed: boolean };

export const IDLE: ShareState = { kind: "idle" };
export const PREPARING: ShareState = { kind: "preparing" };

/** A share can start from rest, or again after a failure. Never while one is running or once it has worked. */
export function canShare(state: ShareState): boolean {
  return state.kind === "idle" || state.kind === "failed";
}

/**
 * What the panel shows and acts on. A share that could start is held while the card on screen is not the finished one:
 * a share sends the card as it is at the press and is never sent again, so an early press would upload the placeholder for good.
 */
export function heldUntilReady(state: ShareState, cardReady: boolean): ShareState {
  return canShare(state) && !cardReady ? PREPARING : state;
}

function isWebLink(url: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function shareStep(state: ShareState, event: ShareEvent): ShareState {
  if (event.type === "start") return canShare(state) ? { kind: "uploading", stage: "card" } : state;
  if (state.kind !== "uploading") return state;
  if (event.type === "video") return { kind: "uploading", stage: "video" };
  // The link is put on the page as something to click, so only a web address counts as shared.
  if (event.links === null || !isWebLink(event.links.pageUrl)) return { kind: "failed" };
  return { kind: "shared", links: event.links, videoFailed: event.videoFailed };
}

/** What the status line has to know about the page besides the share itself. */
export interface ShareShows {
  /** The QR code is on the page. A code that did not load is not offered for scanning. */
  readonly qr?: boolean;
  /** The card carries the player's portrait from the scan, which the scan screen said is not saved. */
  readonly portrait?: boolean;
}

/**
 * The one line under the Share button. Before the press it says exactly what will be uploaded: `card` and `video` as they stand,
 * and that the player's portrait goes with the card when it is on it.
 */
export function statusLine(state: ShareState, card: Blob | null, video: Blob | null, shows: ShareShows = {}): string {
  if (state.kind === "preparing") return "Painting your card. You can share it once it is finished.";
  if (state.kind === "uploading" && state.stage === "video") return "Sending the fight video...";
  if (state.kind === "uploading") return sendsCard(card) ? "Sending the card..." : "Making the replay page...";
  if (state.kind === "shared" && state.videoFailed) return "The fight video did not upload. The link opens the page without it.";
  if (state.kind === "shared") return shows.qr === true ? "Scan the code, or open the link, to see it on a phone." : "Open the link to see it on a phone.";
  if (state.kind === "failed") return "Sharing is unavailable right now. You can still save the card.";
  const parts: string[] = [];
  if (sendsCard(card)) parts.push(shows.portrait === true ? "this card, with your portrait on it," : "this card");
  if (sendsVideo(video)) parts.push(`the video of your fight (${(video.size / 1e6).toFixed(1)} MB)`);
  if (parts.length === 0) return "There is nothing to share yet.";
  return `Share uploads ${parts.join(" and ")} to this game's server. Anyone with the link can see it.`;
}

export interface ShareJob {
  readonly meta: ReplayMeta;
  readonly card: Blob | null;
  readonly video: Blob | null;
}

export interface ShareDeps {
  readonly upload?: typeof uploadReplay;
  readonly fetcher?: typeof fetch;
  /** Aborting this stops the share: the request on its way is cancelled and a video not yet started is not sent. */
  readonly signal?: AbortSignal;
}

/** Uploads once and reports each step to `send`. Never rejects: whatever goes wrong, or a share that is stopped, ends as "done". */
export async function runShare(job: ShareJob, send: (event: ShareEvent) => void, deps: ShareDeps = {}): Promise<void> {
  const tell = (event: ShareEvent): void => {
    try {
      send(event);
    } catch (error) {
      log("warn", "share_listener_failed", error);
    }
  };
  let links: ReplayLinks | null = null;
  let videoFailed = false;
  tell({ type: "start" });
  try {
    const fetcher = deps.fetcher ?? fetch;
    // The video is the only PUT the upload makes, so seeing one is how the panel knows the card has gone.
    const staged: typeof fetch = (input, init) => {
      if (init?.method !== "PUT") return fetcher(input, init);
      tell({ type: "video" });
      // The upload only logs a video the server did not take, so the answer is read here. Failed until it says ok.
      videoFailed = true;
      const sent = fetcher(input, init);
      void sent.then((response) => { videoFailed = !response.ok; }, () => undefined);
      return sent;
    };
    links = await (deps.upload ?? uploadReplay)(job, { fetcher: staged, ...(deps.signal ? { signal: deps.signal } : {}) });
  } catch (error) {
    log("warn", "share_failed", error);
  }
  tell({ type: "done", links, videoFailed });
}

/**
 * A share of which only one runs at a time: a press while one is running starts nothing, so it makes no second replay page.
 * The panel's own state cannot be the guard, because presses that land before it is drawn again all see the state from before the first.
 */
export function oneShareAtATime(run: typeof runShare = runShare): typeof runShare {
  let running: Promise<void> | null = null;
  return (job, send, deps) => {
    running ??= run(job, send, deps).finally(() => { running = null; });
    return running;
  };
}
