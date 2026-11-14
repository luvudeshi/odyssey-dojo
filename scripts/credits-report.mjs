// Lists every shipped asset with its credit line, licence and size. Run it with `make credits`.
// It exits 1 when an asset has no credit, no licence, or a licence the rules do not allow.
// How a credit line must be written is in docs/licences.md.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @typedef {{ path: string, size: number }} AssetFile
 * @typedef {{ file: string, text: string }} CreditSource
 * @typedef {"ok" | "missing" | "not-allowed" | "no-author"} LicenceStatus
 * @typedef {{ status: LicenceStatus, label: string }} Licence
 * @typedef {{ file: string, line: number, patterns: string[], licence: Licence }} CreditLine
 * @typedef {"exact" | "glob" | "folder"} MatchKind
 * @typedef {"no credit" | "no licence on the credit line" | "licence not allowed" | "CC BY without an author"} GapKind
 * @typedef {{ path: string, size: number, licence: string, where: string, gap: GapKind | null, asset: boolean, note: string }} Row
 * @typedef {{ rows: Row[], files: number, bytes: number, assets: number, credited: number, gaps: number }} Report
 */

/** The folders whose files ship with the game and need a credit. */
export const ASSET_ROOTS = ["public/models", "public/hdri", "public/textures", "public/audio"];

/** Folder and `*` credits count only here. A model log has to name the exact file. */
export const MAIN_CREDITS = "CREDITS.md";

const NOT_ALLOWED = [
  /\bCC[ -]?BY[ -](?:NC|ND|SA)(?:[ -](?:NC|ND|SA))*(?:[ -]?\d\.\d)?/i,
  /\bnon-?commercial\b/i,
  /\broyalty[- ]free\b/i,
  /\ball rights reserved\b/i,
  /\beditorial use\b/i,
];
const CC0 = /\bCC[ -]?0\b/i;
const CC_BY = /\bCC[ -]?BY\b(?:[ -]?(\d\.\d))?/i;
const TEAM = /\b(?:made|generated|recorded|built|drawn) by the team\b[^|.`;]*/i;
const AUTHOR = /\bby (?!the team\b)([^,;|()`]+?)(?= is licensed\b|[,;|()`]|$)/;
const PATH = /(?<![\w./-])public\/[\w.\-/*]+/g;

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
 * The `public/...` paths, folders (trailing slash) and `*` patterns a line names.
 * @param {string} line
 * @returns {string[]}
 */
export function pathsNamed(line) {
  return [...line.matchAll(PATH)]
    .map((match) => match[0].replace(/\.+$/, ""))
    .filter((pattern) => ASSET_ROOTS.some((root) => pattern === `${root}/` || pattern.startsWith(`${root}/`)));
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
    found.push({ file: source.file, line: index + 1, patterns, licence: lineLicence(line, licenceColumn) });
  });
  return found;
}

/**
 * @param {string} line
 * @param {number} licenceColumn
 * @returns {Licence}
 */
function lineLicence(line, licenceColumn) {
  if (licenceColumn < 0) return readLicence(line);
  const cell = cells(line)[licenceColumn] ?? "";
  const licence = readLicence(cell, line);
  // A Licence cell that says something we do not know ("MIT", "unknown") is not an allowed licence.
  if (licence.status === "missing" && cell !== "") return { status: "not-allowed", label: cell.slice(0, 40) };
  return licence;
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
const STATUS_RANK = { ok: 0, "not-allowed": 1, "no-author": 2, missing: 3 };

/**
 * The credit line that decides a file, or null when no line names it.
 * A line naming the exact path with a licence that is not allowed always wins, so a folder credit cannot hide it.
 * After that a line with an allowed licence wins: exact path, then pattern, then folder; CREDITS.md before a model log.
 * @param {string} path
 * @param {CreditLine[]} lines
 * @returns {CreditLine | null}
 */
export function findCredit(path, lines) {
  /** @type {{ line: CreditLine, rank: number }[]} */
  const candidates = [];
  for (const line of lines) {
    for (const pattern of line.patterns) {
      const kind = matchKind(pattern, path);
      if (kind === null) continue;
      if (kind !== "exact" && line.file !== MAIN_CREDITS) continue;
      const banned = kind === "exact" && line.licence.status === "not-allowed";
      const rank =
        (banned ? 0 : 1000) +
        STATUS_RANK[line.licence.status] * 100 +
        KIND_RANK[kind] * 10 +
        (line.file === MAIN_CREDITS ? 0 : 1);
      candidates.push({ line, rank });
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
};

/**
 * @param {AssetFile[]} files
 * @param {CreditSource[]} sources
 * @returns {Report}
 */
export function buildReport(files, sources) {
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
    credited: assets.length - gaps,
    gaps,
  };
}

/**
 * @param {AssetFile} file
 * @param {CreditLine[]} lines
 * @returns {Row}
 */
function rowFor(file, lines) {
  const base = { path: file.path, size: file.size, gap: null, asset: true, note: "" };
  const rule = bookkeepingRule(file.path);
  if (rule !== null) return { ...base, asset: false, licence: `not an asset (${rule})`, where: "-" };
  const credit = findCredit(file.path, lines);
  if (credit === null) return { ...base, licence: "-", where: "-", gap: "no credit" };
  const where = `${credit.file}:${String(credit.line)}`;
  if (credit.licence.status !== "ok") {
    return { ...base, licence: credit.licence.label || "-", where, gap: GAP_FOR[credit.licence.status] };
  }
  const note = credit.file === MAIN_CREDITS ? "" : `credited in the model log only, not in ${MAIN_CREDITS}`;
  return { ...base, licence: credit.licence.label, where, note };
}

/**
 * Who fixes a gap. Audio credits are ours; the rest of CREDITS.md and the model logs are the lead's agents'.
 * @param {string} path
 * @returns {string}
 */
export function gapOwner(path) {
  return path.startsWith("public/audio/")
    ? "audio (luvudeshi's agent)"
    : "models, textures and skies (the lead's agents)";
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
 * @param {Report} report
 * @returns {string[]}
 */
export function summaryLines(report) {
  const out = [
    `${String(report.files)} files, ${sizeText(report.bytes)} (${String(report.bytes)} bytes). ` +
      `${String(report.assets)} assets: ${String(report.credited)} credited, ${String(report.gaps)} gaps. ` +
      `${String(report.files - report.assets)} not assets.`,
  ];
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
  const report = buildReport(files, readSources(root));
  const text = args.includes("--markdown") ? formatMarkdown(report) : formatText(report);
  process.stdout.write(`${text}\n`);
  return report.gaps === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
