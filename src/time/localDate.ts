import type { Brand } from "../core/brand";

/** A calendar day in the user’s local timezone, formatted \"YYYY-MM-DD\".
 *  Deliberately NOT an instant: day-based tracking must not depend on UTC offset.
 *  All arithmetic here treats the value as an abstract calendar date. */
export type LocalDate = Brand<string, "LocalDate">;

/** 0 = Sunday … 6 = Saturday (matches Date.getUTCDay). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

export interface DateParts {
  readonly year: number;
  readonly month: number; // 1-12
  readonly day: number; // 1-31
}

export const isLocalDateString = (s: string): boolean => {
  const m = RE.exec(s);
  if (m === null) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  // reject impossible dates like 2025-02-30 by round-tripping through UTC
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
};

/** Parse a validated LocalDate string, or throw (internal invariant). */
export const parseLocalDate = (ld: LocalDate): DateParts => {
  const m = RE.exec(ld);
  if (m === null) throw new Error(`invalid LocalDate: ${ld}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
};

/** Build a LocalDate from numeric parts (validates). */
export const localDateOf = (year: number, month: number, day: number): LocalDate => {
  const s = `${year.toString().padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
  if (!isLocalDateString(s)) throw new Error(`invalid date parts: ${s}`);
  return s as LocalDate;
};

/** Narrow an arbitrary string to LocalDate if valid. */
export const toLocalDate = (s: string): LocalDate | null =>
  isLocalDateString(s) ? (s as LocalDate) : null;

const anchor = (ld: LocalDate): number => {
  const { year, month, day } = parseLocalDate(ld);
  return Date.UTC(year, month - 1, day);
};

const fromAnchor = (ms: number): LocalDate => {
  const d = new Date(ms);
  return localDateOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
};

const DAY_MS = 86_400_000;

export const addDays = (ld: LocalDate, n: number): LocalDate =>
  fromAnchor(anchor(ld) + n * DAY_MS);

/** whole calendar days from a to b (b - a); negative if b is before a. */
export const diffDays = (a: LocalDate, b: LocalDate): number =>
  Math.round((anchor(b) - anchor(a)) / DAY_MS);

export const compareLocalDate = (a: LocalDate, b: LocalDate): -1 | 0 | 1 => {
  const av = anchor(a);
  const bv = anchor(b);
  return av < bv ? -1 : av > bv ? 1 : 0;
};

export const weekdayOf = (ld: LocalDate): Weekday =>
  new Date(anchor(ld)).getUTCDay() as Weekday;

export const minLocalDate = (a: LocalDate, b: LocalDate): LocalDate =>
  compareLocalDate(a, b) <= 0 ? a : b;

export const maxLocalDate = (a: LocalDate, b: LocalDate): LocalDate =>
  compareLocalDate(a, b) >= 0 ? a : b;
