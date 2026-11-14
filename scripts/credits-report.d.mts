// Types for credits-report.mjs, so tests/creditsReport.test.ts can import it under the root tsconfig (no allowJs there).

export interface AssetFile {
  path: string;
  size: number;
}
export interface CreditSource {
  file: string;
  text: string;
}
export type LicenceStatus = "ok" | "missing" | "not-allowed" | "no-author";
export interface Licence {
  status: LicenceStatus;
  label: string;
}
export interface CreditLine {
  file: string;
  line: number;
  patterns: string[];
  licence: Licence;
}
export type MatchKind = "exact" | "glob" | "folder";
export type GapKind =
  | "no credit"
  | "no licence on the credit line"
  | "licence not allowed"
  | "CC BY without an author";
export interface Row {
  path: string;
  size: number;
  licence: string;
  where: string;
  gap: GapKind | null;
  asset: boolean;
  note: string;
}
export interface Report {
  rows: Row[];
  files: number;
  bytes: number;
  assets: number;
  credited: number;
  gaps: number;
}

export const ASSET_ROOTS: string[];
export const MAIN_CREDITS: string;
export function bookkeepingRule(path: string): string | null;
export function readLicence(text: string, context?: string): Licence;
export function pathsNamed(line: string): string[];
export function creditLines(source: CreditSource): CreditLine[];
export function matchKind(pattern: string, path: string): MatchKind | null;
export function findCredit(path: string, lines: CreditLine[]): CreditLine | null;
export function buildReport(files: AssetFile[], sources: CreditSource[]): Report;
export function gapOwner(path: string): string;
export function sizeText(bytes: number): string;
export function summaryLines(report: Report): string[];
export function formatText(report: Report): string;
export function formatMarkdown(report: Report): string;
