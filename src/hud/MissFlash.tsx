// The MISS word: the same flash as GOOD / GREAT / PERFECT (it wears the same class for size and place), in a cold red.
// The same element also grades a move that counted (a strike that landed, a defend that held): the grade word, the
// bonus for it and one short tip on a second line. What it says and how long it stays is src/coach/extra/fightFlash.ts;
// its look is fightFlash.css beside that. It is only shown: nothing is spoken.
import { useEffect, useReducer } from "react";
import { GRADE_KEYS, NO_FLASH, flashMs, flashStep, spokenLine } from "../coach/extra/fightFlash";
import type { FlashFeedback } from "../coach/extra/fightFlash";
import { RiftPlate } from "./sky/rift/RiftPlate";
import "./missFlash.css";
import "../coach/extra/fightFlash.css";

const listeners = new Set<(feedback: FlashFeedback | null) => void>();

export function noteMiss(): void {
  listeners.forEach((listen) => { listen(null); });
}

/** Flash a grade for a move that has just counted. It takes the place of whatever the flash is showing. */
export function noteFeedback(feedback: FlashFeedback): void {
  listeners.forEach((listen) => { listen(feedback); });
}

/** The flash's words for a grade. On its own so it can be drawn without a fight. */
export function FeedbackWords({ feedback }: { feedback: FlashFeedback }) {
  const grade = GRADE_KEYS[feedback.grade];
  return (
    <div className="hb-rating hb-feedback" data-feedback={grade} role="status" aria-live="polite" aria-label={spokenLine(feedback)}>
      <RiftPlate tone={grade === "needs-improvement" ? "ice" : grade === "good" ? "glass" : "lava"} blades={grade === "excellent"} />
      <span className="hb-feedback__top" aria-hidden="true">
        <strong>{feedback.grade}</strong>
        <b>+{feedback.points}</b>
      </span>
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
