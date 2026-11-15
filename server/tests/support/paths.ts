// Path helpers for the server tests. Each takes the separator or the path module, so a test can use Windows rules on any machine.
import { readdirSync } from "node:fs";
import { isAbsolute, relative, resolve, sep as machineSep } from "node:path";

/** The pieces of node:path used to ask whether one path is inside another. path.win32 and path.posix both fit. */
export interface PathRules {
  readonly isAbsolute: (path: string) => boolean;
  readonly relative: (from: string, to: string) => string;
  readonly resolve: (...parts: string[]) => string;
  readonly sep: string;
}

/** A path as readdir or relative() gives it, with forward slashes whatever the machine uses. */
export function toPosix(path: string, sep: string = machineSep): string {
  return sep === "/" ? path : path.split(sep).join("/");
}

/** Every file and folder under a folder, sorted, with forward slashes. On Windows readdir answers with backslashes. */
export function listFiles(dir: string, sep: string = machineSep): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" }).map((path) => toPosix(path, sep)).sort();
}

/** True when `target` is `root` or somewhere under it. */
export function isInside(
  root: string,
  target: string,
  path: PathRules = { isAbsolute, relative, resolve, sep: machineSep },
): boolean {
  const steps = path.relative(path.resolve(root), path.resolve(target));
  // On Windows a path on another drive comes back absolute.
  return steps !== ".." && !steps.startsWith(`..${path.sep}`) && !path.isAbsolute(steps);
}

const RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Why Windows cannot have a file or folder with this name, or null when it can. */
export function windowsNameProblem(name: string): string | null {
  if (name === "") return "empty";
  // The range at the end is the control characters, which Windows refuses too.
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(name)) return "has a character Windows does not allow";
  if (/[. ]$/.test(name)) return "ends with a dot or a space, which Windows drops";
  // CON, NUL and the rest are devices whatever extension follows: "nul.mp3" is still the null device.
  if (RESERVED.test(name.split(".")[0] ?? "")) return "is a device name on Windows";
  return null;
}
