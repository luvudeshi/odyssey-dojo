// Reads the room's metadata for the sign that the FaceTime bridge is carrying sound and picture both ways.
// The call service's setup page names the sign "chert_bridge_ready" and says to greet only after it, not when the
// room is joined. The exact shape of the metadata has NOT been seen on a real call, so this accepts every plain way
// of saying it: the bare word, a JSON flag, or a JSON field whose value is the word.
export const BRIDGE_READY = "chert_bridge_ready";

const NAMING_KEYS: readonly string[] = ["state", "status", "event", "phase", "bridge"];

export function bridgeReady(metadata: string | null | undefined): boolean {
  if (metadata === null || metadata === undefined) return false;
  const text = metadata.trim();
  if (text === "") return false;
  if (text === BRIDGE_READY) return true;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Not JSON: a plain line such as "chert_bridge_ready=1" or "state: chert_bridge_ready".
    return text.includes(BRIDGE_READY) && !/chert_bridge_ready\s*[=:]\s*(false|0|no)\b/i.test(text);
  }
  if (parsed === BRIDGE_READY) return true;
  if (typeof parsed !== "object" || parsed === null) return false;
  const record = parsed as Record<string, unknown>;
  const flag = record[BRIDGE_READY];
  if (flag !== undefined) return flag === true || flag === 1 || flag === "true" || flag === "1";
  return NAMING_KEYS.some((key) => record[key] === BRIDGE_READY);
}
