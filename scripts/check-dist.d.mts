// Types for check-dist.mjs, so tests/checkDist.test.ts can import it under the root tsconfig (no allowJs there).

export interface Variable {
  name: string;
  value: string;
  /** The file it came from, e.g. ".env", or SHELL. */
  source: string;
}
export interface Needle {
  form: string;
  bytes: Buffer;
}
export interface Secret extends Variable {
  needles: Needle[];
}
export interface Skipped {
  name: string;
  source: string;
  why: string;
}
export interface Hit {
  kind: "value" | "shape" | "name";
  /** The variable's name, or for a shape what it is shaped like. Never a value. */
  name: string;
  source: string;
  form: string;
  /** The byte the first one starts at. */
  at: number;
  count: number;
}
export interface KeyShape {
  label: string;
  pattern: RegExp;
}

export const MIN_VALUE_LENGTH: number;
export const SERVER_KEY_NAMES: string[];
export const SHELL: string;
export const KEY_SHAPES: KeyShape[];
export function decodeEnvFile(bytes: Buffer): string;
export function readVariables(text: string, source: string): Variable[];
export function isSecretName(name: string): boolean;
export function looksLikeKey(value: string): boolean;
export function shellVariables(env: Record<string, string | undefined>): Variable[];
export function base64Needles(bytes: Buffer): string[];
export function valueForms(value: string): Needle[];
export function pickSecrets(variables: Variable[]): { secrets: Secret[]; skipped: Skipped[] };
export function serverKeyNames(exampleText: string): string[];
export function scanBytes(bytes: Buffer, secrets: Secret[], names: string[]): Hit[];
export function layers(path: string, bytes: Buffer): { label: string; bytes: Buffer }[];
export function walk(folder: string, inside?: string): string[];
export function scanFolder(dist: string, secrets: Secret[], names: string[]): { files: number; bytes: number; found: { file: string; hit: Hit }[] };
export function hitLine(file: string, hit: Hit): string;
export function redact(text: string, secrets: Secret[]): string;
