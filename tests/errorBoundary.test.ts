// A failed asset must fall back, not blank the app.
import { expect, test, vi } from "vitest";
import { ErrorBoundary } from "../src/render/ErrorBoundary";

test("a render error flips the boundary to its fallback and logs it", () => {
  const boundary = new ErrorBoundary({ fallback: "plain", label: "arena", children: "rich" });
  expect(boundary.render()).toBe("rich");
  boundary.state = ErrorBoundary.getDerivedStateFromError();
  expect(boundary.render()).toBe("plain");
  const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  boundary.componentDidCatch(new Error("Could not load /textures/x.jpg"));
  expect(spy).toHaveBeenCalledWith(expect.stringContaining("render-failed:arena"));
  spy.mockRestore();
});
