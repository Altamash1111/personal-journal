import type { Timestamp } from "../core/scalars";
import type { LocalDate } from "../time/localDate";
import type { JournalEntryId } from "./ids";

/** Dated daily reflection. One entry per local day (upserted). Fields optional so
 *  a partial reflection is valid. Ratings are 1-5 or null. */
export interface JournalEntry {
  readonly id: JournalEntryId;
  readonly date: LocalDate;
  readonly accomplished: string | null;
  readonly wentWrong: string | null;
  readonly learned: string | null;
  readonly rating: number | null;
  readonly topPriorityTomorrow: string | null;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}
