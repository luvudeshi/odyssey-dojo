// What the share panel does, with no React and no DOM: the words on the card, the line that says what will be
// uploaded, and the share itself as a small state machine (idle -> uploading -> shared | failed).
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
    footer: `${style}${hasQr ? "Scan to watch the fight" : "Odyssey Fighter, HackUTA 2026"}`,
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
  return `odyssey-fighter-${slug === "" ? "card" : slug}.png`;
}

/** True when the upload would send this card: it has been painted, and it is not too big for the server. */
export function sendsCard(card: Blob | null): boolean {
  return card !== null && card.size > 0 && card.size <= MAX_CARD_BYTES;
}

/** True when the upload would send this video: there is one, and it is not too big for the server. */
export function sendsVideo(video: Blob | null): video is Blob {
  return video !== null && video.size > 0 && video.size <= MAX_VIDEO_BYTES;
}

export type ShareState =
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

/** A share can start from rest, or again after a failure. Never while one is running or once it has worked. */
export function canShare(state: ShareState): boolean {
  return state.kind === "idle" || state.kind === "failed";
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

/** The one line under the Share button. Before the press it says exactly what will be uploaded: `card` and `video` as they stand. */
export function statusLine(state: ShareState, card: Blob | null, video: Blob | null): string {
  if (state.kind === "uploading" && state.stage === "video") return "Sending the fight video...";
  if (state.kind === "uploading") return sendsCard(card) ? "Sending the card..." : "Making the replay page...";
  if (state.kind === "shared" && state.videoFailed) return "The fight video did not upload. The link opens the page without it.";
  if (state.kind === "shared") return "Scan the code, or open the link, to see it on a phone.";
  if (state.kind === "failed") return "Sharing is unavailable right now. You can still save the card.";
  const parts: string[] = sendsCard(card) ? ["this card"] : [];
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
}

/** Uploads once and reports each step to `send`. Never rejects: whatever goes wrong ends as "done" with no links. */
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
    links = await (deps.upload ?? uploadReplay)(job, { fetcher: staged });
  } catch (error) {
    log("warn", "share_failed", error);
  }
  tell({ type: "done", links, videoFailed });
}
