// Key check: proves no API key ends up in the files a browser downloads. Builds the game, then reads every
// file in dist as bytes and looks for three things:
//   1. the value of each secret variable in the local .env (and in the files Vite reads next to it),
//   2. strings shaped like a key: a Google key (AIza + 35 characters), an ElevenLabs key (sk_ + 32 or more),
//   3. the names of the server's key variables (GEMINI_API_KEY, ELEVENLABS_API_KEY, and any in .env.example).
//
//   node scripts/check-dist.mjs [--no-build] [--dist=<folder>] [--env=<file>]
//
//   --no-build      scan the dist that is already there
//   --dist=<folder> scan this folder as it is (nothing is built)
//   --env=<file>    the .env to take values from (default: .env at the repo root, when there is one)
//
// Exit codes: 0 nothing found. 1 a leak: the file and the variable NAME are printed, never the value, any part
// of it, or its length. 2 the check could not do its job (no dist, an empty dist, no file at --env, a failed build).
// Which variables count as secrets, which forms of a value are looked for, and what is not covered: docs/check-dist.md
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { brotliDecompressSync, gunzipSync } from "node:zlib";

/**
 * @typedef {{ name: string, value: string, source: string }} Variable
 * @typedef {{ form: string, bytes: Buffer }} Needle
 * @typedef {{ name: string, value: string, source: string, needles: Needle[] }} Secret
 * @typedef {{ name: string, source: string, why: string }} Skipped
 * @typedef {{ kind: "value" | "shape" | "name", name: string, source: string, form: string, at: number, count: number }} Hit
 * @typedef {{ label: string, pattern: RegExp }} KeyShape
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** A shorter value cannot be told from ordinary text in a bundle, so it is not looked for. */
export const MIN_VALUE_LENGTH = 8;
/** The variables server/env.ts reads its keys from. Names in .env.example that look like secrets are added to these. */
export const SERVER_KEY_NAMES = ["GEMINI_API_KEY", "ELEVENLABS_API_KEY"];
/** Where a variable taken from the environment of this run (not from a file) is said to come from. */
export const SHELL = "the shell";
/** The other files `vite build` reads from the folder of a file named .env. */
const VITE_SIBLINGS = [".env.local", ".env.production", ".env.production.local"];
const SECRET_WORDS = new Set(["KEY", "KEYS", "APIKEY", "TOKEN", "TOKENS", "SECRET", "SECRETS", "PASSWORD", "PASSWD", "PASS", "CREDENTIAL", "CREDENTIALS"]);
/** At most this many places are counted per thing found in one file. */
const COUNT_CAP = 99;

/**
 * Key shapes. Each must stand alone (not in the middle of a longer run of the same characters), so a long
 * base64 blob that happens to hold the first letters is not a hit.
 * @type {KeyShape[]}
 */
export const KEY_SHAPES = [
  { label: "a Google API key", pattern: /(?<![\w-])AIza[\w-]{35}(?![\w-])/g },
  { label: "an ElevenLabs API key", pattern: /(?<![A-Za-z0-9])sk_[A-Za-z0-9]{32,}/g },
];

/**
 * The text of a .env file, read the way server/lib/envFile.ts reads it: UTF-8 with or without a byte order
 * mark, or little-endian UTF-16 with one.
 * @param {Buffer} bytes
 * @returns {string}
 */
export function decodeEnvFile(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString("utf16le");
  const text = bytes.toString("utf8");
  return text.startsWith("﻿") ? text.slice(1) : text;
}

/**
 * The variables in a .env text, parsed as Node parses it, with each value trimmed as server/env.ts trims it.
 * @param {string} text
 * @param {string} source what to call the file in a report, e.g. ".env"
 * @returns {Variable[]}
 */
export function readVariables(text, source) {
  /** @type {Variable[]} */
  const variables = [];
  for (const [name, value] of Object.entries(parseEnv(text))) {
    if (value === undefined || name.includes("\0")) continue;
    variables.push({ name, value: value.replaceAll("\0", "").trim(), source });
  }
  return variables;
}

/**
 * True when the name says the variable holds a secret: one of its words (split at anything that is not a
 * letter or a digit) is KEY, TOKEN, SECRET, PASSWORD or the like, or the name ends in one of those four.
 * @param {string} name
 * @returns {boolean}
 */
export function isSecretName(name) {
  const upper = name.toUpperCase();
  if (upper.split(/[^A-Z0-9]+/).some((word) => SECRET_WORDS.has(word))) return true;
  return /(KEY|TOKEN|SECRET|PASSWORD)S?$/.test(upper);
}

/**
 * True when the value looks like a key whatever its variable is called: it has one of the KEY_SHAPES, or it
 * is one unbroken run of 20 or more letters, digits and _ - + / = with at least one letter and one digit, and
 * is not a path. A URL, a port number or a plain word is none of these.
 * @param {string} value
 * @returns {boolean}
 */
export function looksLikeKey(value) {
  if (KEY_SHAPES.some((shape) => new RegExp(shape.pattern.source).test(value))) return true;
  if (!/^[A-Za-z0-9_\-+/=]{20,}$/.test(value) || value.startsWith("/")) return false;
  return /[A-Za-z]/.test(value) && /[0-9]/.test(value);
}

/**
 * The variables of the environment this run was started in that are worth looking for: only those that are
 * secrets by name AND hold a key-shaped value, so an ordinary word in somebody's shell never fails a build.
 * @param {Record<string, string | undefined>} env
 * @returns {Variable[]}
 */
export function shellVariables(env) {
  /** @type {Variable[]} */
  const variables = [];
  for (const [name, raw] of Object.entries(env)) {
    const value = raw?.trim() ?? "";
    if (isSecretName(name) && looksLikeKey(value)) variables.push({ name, value, source: SHELL });
  }
  return variables;
}

/**
 * base64 of the bytes as they read inside a longer base64 text. What comes before a value shifts it by 0, 1
 * or 2 bytes, and each shift gives different characters, so there are three. The first and last characters
 * that also carry bits of the neighbouring bytes are left off.
 * @param {Buffer} bytes
 * @returns {string[]}
 */
export function base64Needles(bytes) {
  const needles = [];
  for (let lead = 0; lead < 3; lead += 1) {
    const padded = Buffer.concat([Buffer.alloc(lead), bytes]);
    const text = padded.toString("base64").replace(/=+$/, "");
    const start = lead === 0 ? 0 : lead + 1;
    const end = padded.length % 3 === 0 ? text.length : text.length - 1;
    needles.push(text.slice(start, end));
  }
  return needles;
}

/**
 * Every form of a value that is looked for, as bytes. See docs/check-dist.md for the list and for what is not on it.
 * @param {string} value
 * @returns {Needle[]}
 */
export function valueForms(value) {
  const plain = Buffer.from(value, "utf8");
  /** @type {[string, string | Buffer][]} */
  const forms = [["as written", plain]];
  forms.push(["JSON-escaped", JSON.stringify(value).slice(1, -1)]);
  try {
    forms.push(["URL-encoded", encodeURIComponent(value)]);
  } catch {
    // A lone surrogate cannot be URL-encoded. The other forms still cover the value.
  }
  forms.push(["URL-encoded", new URLSearchParams({ v: value }).toString().slice(2)]);
  for (const text of base64Needles(plain)) {
    forms.push(["in base64", text]);
    forms.push(["in URL-safe base64", text.replaceAll("+", "-").replaceAll("/", "_")]);
  }
  const hex = plain.toString("hex");
  forms.push(["in hex", hex], ["in hex", hex.toUpperCase()]);
  forms.push(["in UTF-16", Buffer.from(value, "utf16le")]);

  /** @type {Needle[]} */
  const needles = [];
  const seen = new Set();
  for (const [form, content] of forms) {
    const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : content;
    const id = bytes.toString("hex");
    if (bytes.length < MIN_VALUE_LENGTH || seen.has(id)) continue;
    seen.add(id);
    needles.push({ form, bytes });
  }
  return needles;
}

/**
 * Sorts variables into the secrets to look for and the ones left alone, with the reason. The rule:
 * a variable from a file is looked for when its name says secret (isSecretName) or its value looks like a key
 * (looksLikeKey), and its value has at least MIN_VALUE_LENGTH characters. A variable from the shell is only
 * ever passed in when both are true.
 * @param {Variable[]} variables
 * @returns {{ secrets: Secret[], skipped: Skipped[] }}
 */
export function pickSecrets(variables) {
  /** @type {Secret[]} */
  const secrets = [];
  /** @type {Skipped[]} */
  const skipped = [];
  for (const { name, value, source } of variables) {
    if (value === "") skipped.push({ name, source, why: "it is empty" });
    else if (!isSecretName(name) && !looksLikeKey(value)) skipped.push({ name, source, why: "not a secret by its name or by the look of its value" });
    else if (value.length < MIN_VALUE_LENGTH) skipped.push({ name, source, why: `shorter than ${String(MIN_VALUE_LENGTH)} characters, too short to tell from ordinary text` });
    else if (!secrets.some((secret) => secret.name === name && secret.value === value)) secrets.push({ name, value, source, needles: valueForms(value) });
  }
  return { secrets, skipped };
}

/**
 * The variable names whose presence in dist is itself a finding: SERVER_KEY_NAMES plus every name in
 * .env.example (commented out or not) that says secret.
 * @param {string} exampleText the text of .env.example, or "" when there is none
 * @returns {string[]}
 */
export function serverKeyNames(exampleText) {
  const names = new Set(SERVER_KEY_NAMES);
  for (const line of exampleText.split(/\r?\n/)) {
    const name = /^\s*#?\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1];
    if (name !== undefined && isSecretName(name)) names.add(name);
  }
  return [...names];
}

/**
 * @param {Buffer} bytes
 * @param {Buffer} needle
 * @returns {{ at: number, count: number }} where the first one is (-1 for none) and how many, up to COUNT_CAP
 */
function findAll(bytes, needle) {
  const at = bytes.indexOf(needle);
  let count = 0;
  for (let next = at; next !== -1 && count < COUNT_CAP; next = bytes.indexOf(needle, next + 1)) count += 1;
  return { at, count };
}

/**
 * Everything found in one file's bytes. A hit never holds the value, only the variable's name, the form it
 * was found in, and where.
 * @param {Buffer} bytes
 * @param {Secret[]} secrets
 * @param {string[]} names
 * @returns {Hit[]}
 */
export function scanBytes(bytes, secrets, names) {
  /** @type {Hit[]} */
  const hits = [];
  for (const secret of secrets) {
    for (const needle of secret.needles) {
      const { at, count } = findAll(bytes, needle.bytes);
      if (at !== -1) hits.push({ kind: "value", name: secret.name, source: secret.source, form: needle.form, at, count });
    }
  }
  // latin1 keeps one character per byte, so a place in the text is a place in the file, binary or not.
  const text = bytes.toString("latin1");
  for (const shape of KEY_SHAPES) {
    const found = [...text.matchAll(shape.pattern)];
    const first = found[0];
    if (first !== undefined) hits.push({ kind: "shape", name: shape.label, source: "", form: "", at: first.index, count: Math.min(found.length, COUNT_CAP) });
  }
  for (const name of names) {
    const { at, count } = findAll(bytes, Buffer.from(name, "latin1"));
    if (at !== -1) hits.push({ kind: "name", name, source: "", form: "", at, count });
  }
  return hits;
}

/**
 * The bytes to scan for one file: the file itself and, for a .gz or .br file, what it unpacks to.
 * @param {string} path
 * @param {Buffer} bytes
 * @returns {{ label: string, bytes: Buffer }[]}
 */
export function layers(path, bytes) {
  const all = [{ label: path, bytes }];
  try {
    if (path.endsWith(".gz")) all.push({ label: `${path} (unpacked)`, bytes: gunzipSync(bytes) });
    if (path.endsWith(".br")) all.push({ label: `${path} (unpacked)`, bytes: brotliDecompressSync(bytes) });
  } catch {
    // Not really a compressed file. Its own bytes are still scanned.
  }
  return all;
}

/**
 * Every file under a folder, as paths relative to it with forward slashes, sorted. A link to a file is read
 * as that file; a link to a folder is not followed.
 * @param {string} folder
 * @param {string} [inside]
 * @returns {string[]}
 */
export function walk(folder, inside = "") {
  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(join(folder, inside), { withFileTypes: true })) {
    const path = inside === "" ? entry.name : `${inside}/${entry.name}`;
    if (entry.isDirectory()) files.push(...walk(folder, path));
    else if (entry.isFile() || (entry.isSymbolicLink() && statSync(join(folder, path), { throwIfNoEntry: false })?.isFile() === true)) files.push(path);
  }
  return files.sort();
}

/**
 * @param {string} dist
 * @param {Secret[]} secrets
 * @param {string[]} names
 * @returns {{ files: number, bytes: number, found: { file: string, hit: Hit }[] }}
 */
export function scanFolder(dist, secrets, names) {
  const files = walk(dist);
  let total = 0;
  /** @type {{ file: string, hit: Hit }[]} */
  const found = [];
  for (const file of files) {
    const bytes = readFileSync(join(dist, file));
    total += bytes.length;
    for (const layer of layers(file, bytes)) {
      for (const hit of scanBytes(layer.bytes, secrets, names)) found.push({ file: layer.label, hit });
    }
  }
  return { files: files.length, bytes: total, found };
}

/**
 * One line of the report for one thing found. Names the file, the variable and the place, never the value.
 * @param {string} file
 * @param {Hit} hit
 * @returns {string}
 */
export function hitLine(file, hit) {
  const what =
    hit.kind === "value" ? `the value of ${hit.name} (from ${hit.source}), ${hit.form}` : hit.kind === "shape" ? `a string shaped like ${hit.name}` : `the variable name ${hit.name}`;
  const more = hit.count > 1 ? `, and ${hit.count >= COUNT_CAP ? "many" : String(hit.count - 1)} more in this file` : "";
  return `LEAK ${file}: ${what}, at byte ${String(hit.at)}${more}`;
}

/**
 * The text with every secret's value taken out, as written and JSON-escaped. Everything this script prints
 * goes through it, so a value cannot reach the terminal by way of an error message either.
 * @param {string} text
 * @param {Secret[]} secrets
 * @returns {string}
 */
export function redact(text, secrets) {
  let safe = text;
  for (const { value } of secrets) {
    safe = safe.replaceAll(value, "[hidden]").replaceAll(JSON.stringify(value).slice(1, -1), "[hidden]");
  }
  return safe;
}

/**
 * The env files to read: the one named and, when it is called .env, the others Vite reads from its folder.
 * @param {string} file
 * @returns {string[]}
 */
function envFiles(file) {
  if (basename(file) !== ".env") return [file];
  return [file, ...VITE_SIBLINGS.map((name) => join(dirname(file), name)).filter((path) => existsSync(path))];
}

/**
 * @param {number} count
 * @param {string} word
 * @returns {string}
 */
function plural(count, word) {
  return `${String(count)} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * @param {string[]} args
 * @param {Record<string, string | undefined>} env
 * @returns {Promise<number>} the exit code
 */
async function main(args, env) {
  /** @type {Secret[]} */
  let secrets = [];
  /** @param {string} line */
  const say = (line) => process.stdout.write(`${redact(`check-dist: ${line}`, secrets)}\n`);
  /** @param {string} name */
  const option = (name) => {
    const found = args.find((arg) => arg.startsWith(`--${name}=`));
    return found === undefined ? null : found.slice(name.length + 3);
  };
  const unknown = args.filter((arg) => arg !== "--no-build" && !arg.startsWith("--dist=") && !arg.startsWith("--env="));
  if (unknown.length > 0) {
    say(`unknown option ${unknown.join(" ")}. Usage: node scripts/check-dist.mjs [--no-build] [--dist=<folder>] [--env=<file>]`);
    return 2;
  }

  const distOption = option("dist");
  const envOption = option("env");
  const dist = resolve(distOption ?? join(ROOT, "dist"));
  const envFile = resolve(envOption ?? join(ROOT, ".env"));
  if (!existsSync(envFile) && envOption !== null) {
    say(`no file at ${envFile}`);
    return 2;
  }

  const variables = existsSync(envFile) ? envFiles(envFile).flatMap((file) => readVariables(decodeEnvFile(readFileSync(file)), basename(file))) : [];
  const picked = pickSecrets([...variables, ...shellVariables(env)]);
  secrets = picked.secrets;
  const example = join(ROOT, ".env.example");
  const names = serverKeyNames(existsSync(example) ? readFileSync(example, "utf8") : "");

  try {
    if (distOption === null && !args.includes("--no-build")) {
      const { build } = await import("vite");
      // Build with the env files next to the one being checked, as a build in that folder would read them.
      await build({ root: ROOT, logLevel: "warn", ...(basename(envFile) === ".env" && existsSync(envFile) ? { envDir: dirname(envFile) } : {}) });
    }
    if (!existsSync(dist)) {
      say(`no folder at ${dist}. Build first, or drop --no-build.`);
      return 2;
    }
    const result = scanFolder(dist, secrets, names);
    if (result.files === 0) {
      say(`${dist} is empty, so there is nothing to prove.`);
      return 2;
    }

    say(`${plural(result.files, "file")}, ${(result.bytes / 1e6).toFixed(1)} MB, in ${dist}`);
    const fromFiles = secrets.filter((secret) => secret.source !== SHELL);
    const fromShell = secrets.length - fromFiles.length;
    if (!existsSync(envFile)) say(`no .env at ${envFile}, so no values from a file are looked for. Pass --env=<file> to check them.`);
    if (secrets.length > 0) {
      const listed = fromFiles.map((secret) => `${secret.name} (${secret.source})`);
      if (fromShell > 0) listed.push(`${plural(fromShell, "key")} from the shell`);
      say(`values looked for: ${listed.join(", ")}`);
    }
    for (const skip of picked.skipped) say(`value not looked for: ${skip.name} (${skip.source}): ${skip.why}`);
    say(`also looked for strings shaped like ${KEY_SHAPES.map((shape) => shape.label).join(" or ")}, and for the names ${names.join(", ")}`);

    if (result.found.length === 0) {
      say("clean. Nothing found in the built game.");
      return 0;
    }
    for (const { file, hit } of result.found) process.stdout.write(`${redact(hitLine(file, hit), secrets)}\n`);
    const leaking = new Set(result.found.map(({ file }) => file)).size;
    say(`${plural(result.found.length, "finding")} in ${plural(leaking, "file")}. Values are never printed here: do not paste one anywhere either.`);
    say("If a real key is in a built file, treat it as public: make a new key and retire the old one. See docs/check-dist.md.");
    return 1;
  } catch (error) {
    say(`could not finish: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

/**
 * True when this file is the script node was started with. Real paths are compared, so a symlinked path still counts.
 * @returns {boolean}
 */
function startedDirectly() {
  const started = process.argv[1];
  if (started === undefined) return false;
  try {
    return realpathSync(started) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (startedDirectly()) {
  process.exitCode = await main(process.argv.slice(2), process.env);
}
