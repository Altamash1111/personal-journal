/**
 * Pure sleep analytics. Duration is taken as logged; averages and a consistency
 * score are derived over a recent window. Consistency = how steady durations are
 * night to night (1 = identical, →0 as they vary), reported only with enough data.
 */
import type { AppData } from "../domain/appData";
import type { SleepEntry } from "../domain/sleep";
import type { LocalDate } from "../time/localDate";
import { diffDays } from "../time/localDate";

export const sleepForDate = (
  data: AppData,
  date: LocalDate,
): SleepEntry | undefined => data.sleepLog.find((s) => s.date === date);

/** Most recent `n` nights up to and including `date`, newest first. */
export const lastNights = (
  data: AppData,
  date: LocalDate,
  n: number,
): readonly SleepEntry[] =>
  data.sleepLog
    .filter((s) => {
      const d = diffDays(s.date, date);
      return d >= 0;
    })
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, n);

export const averageDurationMinutes = (
  entries: readonly SleepEntry[],
): number => {
  if (entries.length === 0) return 0;
  const total = entries.reduce((acc, e) => acc + e.durationMinutes, 0);
  return total / entries.length;
};

/**
 * Consistency score in 0..1 from the coefficient of variation of durations.
 * Needs at least two nights; returns null otherwise. Steadier sleep → closer 1.
 */
export const consistencyScore = (
  entries: readonly SleepEntry[],
): number | null => {
  if (entries.length < 2) return null;
  const mean = averageDurationMinutes(entries);
  if (mean <= 0) return 0;
  const variance =
    entries.reduce((acc, e) => acc + (e.durationMinutes - mean) ** 2, 0) /
    entries.length;
  const sd = Math.sqrt(variance);
  const cv = sd / mean;
  return Math.max(0, Math.min(1, 1 - cv));
};

export interface SleepProgress {
  readonly durationMinutes: number;
  readonly targetMinutes: number;
  readonly ratio: number; // 0..1 (capped)
  readonly logged: boolean;
}

export const sleepProgress = (
  entry: SleepEntry | undefined,
  targetMinutes: number,
): SleepProgress => {
  const duration = entry?.durationMinutes ?? 0;
  return {
    durationMinutes: duration,
    targetMinutes,
    ratio: targetMinutes <= 0 ? 0 : Math.min(1, duration / targetMinutes),
    logged: entry !== undefined,
  };
};

/** Format minutes as e.g. "7h 30m" for display (pure helper). */
export const formatDuration = (minutes: number): string => {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}h ${rem.toString().padStart(2, "0")}m`;
};
