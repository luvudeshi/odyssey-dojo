// The pure parts of the guided session: the URL parameters, the take plan, the session file and the numbering the
// splitter uses. Shared by the recorder page, the splitter and tests/recorder/session.test.ts.
import { IDLE, cleanName, loadTrace } from "./trace";
import type { StoredTrace } from "./trace";

export const SESSION_VERSION = 1;
/** The moves of a Boxer fight against Polyphemus. */
export const DEFAULT_MOVES: readonly string[] = [IDLE, "block", "duck", "dodge_left", "dodge_right", "jab", "cross", "hook", "uppercut", "stake_thrust"];
export const DEFAULT_TAKES = 2;
export const MAX_TAKES = 5;
/** How many times one take may be tried before it is marked skipped (the first try plus two repeats). */
export const MAX_ATTEMPTS = 3;
export const MIN_FRAMES = 20;
export const MIN_STILL_FRAMES = 10;
/** Seconds for each part of a guided take, and for the walk back at the start. */
export const LEAD_S = 10;
export const ANNOUNCE_S = 3.5;
export const STILL_S = 4;
export const RECORD_S = 3;
export const VERDICT_S = 1.5;

export interface SessionParams {
  readonly person: string | null;
  readonly moves: readonly string[];
  readonly takes: number;
  /** Ids that were asked for and are not moves, so the page can say so. */
  readonly dropped: readonly string[];
}

/** Reads `person`, `moves` and `takes` from a query string. `known` holds the real move ids. */
export function parseParams(search: string, known: ReadonlySet<string>): SessionParams {
  const query = new URLSearchParams(search);
  const asked = query.get("moves");
  const ids = asked === null ? [...DEFAULT_MOVES] : asked.split(",").map((id) => id.trim()).filter((id) => id !== "").map(cleanName);
  const moves: string[] = [];
  const dropped: string[] = [];
  for (const id of ids) {
    if (id !== IDLE && !known.has(id)) dropped.push(id);
    else if (!moves.includes(id)) moves.push(id);
  }
  const wanted = Math.floor(Number(query.get("takes") ?? DEFAULT_TAKES));
  const takes = Number.isFinite(wanted) ? Math.min(MAX_TAKES, Math.max(1, wanted)) : DEFAULT_TAKES;
  const who = query.get("person");
  return { person: who === null ? null : cleanName(who), moves, takes, dropped };
}

export interface PlannedTake {
  readonly move: string;
  readonly take: number;
}

/** Every move in list order for take 1, then all again for take 2, and so on. */
export function planTakes(moves: readonly string[], takes: number): PlannedTake[] {
  return Array.from({ length: takes }, (_, i) => moves.map((move) => ({ move, take: i + 1 }))).flat();
}

/** Seconds a session takes when every take is read on the first try. */
export function sessionSeconds(count: number): number {
  return LEAD_S + count * (ANNOUNCE_S + STILL_S + RECORD_S + VERDICT_S);
}

export interface SessionFile {
  readonly version: number;
  readonly traces: readonly StoredTrace[];
}

export function packSession(traces: readonly StoredTrace[]): string {
  const file: SessionFile = { version: SESSION_VERSION, traces };
  return JSON.stringify(file);
}

/** Reads a session file. Every trace must pass loadTrace; throws with the reason and the trace's position otherwise. */
export function unpackSession(text: string): StoredTrace[] {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null) throw new Error("the session file is not an object");
  const file = parsed as Partial<SessionFile>;
  if (file.version !== SESSION_VERSION) throw new Error(`session version ${String(file.version)} is not ${String(SESSION_VERSION)}`);
  if (!Array.isArray(file.traces)) throw new Error("the session file has no traces list");
  const traces = file.traces as StoredTrace[];
  traces.forEach((stored, index) => {
    try {
      loadTrace(stored);
    } catch (error) {
      throw new Error(`trace ${String(index + 1)} is not usable: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  return traces;
}

/** `session-<person>-<yyyymmdd-hhmmss>.json`, in the clock of whoever runs the page. */
export function sessionFileName(person: string, when: Date): string {
  const two = (n: number): string => String(n).padStart(2, "0");
  const day = `${String(when.getFullYear())}${two(when.getMonth() + 1)}${two(when.getDate())}`;
  const time = `${two(when.getHours())}${two(when.getMinutes())}${two(when.getSeconds())}`;
  return `session-${cleanName(person)}-${day}-${time}.json`;
}

/** One above the highest existing `<move>-<person>-<n>.json` in `taken`, so nothing is overwritten. */
export function nextFreeNumber(taken: readonly string[], move: string, person: string): number {
  const prefix = `${cleanName(move)}-${cleanName(person)}-`;
  let highest = 0;
  for (const name of taken) {
    const match = name.startsWith(prefix) ? /^(\d+)\.json$/.exec(name.slice(prefix.length)) : null;
    if (match?.[1] !== undefined) highest = Math.max(highest, Number(match[1]));
  }
  return highest + 1;
}
