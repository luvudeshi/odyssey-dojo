// The hands-free guided session: lead-in, then every planned take with name, hint, a stand-still count, the recording
// and a verdict, and one session file at the end. The page feeds it every camera frame through frame().
import type { MoveDef, PoseFrame } from "../../src/core/types";
import { baselineOf } from "../../src/pose/signals";
import { download, need } from "./dom";
import { problems } from "./replay";
import {
  ANNOUNCE_S, LEAD_S, MAX_ATTEMPTS, MIN_FRAMES, MIN_STILL_FRAMES, RECORD_S, STILL_S, VERDICT_S,
  packSession, planTakes, sessionFileName,
} from "./session";
import type { PlannedTake, SessionParams } from "./session";
import { IDLE, loadTrace, storeTrace } from "./trace";
import type { StoredTrace } from "./trace";

type Phase = "off" | "lead" | "announce" | "still" | "record" | "verdict";

const IDLE_HINT = "Stand, shift your weight, scratch your nose. Make no move.";
const NOT_SEEN = "I could not see you: step back so head and hips show";

export interface Guided {
  readonly frame: (frame: PoseFrame | null, now: number) => void;
  /** True while the red skeleton should show. */
  readonly recording: () => boolean;
  readonly active: () => boolean;
}

export function createGuided(params: SessionParams, moves: ReadonlyMap<string, MoveDef>, who: () => string): Guided {
  const plan: readonly PlannedTake[] = planTakes(params.moves, params.takes);
  const start = need(document.querySelector<HTMLButtonElement>("#guided"), "guided button");
  const stop = need(document.querySelector<HTMLButtonElement>("#guided-stop"), "stop button");
  const again = need(document.querySelector<HTMLButtonElement>("#guided-again"), "download again button");
  const title = need(document.getElementById("guide-title"), "guide title");
  const hint = need(document.getElementById("guide-hint"), "guide hint");
  const progress = need(document.getElementById("guide-progress"), "guide progress");
  const verdictLine = need(document.getElementById("guide-verdict"), "verdict line");
  const count = need(document.getElementById("count"), "countdown");
  const table = need(document.querySelector<HTMLTableElement>("#summary"), "summary table");

  let phase: Phase = "off";
  let phaseStart = 0;
  let index = 0;
  let attempt = 1;
  let still: PoseFrame[] = [];
  let frames: PoseFrame[] = [];
  let fileName = "";
  const traces: StoredTrace[] = [];
  const cells = new Map<string, string>();

  const cellKey = (take: PlannedTake): string => `${take.move}:${String(take.take)}`;

  /** Built with the DOM, not strings, so a problem text can never be read as markup. */
  function renderTable(): void {
    table.replaceChildren();
    const header = table.insertRow();
    header.append(document.createElement("th"));
    for (let i = 1; i <= params.takes; i += 1) {
      const th = document.createElement("th");
      th.textContent = `take ${String(i)}`;
      header.append(th);
    }
    for (const move of params.moves) {
      const row = table.insertRow();
      const name = document.createElement("th");
      name.textContent = move;
      row.append(name);
      for (let i = 1; i <= params.takes; i += 1) {
        const text = cells.get(`${move}:${String(i)}`) ?? "";
        const cell = row.insertCell();
        cell.textContent = text;
        cell.className = text === "reads" ? "good" : "bad";
      }
    }
  }

  function say(text: string): void {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }

  function show(line: string, good: boolean): void {
    verdictLine.textContent = line;
    verdictLine.className = good ? "good" : "bad";
  }

  function enter(next: Phase, now: number): void {
    phase = next;
    phaseStart = now;
  }

  function announce(now: number): void {
    const take = plan[index];
    if (!take) return;
    const name = take.move === IDLE ? "Idle" : (moves.get(take.move)?.name ?? take.move);
    const text = take.move === IDLE ? IDLE_HINT : (moves.get(take.move)?.hint ?? "");
    title.textContent = name;
    hint.textContent = text;
    progress.textContent = `take ${String(index + 1)} of ${String(plan.length)}${attempt > 1 ? ` (try ${String(attempt)})` : ""}`;
    show("", true);
    say(`${name}. ${text}`);
    still = [];
    frames = [];
    enter("announce", now);
  }

  function finish(): void {
    phase = "off";
    count.textContent = "";
    title.textContent = "Session done";
    hint.textContent = "The file was downloaded. Use Download again if it did not arrive.";
    progress.textContent = `${String(traces.length)} takes saved`;
    show("", true);
    start.disabled = false;
    stop.disabled = true;
    again.hidden = traces.length === 0;
    renderTable();
    if (traces.length > 0) download(fileName, packSession(traces));
  }

  function judge(take: PlannedTake): void {
    if (frames.length < MIN_FRAMES || still.length < MIN_STILL_FRAMES) {
      show(NOT_SEEN, false);
      if (attempt >= MAX_ATTEMPTS) cells.set(cellKey(take), "skipped");
      return;
    }
    const stored = storeTrace({ move: take.move, person: who(), n: take.take, baseline: baselineOf(still), frames });
    const wrong = problems(loadTrace(stored), moves);
    traces.push(stored);
    cells.set(cellKey(take), wrong.length === 0 ? "reads" : wrong.join("; "));
    show(wrong.length === 0 ? "Reads correctly" : wrong.join("; "), wrong.length === 0);
  }

  function step(frame: PoseFrame | null, now: number): void {
    const take = plan[index];
    const spent = (now - phaseStart) / 1000;
    if (phase === "lead") {
      count.textContent = String(Math.max(1, Math.ceil(LEAD_S - spent)));
      if (spent >= LEAD_S) announce(now);
    } else if (phase === "announce") {
      count.textContent = "";
      if (spent >= ANNOUNCE_S) {
        hint.textContent = "Arms down, stand still";
        enter("still", now);
      }
    } else if (phase === "still") {
      const left = STILL_S - spent;
      count.textContent = String(Math.max(1, Math.ceil(left)));
      // The last second is the neutral stance, as in the one-take mode.
      if (frame && left <= 1) still.push(frame);
      if (spent >= STILL_S) enter("record", now);
    } else if (phase === "record" && take) {
      count.textContent = "GO";
      hint.textContent = take.move === IDLE ? IDLE_HINT : (moves.get(take.move)?.hint ?? "");
      if (frame) frames.push(frame);
      if (spent >= RECORD_S) {
        count.textContent = "";
        judge(take);
        enter("verdict", now);
      }
    } else if (phase === "verdict" && take && spent >= VERDICT_S) {
      renderTable();
      if (cells.has(cellKey(take))) {
        index += 1;
        attempt = 1;
      } else attempt += 1;
      if (index >= plan.length) finish();
      else announce(now);
    }
  }

  start.addEventListener("click", () => {
    index = 0;
    attempt = 1;
    traces.length = 0;
    cells.clear();
    fileName = sessionFileName(who(), new Date());
    again.hidden = true;
    start.disabled = true;
    stop.disabled = false;
    title.textContent = "Step back";
    hint.textContent = "Step back until your head and hips are in the picture";
    progress.textContent = `${String(plan.length)} takes`;
    show("", true);
    say(hint.textContent);
    renderTable();
    enter("lead", performance.now());
  });
  stop.addEventListener("click", () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    finish();
  });
  again.addEventListener("click", () => {
    download(fileName, packSession(traces));
  });
  return { frame: step, recording: () => phase === "record", active: () => phase !== "off" };
}
