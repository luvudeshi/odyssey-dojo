// The result-screen share panel: the player's god card, a link that saves it, and a button that shares the fight by QR.
// Nothing is sent until Share is pressed. With no server, the card and Save still work.
import { useEffect, useMemo, useReducer, useState } from "react";
import type { GodReveal } from "../../ai/revealGod";
import { godCardBlob } from "../godCard";
import { IDLE, canShare, cardFileName, cardWords, replayMeta, runShare, sendsCard, sendsVideo, shareStep, statusLine } from "./shareFlow";
import type { ShareFight } from "./shareFlow";
import "./sharePanel.css";

export interface SharePanelProps extends ShareFight {
  /** The god from the scan. Null (scan skipped) gives the card of Odysseus himself. */
  readonly god: GodReveal | null;
  /** The recorded fight, when there is one. It is uploaded only if Share is pressed. */
  readonly video?: Blob | null;
  readonly onClose?: () => void;
}

interface Card {
  readonly blob: Blob;
  readonly url: string;
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

export function SharePanel(props: SharePanelProps) {
  const { god, won, enemyName, fightTitle, score, style, video = null, onClose } = props;
  const [state, send] = useReducer(shareStep, IDLE);
  const [portrait, setPortrait] = useState<HTMLImageElement | null>(null);
  const [qr, setQr] = useState<HTMLImageElement | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const qrUrl = state.kind === "shared" ? state.links.qrUrl : null;
  // A code the canvas cannot draw (an SVG with no size, in some browsers) is left off the card, and so is "Scan".
  const qrOnCard = qr !== null && qr.naturalWidth > 0;
  const words = useMemo(
    () => cardWords({ god, won, enemyName, fightTitle, score, style }, qrOnCard),
    [god, won, enemyName, fightTitle, score, style, qrOnCard],
  );

  // The portrait can arrive after the god does. Until then the card shows its placeholder emblem.
  useEffect(() => {
    let alive = true;
    const url = god?.portrait ?? Promise.resolve(null);
    void url.then(loadImage, () => null).then((image) => { if (alive) setPortrait(image); });
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
      // A card that cannot be painted (no canvas) leaves whatever was there before.
      if (alive && blob !== null) setCard({ blob, url: URL.createObjectURL(blob) });
    });
    return () => { alive = false; };
  }, [words, portrait, qr]);

  useEffect(() => {
    const url = card?.url;
    return () => { if (url !== undefined) URL.revokeObjectURL(url); };
  }, [card]);

  const blob = card?.blob ?? null;
  const share = (): void => {
    if (canShare(state)) void runShare({ meta: replayMeta(words), card: blob, video }, send);
  };
  const busy = state.kind === "uploading";

  return (
    <section className="share" aria-label="Your god card">
      {card ? (
        <img className="share-card" src={card.url} alt={`The god card of ${words.godName}`} />
      ) : (
        <div className="share-card share-empty">Painting your card...</div>
      )}
      <div className="share-side">
        {state.kind === "shared" ? (
          <>
            {qr && <img className="share-qr" src={qr.src} alt="QR code that opens the replay page" />}
            <a className="share-link" href={state.links.pageUrl} target="_blank" rel="noreferrer">{state.links.pageUrl}</a>
          </>
        ) : (
          // With no card and no video that the server would take, there is nothing to share.
          (sendsCard(blob) || sendsVideo(video)) && <button onClick={share} disabled={busy}>{busy ? "Sharing..." : "Share"}</button>
        )}
        {busy && <div className={`share-progress share-${state.stage}`} role="progressbar" aria-label="Uploading"><span /></div>}
        <p className="share-small" role="status">{statusLine(state, blob, video)}</p>
        {card && <a className="share-save" href={card.url} download={cardFileName(words.godName)}>Save card</a>}
        {onClose && <button className="share-quiet" onClick={onClose}>Close</button>}
      </div>
    </section>
  );
}
