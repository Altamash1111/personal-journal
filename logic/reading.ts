/**
 * Pure reading/learning analytics: per-item progress and status grouping.
 */
import type { AppData } from "../domain/appData";
import type { ReadingItem, ReadingStatus } from "../domain/reading";
import type { LearningLogEntry } from "../domain/reading";
import type { LocalDate } from "../time/localDate";

/** Progress fraction 0..1. Percent-unit items use `current` directly (/100);
 *  items without a known total report 0 (unknown), never a misleading number. */
export const readingProgress = (item: ReadingItem): number => {
  if (item.status === "finished") return 1;
  if (item.unit === "percent") return Math.max(0, Math.min(1, item.current / 100));
  if (item.total === null || item.total <= 0) return 0;
  return Math.max(0, Math.min(1, item.current / item.total));
};

export interface ReadingGroups {
  readonly current: readonly ReadingItem[];
  readonly upcoming: readonly ReadingItem[];
  readonly finished: readonly ReadingItem[];
}

export const groupByStatus = (data: AppData): ReadingGroups => {
  const pick = (status: ReadingStatus): readonly ReadingItem[] =>
    data.reading
      .filter((r) => r.status === status)
      .slice()
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return {
    current: pick("current"),
    upcoming: pick("upcoming"),
    finished: pick("finished"),
  };
};

export const finishedCount = (data: AppData): number =>
  data.reading.filter((r) => r.status === "finished").length;

/** Learning-log entries for a date, newest first. */
export const learningForDate = (
  data: AppData,
  date: LocalDate,
): readonly LearningLogEntry[] =>
  data.learningLog
    .filter((e) => e.date === date)
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
