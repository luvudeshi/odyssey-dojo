// What to tell the player when the camera or the pose model does not start, from the error the browser gave.
export function cameraErrorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "The browser did not get permission to use the camera. Click the camera icon at the left of the address bar, choose Allow, then try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found. Plug one in, then try again.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "The camera is in use by another app. Close that app, then try again.";
  }
  return "The camera or the body-tracking model did not start. Reload the page and try again.";
}

/** A presence reason as a line on screen: it starts with a capital. */
export function sentence(reason: string): string {
  return reason.charAt(0).toUpperCase() + reason.slice(1);
}
