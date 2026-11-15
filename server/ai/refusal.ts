// Which upstream failures are not worth a second go. Shared by the Gemini client (the next model) and the god scan (the second attempt).

function status(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  return typeof error.status === "number" ? error.status : undefined;
}

/** A bad request, a bad key or no permission fails the same way every time, so there is no point asking again. */
export function hopeless(error: unknown): boolean {
  const code = status(error);
  return code === 400 || code === 401 || code === 403;
}
