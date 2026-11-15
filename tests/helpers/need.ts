/** Unwraps a value the test knows is there, failing loudly instead of with a non-null assertion. */
export function need<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}
