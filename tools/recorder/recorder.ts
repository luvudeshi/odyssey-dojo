// The recorder page: camera with the skeleton drawn on it, a move picker and a record button.
// It reads the game's own tracker and detectors and changes neither.
import type { PoseFrame } from "../../src/core/types";
import { MOVES } from "../../src/moves/registry";
import { baselineOf } from "../../src/pose/signals";
import { startTracker } from "../../src/pose/tracker";
import { problems } from "./replay";
import { IDLE, cleanName, loadTrace, storeTrace, traceFileName } from "./trace";
import type { Trace } from "./trace";

const COUNTDOWN_MS = 3000;
const RECORD_MS = 3000;
/** MediaPipe pose landmark pairs to join with a line. */
const BONES: readonly (readonly [number, number])[] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28], [0, 11], [0, 12],
];

function need<T>(found: T | null, what: string): T {
  if (found === null) throw new Error(`the page has no ${what}`);
  return found;
}

const video = need(document.querySelector<HTMLVideoElement>("#video"), "video");
const canvas = need(document.querySelector<HTMLCanvasElement>("#skeleton"), "canvas");
const count = need(document.getElementById("count"), "countdown");
const picker = need(document.querySelector<HTMLSelectElement>("#move"), "move picker");
const person = need(document.querySelector<HTMLInputElement>("#person"), "person box");
const button = need(document.querySelector<HTMLButtonElement>("#record"), "record button");
const status = need(document.getElementById("status"), "status line");
const log = need(document.getElementById("log"), "log");

for (const id of [IDLE, ...[...MOVES.keys()].sort()]) {
  const option = document.createElement("option");
  option.value = id;
  option.textContent = id === IDLE ? "idle (no move)" : `${id} (${MOVES.get(id)?.name ?? id})`;
  picker.append(option);
}

function draw(frame: PoseFrame | null, recording: boolean): void {
  const pen = canvas.getContext("2d");
  if (!pen) return;
  pen.clearRect(0, 0, canvas.width, canvas.height);
  if (!frame) return;
  pen.strokeStyle = recording ? "#ff5a3c" : "#ffd76a";
  pen.fillStyle = pen.strokeStyle;
  pen.lineWidth = 3;
  for (const [from, to] of BONES) {
    const a = frame.image[from];
    const b = frame.image[to];
    if (!a || !b || a.visibility < 0.3 || b.visibility < 0.3) continue;
    pen.beginPath();
    pen.moveTo(a.x * canvas.width, a.y * canvas.height);
    pen.lineTo(b.x * canvas.width, b.y * canvas.height);
    pen.stroke();
  }
  for (const point of frame.image) {
    if (point.visibility < 0.3) continue;
    pen.beginPath();
    pen.arc(point.x * canvas.width, point.y * canvas.height, 3, 0, Math.PI * 2);
    pen.fill();
  }
}

/** The next free number for this move and person, kept in this browser so takes do not overwrite each other. */
function nextNumber(move: string, who: string): number {
  const key = `recorder:${move}:${who}`;
  let last = 0;
  try {
    last = Number(localStorage.getItem(key) ?? "0");
    localStorage.setItem(key, String(last + 1));
  } catch {
    // Storage is blocked: number by the clock instead.
    return Math.floor(Date.now() / 1000);
  }
  return last + 1;
}

function download(name: string, text: string): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

function note(text: string, good: boolean): void {
  const line = document.createElement("li");
  line.className = good ? "good" : "bad";
  line.textContent = text;
  log.prepend(line);
}

type Take = { readonly startedAt: number; readonly still: PoseFrame[]; readonly frames: PoseFrame[] } | null;
let take: Take = null;

function finish(done: NonNullable<Take>): void {
  count.textContent = "";
  button.disabled = false;
  if (done.frames.length < 20) {
    status.textContent = "Too few frames: was your whole upper body in view? Nothing was saved.";
    return;
  }
  const move = picker.value;
  const who = cleanName(person.value);
  const trace: Trace = {
    move,
    person: who,
    n: nextNumber(move, who),
    baseline: done.still.length > 0 ? baselineOf(done.still) : null,
    frames: done.frames,
  };
  const stored = storeTrace(trace);
  const name = traceFileName(stored);
  download(name, JSON.stringify(stored));
  // Check the take on the spot, from the stored form, so the page says what the test will say.
  const wrong = problems(loadTrace(stored), MOVES);
  status.textContent = `Saved ${name} (${String(done.frames.length)} frames).`;
  note(wrong.length === 0 ? `${name}: reads correctly` : `${name}: ${wrong.join("; ")}`, wrong.length === 0);
}

button.addEventListener("click", () => {
  take = { startedAt: performance.now(), still: [], frames: [] };
  button.disabled = true;
  status.textContent = "Stand still…";
});

startTracker()
  .then((tracker) => {
    video.srcObject = tracker.video.srcObject;
    void video.play();
    button.disabled = false;
    status.textContent = "Ready.";
    const tick = (): void => {
      const frame = tracker.read();
      const now = performance.now();
      const current = take;
      if (current) {
        const elapsed = now - current.startedAt;
        if (elapsed < COUNTDOWN_MS) {
          count.textContent = String(Math.ceil((COUNTDOWN_MS - elapsed) / 1000));
          // The last second of the countdown is the neutral stance.
          if (frame && elapsed > COUNTDOWN_MS - 1000) current.still.push(frame);
        } else if (elapsed < COUNTDOWN_MS + RECORD_MS) {
          count.textContent = "";
          status.textContent = picker.value === IDLE ? "Recording: do anything but a move" : "Recording: make the move once";
          if (frame) current.frames.push(frame);
        } else {
          take = null;
          finish(current);
        }
      }
      if (frame) draw(frame, current !== null && now - current.startedAt >= COUNTDOWN_MS);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })
  .catch((error: unknown) => {
    status.textContent = `The camera did not start: ${error instanceof Error ? error.message : String(error)}`;
  });
