// The one logger. Use this, never console directly.
export function log(level: "info" | "warn" | "error", event: string, detail?: unknown): void {
  console[level](JSON.stringify({ level, event, detail: detail instanceof Error ? detail.message : detail }));
}
