// What may be said about a failure in the log: never an API key, never a webcam snapshot.
// An upstream service can echo the request, or the key it was sent, in its error text.

// Any long run of base64 is cut out, so an error that echoes a request cannot put a snapshot in the log.
const BASE64_RUN = /[A-Za-z0-9+/=]{40,}/g;
const MAX_LENGTH = 300;

export type Redact = (error: unknown) => string;

/** Makes the one function a route uses to turn an error into a log line. `secrets` are the keys this server holds. */
export function createRedactor(secrets: readonly (string | null)[]): Redact {
  const known = secrets.filter((secret): secret is string => secret !== null && secret !== "");
  return (error) => {
    let text = error instanceof Error ? error.message : typeof error === "string" ? error : "unknown error";
    // Keys go first and the cut comes last, so a key can be neither half hidden nor cut in two.
    for (const secret of known) text = text.split(secret).join("[key]");
    return text.replace(BASE64_RUN, "[data]").slice(0, MAX_LENGTH);
  };
}
