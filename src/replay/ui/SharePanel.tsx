// The result-screen share panel: the player's hero card, a button that saves it, and a button that shares the fight by QR.
// Nothing is sent until Share is pressed. With no server, the card and Save still work.
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { GodReveal } from "../../ai/revealGod";
import { Button } from "../../ui/pebble";
import { godCardBlob } from "../godCard";
import { IDLE, canShare, cardFileName, cardFinished, cardWords, heldUntilReady, oneShareAtATime, portraitWithin, replayMeta, sendsCard, sendsVideo, shareStep, statusLine } from "./shareFlow";
import type { PaintedFrom, ShareFight } from "./shareFlow";
import "./sharePanel.css";

export interface SharePanelProps extends ShareFight {
  /** Always null in the game now. A god, when there is one, names the card; otherwise `hero` does. */
  readonly god: GodReveal | null;
  /** The recorded fight, when there is one. It is uploaded only if Share is pressed. */
  readonly video?: Blob | null;
  /** Taking the panel off the page (this, or anything else that unmounts it) stops an upload that is running. */
  readonly onClose?: () => void;
}

interface Card {
  readonly blob: Blob;
  readonly url: string;
}

/** A portrait that has finished loading (or failed, or timed out: image null), and the god it belongs to. */
interface Portrait {
  readonly god: GodReveal | null;
  readonly image: HTMLImageElement | null;
}

/** The last paint that finished, and what it was painted from. `card` is null when nothing could be painted (no canvas). */
interface Paint extends PaintedFrom<HTMLImageElement> {
  readonly card: Card | null;
}

/** Loads a picture for the card. Resolves with null, and never rejects, when there is none or it is broken. */
function loadImage(url: string | null): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (url === null) {
      resolve(null);
      return;
    }
    try {
      const image = new Image();
      image.onload = () => { resolve(image); };
      image.onerror = () => { resolve(null); };
      image.src = url;
    } catch {
      resolve(null);
    }
  });
}

/** Saves the card as a PNG file. A real button does this, so Save is one of the pebble kit's buttons like the rest. */
function saveCard(url: string, name: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
}

export function SharePanel(props: SharePanelProps) {
  const { god, hero, power, won, enemyName, fightTitle, score, style, video = null, onClose } = props;
  const [state, send] = useReducer(shareStep, IDLE);
  const [loaded, setLoaded] = useState<Portrait | null>(null);
  const [qr, setQr] = useState<HTMLImageElement | null>(null);
  const [paint, setPaint] = useState<Paint | null>(null);
  const stop = useRef<AbortController | null>(null);
  // Presses that land before the panel is drawn again all see the same state, so the share itself refuses to run twice.
  const [runShare] = useState(() => oneShareAtATime());
  const qrUrl = state.kind === "shared" ? state.links.qrUrl : null;
  // A code the canvas cannot draw (an SVG with no size, in some browsers) is left off the card, and so is "Scan".
  const qrOnCard = qr !== null && qr.naturalWidth > 0;
  const words = useMemo(
    () => cardWords({ god, hero, power, won, enemyName, fightTitle, score, style }, qrOnCard),
    [god, hero, power, won, enemyName, fightTitle, score, style, qrOnCard],
  );
  // A portrait counts only for the god it was loaded for.
  const settled = loaded !== null && loaded.god === god;
  const portrait = settled ? loaded.image : null;

  // The portrait can arrive after the god does. Until it settles the card shows its placeholder emblem and Share is held.
  useEffect(() => {
    let alive = true;
    void portraitWithin(god?.portrait, loadImage).then((image) => { if (alive) setLoaded({ god, image }); });
    return () => { alive = false; };
  }, [god]);

  // Once the fight is shared, its QR code is drawn onto the card too, so a saved card leads back to the replay.
  useEffect(() => {
    let alive = true;
    void loadImage(qrUrl).then((image) => { if (alive) setQr(image); });
    return () => { alive = false; };
  }, [qrUrl]);

  // The card is painted once per change and kept as a PNG: the same file is shown, saved and uploaded.
  useEffect(() => {
    let alive = true;
    void godCardBlob({ ...words, portrait, qr }).then((blob) => {
      if (!alive) return;
      const card = blob === null ? null : { blob, url: URL.createObjectURL(blob) };
      // A card that cannot be painted (no canvas) leaves whatever was there before.
      setPaint((before) => ({ card: card ?? before?.card ?? null, words, portrait, settled }));
    });
    return () => { alive = false; };
  }, [words, portrait, qr, settled]);

  const card = paint?.card ?? null;
  useEffect(() => {
    const url = card?.url;
    return () => { if (url !== undefined) URL.revokeObjectURL(url); };
  }, [card]);

  // An upload the player walked away from is stopped: closing the panel cancels the request on its way.
  useEffect(() => {
    const controller = new AbortController();
    stop.current = controller;
    return () => { controller.abort(); };
  }, []);

  // Share is held until the card on screen is the finished one: painted from these words and the settled portrait.
  const view = heldUntilReady(state, cardFinished(paint, { words, portrait, settled }));
  const blob = card?.blob ?? null;
  const share = (): void => {
    const signal = stop.current?.signal;
    if (canShare(view)) void runShare({ meta: replayMeta(words), card: blob, video }, send, signal ? { signal } : {});
  };
  const busy = view.kind === "uploading";
  const waiting = view.kind === "preparing";

  return (
    <section className="share-panel" aria-label="Your hero card">
      {card ? (
        <img className="share-card" src={card.url} alt={`The hero card of ${words.godName}`} />
      ) : (
        <div className="share-card share-empty">Painting your card...</div>
      )}
      <div className="share-side">
        {view.kind === "shared" ? (
          <>
            {qr && <img className="share-qr" src={qr.src} alt="QR code that opens the replay page" />}
            <a className="share-link" href={view.links.pageUrl} target="_blank" rel="noreferrer">{view.links.pageUrl}</a>
          </>
        ) : (
          // Once the card is finished: with no card and no video that the server would take, there is nothing to share.
          (waiting || sendsCard(blob) || sendsVideo(video)) && (
            <Button className="share-action" onClick={share} disabled={busy || waiting}>{busy ? "Sharing..." : "Share"}</Button>
          )
        )}
        {busy && <div className={`share-progress share-stage-${view.stage}`} role="progressbar" aria-label="Uploading"><span /></div>}
        <p className="share-small" role="status">{statusLine(view, blob, video, { qr: qr !== null, portrait: portrait !== null })}</p>
        {card && <Button className="share-action" onClick={() => { saveCard(card.url, cardFileName(words.godName)); }}>Save card</Button>}
        {onClose && <Button className="share-quiet" onClick={onClose}>Close</Button>}
      </div>
    </section>
  );
}
