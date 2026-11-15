// Types for credits-report.mjs, so tests/creditsReport.test.ts can import it under the root tsconfig (no allowJs there).

export interface AssetFile {
  path: string;
  size: number;
}
export interface CreditSource {
  file: string;
  text: string;
}
export type LicenceStatus = "ok" | "missing" | "not-allowed" | "no-author" | "no-source";
export interface Licence {
  status: LicenceStatus;
  label: string;
}
export interface CreditLine {
  file: string;
  line: number;
  patterns: string[];
  /** The licence by the art rules. From findCredit: the licence by the rules of the file asked about. */
  licence: Licence;
  /** The licence by the bundled software rules. */
  software: Licence;
}
export type MatchKind = "exact" | "glob" | "folder";
export type AssetClass = "art" | "software";
export type GapKind =
  | "no credit"
  | "no licence on the credit line"
  | "licence not allowed"
  | "CC BY without an author"
  | "software licence without an author"
  | "software credit without a source link";
export interface Row {
  path: string;
  size: number;
  licence: string;
  where: string;
  gap: GapKind | null;
  asset: boolean;
  kind: AssetClass;
  note: string;
}
export interface Report {
  rows: Row[];
  files: number;
  bytes: number;
  assets: number;
  software: number;
  credited: number;
  gaps: number;
  absent: string[];
}

export const ASSET_ROOTS: string[];
export const SOFTWARE_ROOTS: string[];
export const MAIN_CREDITS: string;
export function bookkeepingRule(path: string): string | null;
export function assetClass(path: string): AssetClass;
export function readLicence(text: string, context?: string): Licence;
export function readSoftwareLicence(text: string, context?: string): Licence;
export function pathsNamed(line: string): string[];
export function creditLines(source: CreditSource): CreditLine[];
export function matchKind(pattern: string, path: string): MatchKind | null;
export function findCredit(path: string, lines: CreditLine[]): CreditLine | null;
export function buildReport(files: AssetFile[], sources: CreditSource[], expected?: string[]): Report;
export function gapOwner(path: string): string;
export function sizeText(bytes: number): string;
export function summaryLines(report: Report): string[];
export function formatText(report: Report): string;
export function formatMarkdown(report: Report): string;
