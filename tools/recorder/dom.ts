// Small page helpers shared by the recorder and its guided session.
export function need<T>(found: T | null, what: string): T {
  if (found === null) throw new Error(`the page has no ${what}`);
  return found;
}

export function download(name: string, text: string): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}
