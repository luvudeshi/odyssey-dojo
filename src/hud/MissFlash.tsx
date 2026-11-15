// The MISS word: the same flash as GOOD / GREAT / PERFECT (it wears the same class for size and place), in a cold red.
// In a story fight the same element also says what to fix after an attempt that needs work: MISS for a strike prompt
// that went by, GOOD or NEEDS IMPROVEMENT for a weak strike or a failed defend, with one short line under the word.
// When and what is src/coach/extra/fightFlash.ts; its look is fightFlash.css beside that. Nothing is spoken.
import { useEffect, useReducer } from "react";
import { NO_FLASH, WORD_KEYS, flashMs, flashStep, spokenLine } from "../coach/extra/fightFlash";
import type { FlashFeedback } from "../coach/extra/fightFlash";
import { RiftPlate } from "./sky/rift/RiftPlate";
import "./missFlash.css";
import "../coach/extra/fightFlash.css";

const listeners = new Set<(feedback: FlashFeedback | null) => void>();

export function noteMiss(): void {
  listeners.forEach((listen) => { listen(null); });
}

/** Flash a word with a line on what to do. It takes the place of whatever the flash is showing. */
export function noteFeedback(feedback: FlashFeedback): void {
  listeners.forEach((listen) => { listen(feedback); });
}

/** The flash's words. On its own so it can be drawn without a fight. */
export function FeedbackWords({ feedback }: { feedback: FlashFeedback }) {
  const key = WORD_KEYS[feedback.word];
  return (
    <div className={`hb-rating hb-feedback${key === "miss" ? " hb-miss" : ""}`} data-feedback={key} role="status" aria-live="polite" aria-label={spokenLine(feedback)}>
      <RiftPlate tone={key === "good" ? "glass" : "ice"} />
      <strong className="hb-feedback__top" aria-hidden="true">{feedback.word}</strong>
      {feedback.tip && <span className="hb-feedback__tip" aria-hidden="true">{feedback.tip}</span>}
    </div>
  );
}

export function MissFlash() {
  const [{ showing }, send] = useReducer(flashStep, NO_FLASH);
  useEffect(() => {
    const listen = (feedback: FlashFeedback | null): void => { send({ type: "show", feedback }); };
    listeners.add(listen);
    return () => { listeners.delete(listen); };
  }, []);
  useEffect(() => {
    if (!showing) return;
    const timer = window.setTimeout(() => { send({ type: "expire", id: showing.id }); }, flashMs(showing));
    return () => { window.clearTimeout(timer); };
  }, [showing]);
  if (!showing) return null;
  if (!showing.feedback) return <div className="hb-rating hb-miss" key={showing.id}><RiftPlate tone="glass" />MISS</div>;
  return <FeedbackWords key={showing.id} feedback={showing.feedback} />;
}
