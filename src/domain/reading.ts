import type { Timestamp } from "../core/scalars";
import type { LocalDate } from "../time/localDate";
import type { ReadingItemId, ReadingNoteId, LearningLogId } from "./ids";

export type ReadingKind = "book" | "article";
export type ReadingStatus = "upcoming" | "current" | "finished";
export type ProgressUnit = "pages" | "minutes" | "percent";

export const READING_STATUSES: readonly ReadingStatus[] = [
  "upcoming",
  "current",
  "finished",
];

export interface ReadingNote {
  readonly id: ReadingNoteId;
  readonly at: Timestamp;
  readonly text: string;
  readonly location: number | null; // page/minute the note refers to, if any
}

export interface ReadingItem {
  readonly id: ReadingItemId;
  readonly kind: ReadingKind;
  readonly title: string;
  readonly author: string | null;
  readonly url: string | null;
  readonly status: ReadingStatus;
  readonly unit: ProgressUnit;
  readonly total: number | null; // total pages/minutes; null when unknown
  readonly current: number; // progress so far, in `unit`
  readonly notes: readonly ReadingNote[];
  readonly startedAt: LocalDate | null;
  readonly finishedAt: LocalDate | null;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

/** A free-form dated learning/knowledge log entry, independent of any book. */
export interface LearningLogEntry {
  readonly id: LearningLogId;
  readonly date: LocalDate;
  readonly topic: string | null;
  readonly text: string;
  readonly createdAt: Timestamp;
}
