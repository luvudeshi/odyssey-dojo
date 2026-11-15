// Lists every file under public/ with its credit line, licence and size. Run it with `make credits`.
// It exits 1 when a file has no credit, no licence, or a licence the rules do not allow for its class.
// Art and sound may be CC0, CC BY with the author, or made by the team.
// Bundled software and model files (the folders in SOFTWARE_ROOTS) carry their own open licence instead,
// and each of those files must be named by its exact path.
// How a credit line must be written is in docs/licences.md.

import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @typedef {{ path: string, size: number }} AssetFile
 * @typedef {{ file: string, text: string }} CreditSource
 * @typedef {"ok" | "missing" | "not-allowed" | "no-author" | "no-source"} LicenceStatus
 * @typedef {{ status: LicenceStatus, label: string }} Licence
 * @typedef {{ file: string, line: number, patterns: string[], licence: Licence, software: Licence }} CreditLine
 * @typedef {"exact" | "glob" | "folder"} MatchKind
 * @typedef {"art" | "software"} AssetClass
 * @typedef {"no credit" | "no licence on the credit line" | "licence not allowed" | "CC BY without an author" | "software licence without an author" | "software credit without a source link"} GapKind
 * @typedef {{ path: string, size: number, licence: string, where: string, gap: GapKind | null, asset: boolean, kind: AssetClass, note: string }} Row
 * @typedef {{ rows: Row[], files: number, bytes: number, assets: number, software: number, credited: number, gaps: number, absent: string[] }} Report
 */

/** Everything under here ships with the game, so every file in it needs a credit. */
export const ASSET_ROOTS = ["public"];

/**
 * Folders of bundled software and model files: code and machine-learning models that other people publish
 * under their own open licence. They are not art. A file is in this class only because of its folder,
 * so an art asset elsewhere cannot pass by writing "MIT" on its credit line. A file in one of these folders
 * is credited only by a line that names its exact path: a folder or `*` credit does not count here, so a
 * file nobody looked at cannot pick up the licence of its neighbours. Each entry ends with a slash.
 */
export const SOFTWARE_ROOTS = ["public/draco/", "public/mediapipe/"];

/** Folder and `*` credits count only here. A model log has to name the exact file. */
export const MAIN_CREDITS = "CREDITS.md";

// What may stand between the parts of a licence name: a space, a no-break space, a hyphen, or one of the
// Unicode hyphens and dashes (U+2010 to U+2015) that text copied from a web page often carries.
const SEP = "[ \\u00A0\\-\\u2010-\\u2015]";
const NOT_ALLOWED = [
  new RegExp(`\\bCC${SEP}?BY${SEP}(?:NC|ND|SA)(?:${SEP}(?:NC|ND|SA))*(?:${SEP}?\\d\\.\\d)?`, "i"),
  /\bnon-?commercial\b/i,
  /\broyalty[- ]free\b/i,
  /\ball rights reserved\b/i,
  /\beditorial use\b/i,
];
// "not CC0" and "non-CC0" say the opposite, so they are not read as CC0.
const CC0 = new RegExp(`(?<!\\bnot )(?<!\\bnon-)\\bCC${SEP}?0\\b`, "i");
const CC_BY = new RegExp(`\\bCC${SEP}?BY\\b(?:${SEP}?(\\d\\.\\d))?`, "i");
const TEAM = /\b(?:made|generated|recorded|built|drawn) by the team\b[^|.`;]*/i;
// A CC BY author is "by <Name>": the name starts with a capital letter, a digit or @, and is not "the ...".
// So "used by the Polyphemus fight" is not an author. A lower-case handle is not read either.
const AUTHOR = /\bby (?!the\b)([A-Z0-9@][^,;|()`]*?)(?= is licensed\b|[,;|()`]|$)/;
const PATH = /(?<![\w./-])public\/[\w.\-/*]+/g;
// The open licences a bundled software or model file may carry. Plain "BSD" with no clause count is not read.
// As with CC0, "not Apache-2.0" and "non-MIT" say the opposite, so they are not read as that licence.
const DENIED = "(?<!\\bnot )(?<!\\bnon-)";
const APACHE = new RegExp(`${DENIED}\\bApache(?:${SEP}License)?,?(?:${SEP}Version)?${SEP}2\\.0\\b`, "i");
const MIT = new RegExp(`${DENIED}\\bMIT\\b`);
const BSD = new RegExp(`${DENIED}\\bBSD${SEP}([23])${SEP}Clause\\b`, "i");
const LINK = /\bhttps?:\/\/[^\s|`<>]+/;

/**
 * Which rules a file is checked by: "software" under one of SOFTWARE_ROOTS, "art" anywhere else.
 * @param {string} path
 * @returns {AssetClass}
 */
export function assetClass(path) {
  return SOFTWARE_ROOTS.some((root) => path.startsWith(root)) ? "software" : "art";
}

/**
 * Why a file is bookkeeping and not an asset, or null when it is an asset.
 * @param {string} path
 * @returns {string | null}
 */
export function bookkeepingRule(path) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (name.startsWith(".")) return "dot file";
  if (name === "index.json") return "index.json, a list of the clips beside it";
  if (/\.(?:md|txt)$/i.test(name)) return "text file";
  return null;
}

/**
 * Reads a licence out of a piece of credit text. `context` is the whole line, where a CC BY author is looked for.
 * @param {string} text
 * @param {string} [context]
 * @returns {Licence}
 */
export function readLicence(text, context = text) {
  for (const pattern of NOT_ALLOWED) {
    const bad = pattern.exec(text);
    if (bad) return { status: "not-allowed", label: bad[0] };
  }
  if (CC0.test(text)) return { status: "ok", label: "CC0" };
  const by = CC_BY.exec(text);
  if (by) {
    const label = by[1] === undefined ? "CC BY" : `CC BY ${by[1]}`;
    const author = AUTHOR.exec(context)?.[1]?.trim();
    if (author === undefined || author === "") return { status: "no-author", label };
    return { status: "ok", label: `${label}, by ${author}` };
  }
  const team = TEAM.exec(text);
  if (team) return { status: "ok", label: team[0].trim() };
  return { status: "missing", label: "" };
}

/**
 * Reads the licence of a bundled software or model file: Apache-2.0, MIT, or BSD with 2 or 3 clauses.
 * The line must also name the author with the word "by" and give a link to the source.
 * A CC0, CC BY or made-by-the-team line is not allowed here, even when it names a software licence as well:
 * these folders hold other people's software, and a line that gives two licences is not a clear credit.
 * @param {string} text
 * @param {string} [context]
 * @returns {Licence}
 */
export function readSoftwareLicence(text, context = text) {
  const art = readLicence(text, context);
  if (art.status !== "missing") return { status: "not-allowed", label: art.label };
  const bsd = BSD.exec(text);
  const name = APACHE.test(text) ? "Apache-2.0" : MIT.test(text) ? "MIT" : bsd ? `BSD-${bsd[1] ?? ""}-Clause` : null;
  if (name === null) return art;
  const author = AUTHOR.exec(context)?.[1]?.trim();
  if (author === undefined || author === "") return { status: "no-author", label: name };
  if (!LINK.test(context)) return { status: "no-source", label: name };
  return { status: "ok", label: `${name}, by ${author}` };
}

/**
 * @param {string} line
 * @returns {string[]}
 */
function cells(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim());
}

/**
 * True when a pattern names something under one of ASSET_ROOTS and its first part below the root has a
 * letter or a digit in it. So `public/`, `public/*`, `public/**` and `public/*\/*` name nothing, and one
 * line cannot credit every file. `public/*.svg` still names the SVG files at the top of the folder.
 * @param {string} pattern
 * @returns {boolean}
 */
function namesSomething(pattern) {
  return ASSET_ROOTS.some((root) => {
    if (!pattern.startsWith(`${root}/`)) return false;
    const first = pattern.slice(root.length + 1).split("/")[0] ?? "";
    return /[A-Za-z0-9]/.test(first);
  });
}

/**
 * The `public/...` paths, folders (trailing slash) and `*` patterns a line names.
 * Stars left by markdown bold or italics are dropped: after a file extension, and two or more after a slash.
 * A pattern that would cover the whole root is dropped too (see namesSomething).
 * @param {string} line
 * @returns {string[]}
 */
export function pathsNamed(line) {
  return [...line.matchAll(PATH)]
    .map((match) =>
      match[0]
        .replace(/\.+$/, "")
        .replace(/(\.[A-Za-z0-9]+)\*+$/, "$1")
        .replace(/\/\*{2,}$/, "/"),
    )
    .filter(namesSomething);
}

/**
 * Every line of a credit file that names an asset path, with the licence that line gives.
 * In a table with a Licence column, that cell is the licence. Anywhere else the whole line is searched.
 * @param {CreditSource} source
 * @returns {CreditLine[]}
 */
export function creditLines(source) {
  const lines = source.text.split(/\r?\n/);
  /** @type {CreditLine[]} */
  const found = [];
  let licenceColumn = -1;
  let inTable = false;
  lines.forEach((line, index) => {
    const isRow = line.trimStart().startsWith("|");
    if (!isRow) {
      inTable = false;
      licenceColumn = -1;
    } else if (!inTable) {
      inTable = true;
      const next = lines[index + 1] ?? "";
      const isHeader = /^\s*\|?\s*:?-{3,}/.test(next);
      licenceColumn = isHeader ? cells(line).findIndex((cell) => /^licen[cs]e$/i.test(cell)) : -1;
    }
    const patterns = pathsNamed(line);
    if (patterns.length === 0) return;
    found.push({ file: source.file, line: index + 1, patterns, ...lineLicences(line, licenceColumn) });
  });
  return found;
}

/**
 * The licence a line gives, read twice: by the art rules and by the bundled software rules.
 * Which reading counts is decided later, by the folder of the file the line names.
 * @param {string} line
 * @param {number} licenceColumn
 * @returns {{ licence: Licence, software: Licence }}
 */
function lineLicences(line, licenceColumn) {
  if (licenceColumn < 0) return { licence: readLicence(line), software: readSoftwareLicence(line) };
  const cell = cells(line)[licenceColumn] ?? "";
  // A Licence cell that says something the class does not know ("MIT" for art, "unknown") is not an allowed licence.
  /** @type {(licence: Licence) => Licence} */
  const orNotAllowed = (licence) =>
    licence.status === "missing" && cell !== "" ? { status: "not-allowed", label: cell.slice(0, 40) } : licence;
  return { licence: orNotAllowed(readLicence(cell, line)), software: orNotAllowed(readSoftwareLicence(cell, line)) };
}

/**
 * How a credit pattern names a file: the exact path, a `*` pattern, or its folder with a trailing slash.
 * @param {string} pattern
 * @param {string} path
 * @returns {MatchKind | null}
 */
export function matchKind(pattern, path) {
  if (pattern === path) return "exact";
  if (pattern.endsWith("/")) return path.startsWith(pattern) ? "folder" : null;
  if (!pattern.includes("*")) return null;
  const source = pattern
    .split("*")
    .map((part) => part.replace(/[.\\+?^${}()|[\]]/g, "\\$&"))
    .join("[^/]*");
  return new RegExp(`^${source}$`).test(path) ? "glob" : null;
}

const KIND_RANK = { exact: 0, glob: 1, folder: 2 };
const STATUS_RANK = { "not-allowed": 0, "no-author": 1, "no-source": 1, ok: 2, missing: 0 };

/**
 * The credit line that decides a file, or null when no line names it.
 * A line that states a licence always beats a line that states none.
 * Among lines that state a licence the most specific wins: exact path, then pattern, then folder.
 * So a folder credit cannot hide a pattern or an exact line that says the file is not allowed.
 * At the same level a problem wins (not allowed, then no author or no source link, then an allowed licence),
 * and CREDITS.md comes before a model log.
 * A bundled software or model file is credited only by its exact path, in any credit file.
 * The line comes back with `licence` set to the reading for this file's class: art or bundled software.
 * @param {string} path
 * @param {CreditLine[]} lines
 * @returns {CreditLine | null}
 */
export function findCredit(path, lines) {
  const software = assetClass(path) === "software";
  /** @type {{ line: CreditLine, rank: number }[]} */
  const candidates = [];
  for (const line of lines) {
    const licence = software ? line.software : line.licence;
    for (const pattern of line.patterns) {
      const kind = matchKind(pattern, path);
      if (kind === null) continue;
      if (kind !== "exact" && (software || line.file !== MAIN_CREDITS)) continue;
      const rank =
        (licence.status === "missing" ? 1000 : 0) +
        KIND_RANK[kind] * 100 +
        STATUS_RANK[licence.status] * 10 +
        (line.file === MAIN_CREDITS ? 0 : 1);
      candidates.push({ line: { ...line, licence }, rank });
    }
  }
  candidates.sort((a, b) => a.rank - b.rank);
  return candidates[0]?.line ?? null;
}

/** @type {Record<Exclude<LicenceStatus, "ok">, GapKind>} */
const GAP_FOR = {
  missing: "no licence on the credit line",
  "not-allowed": "licence not allowed",
  "no-author": "CC BY without an author",
  "no-source": "software credit without a source link",
};

/**
 * `expected` is a list of folders (each ending with a slash) that should hold files. One with no file in
 * `files` is listed in `absent`, so a report run before `make setup` says what it could not see.
 * @param {AssetFile[]} files
 * @param {CreditSource[]} sources
 * @param {string[]} [expected]
 * @returns {Report}
 */
export function buildReport(files, sources, expected = []) {
  const lines = sources.flatMap(creditLines);
  const rows = [...files]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((file) => rowFor(file, lines));
  const assets = rows.filter((row) => row.asset);
  const gaps = assets.filter((row) => row.gap !== null).length;
  return {
    rows,
    files: rows.length,
    bytes: rows.reduce((sum, row) => sum + row.size, 0),
    assets: assets.length,
    software: assets.filter((row) => row.kind === "software").length,
    credited: assets.length - gaps,
    gaps,
    absent: expected.filter((folder) => !files.some((file) => file.path.startsWith(folder))),
  };
}

/**
 * @param {AssetFile} file
 * @param {CreditLine[]} lines
 * @returns {Row}
 */
function rowFor(file, lines) {
  const kind = assetClass(file.path);
  const base = { path: file.path, size: file.size, gap: null, asset: true, kind, note: "" };
  const rule = bookkeepingRule(file.path);
  if (rule !== null) return { ...base, asset: false, licence: `not an asset (${rule})`, where: "-" };
  const credit = findCredit(file.path, lines);
  if (credit === null) return { ...base, licence: "-", where: "-", gap: "no credit" };
  const where = `${credit.file}:${String(credit.line)}`;
  const { status, label } = credit.licence;
  if (status !== "ok") {
    const gap = kind === "software" && status === "no-author" ? "software licence without an author" : GAP_FOR[status];
    return { ...base, licence: label || "-", where, gap };
  }
  const note = credit.file === MAIN_CREDITS ? "" : `credited in the model log only, not in ${MAIN_CREDITS}`;
  return { ...base, licence: kind === "software" ? `Bundled software: ${label}` : label, where, note };
}

/**
 * Who fixes a gap. Audio credits are ours; the rest of CREDITS.md and the model logs are the lead's agents'.
 * @param {string} path
 * @returns {string}
 */
export function gapOwner(path) {
  if (path.startsWith("public/audio/")) return "audio (luvudeshi's agent)";
  if (assetClass(path) === "software") return "bundled software and model files (the lead's agents)";
  if (/^public\/(?:models|hdri|textures)\//.test(path)) return "models, textures and skies (the lead's agents)";
  return "icons and screen art (the lead's agents)";
}

/**
 * Sizes in units of 1000, the way the model logs write them.
 * @param {number} bytes
 * @returns {string}
 */
export function sizeText(bytes) {
  if (bytes < 1000) return `${String(bytes)} B`;
  if (bytes < 1_000_000) return `${String(Math.round(bytes / 1000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/**
 * The summary, then the gaps grouped by owner, kind and folder, then the notes.
 * The second line is there only when the list holds bundled software or model files.
 * @param {Report} report
 * @returns {string[]}
 */
export function summaryLines(report) {
  const out = [
    `${String(report.files)} files, ${sizeText(report.bytes)} (${String(report.bytes)} bytes). ` +
      `${String(report.assets)} assets: ${String(report.credited)} credited, ${String(report.gaps)} ${report.gaps === 1 ? "gap" : "gaps"}. ` +
      `${String(report.files - report.assets)} not assets.`,
  ];
  if (report.software > 0) {
    out.push(
      `Art and sound: ${String(report.assets - report.software)}. ` +
        `Bundled software and model files under their own open licence: ${String(report.software)}.`,
    );
  }
  /** @type {Map<string, string[]>} */
  const groups = new Map();
  for (const row of report.rows) {
    if (row.gap === null) continue;
    const cut = row.path.lastIndexOf("/") + 1;
    const key = `GAP, ${gapOwner(row.path)}, ${row.gap}: ${row.path.slice(0, cut)}`;
    groups.set(key, [...(groups.get(key) ?? []), row.path.slice(cut)]);
  }
  for (const [key, names] of groups) {
    out.push(names.length <= 6 ? `${key}{${names.join(", ")}}` : `${key} (${String(names.length)} files)`);
  }
  for (const row of report.rows) {
    if (row.note !== "") out.push(`NOTE, ${row.path}: ${row.note}`);
  }
  for (const folder of report.absent) {
    out.push(`NOTE, ${folder}: no files on this machine, so none are listed. They ship with the game: run make setup, then this report again`);
  }
  return out;
}

/**
 * @param {Row} row
 * @returns {string[]}
 */
function columns(row) {
  return [row.path, sizeText(row.size), row.gap === null ? row.licence : `GAP: ${row.gap}`, row.where];
}

const HEADINGS = ["File", "Size", "Licence", "Credited at"];

/**
 * @param {Report} report
 * @returns {string}
 */
export function formatText(report) {
  const table = [HEADINGS, ...report.rows.map(columns)];
  const widths = HEADINGS.map((_, column) => Math.max(...table.map((cellsOfRow) => (cellsOfRow[column] ?? "").length)));
  const body = table.map((cellsOfRow) =>
    cellsOfRow.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join("  ").trimEnd(),
  );
  return [...body, "", ...summaryLines(report)].join("\n");
}

/**
 * @param {Report} report
 * @returns {string}
 */
export function formatMarkdown(report) {
  const escape = (/** @type {string} */ cell) => cell.replace(/\|/g, "\\|");
  const table = [
    `| ${HEADINGS.join(" | ")} |`,
    "|---|---|---|---|",
    ...report.rows.map((row) => {
      const [path = "", ...rest] = columns(row);
      return `| \`${path}\` | ${rest.map(escape).join(" | ")} |`;
    }),
  ];
  return [...summaryLines(report).map((line) => `- ${line}`), "", ...table].join("\n");
}

/**
 * Every file under a folder, as paths from the repo root with forward slashes.
 * @param {string} root
 * @param {string} folder
 * @returns {AssetFile[]}
 */
function walk(root, folder) {
  /** @type {AssetFile[]} */
  const out = [];
  let names;
  try {
    names = readdirSync(join(root, folder)).sort();
  } catch {
    return out;
  }
  for (const name of names) {
    const path = `${folder}/${name}`;
    const stat = statSync(join(root, path));
    if (stat.isDirectory()) out.push(...walk(root, path));
    else out.push({ path, size: stat.size });
  }
  return out;
}

/**
 * CREDITS.md, docs/models.md and every docs/models/*.md that exists.
 * @param {string} root
 * @returns {CreditSource[]}
 */
function readSources(root) {
  const names = [MAIN_CREDITS, "docs/models.md"];
  try {
    for (const name of readdirSync(join(root, "docs/models")).sort()) {
      if (name.endsWith(".md")) names.push(`docs/models/${name}`);
    }
  } catch {
    // No docs/models folder: the two files above are enough.
  }
  /** @type {CreditSource[]} */
  const sources = [];
  for (const file of names) {
    try {
      sources.push({ file, text: readFileSync(join(root, file), "utf8") });
    } catch {
      // A credit file that does not exist credits nothing.
    }
  }
  return sources;
}

/**
 * @param {string[]} args
 * @returns {number} the exit code
 */
function main(args) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const files = ASSET_ROOTS.flatMap((folder) => walk(root, folder));
  const report = buildReport(files, readSources(root), SOFTWARE_ROOTS);
  const text = args.includes("--markdown") ? formatMarkdown(report) : formatText(report);
  process.stdout.write(`${text}\n`);
  return report.gaps === 0 ? 0 : 1;
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
  process.exitCode = main(process.argv.slice(2));
}
