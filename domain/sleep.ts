import type { Timestamp } from "../core/scalars";
import type { LocalDate } from "../time/localDate";
import type { SleepEntryId } from "./ids";

/**
 * One night's sleep, keyed to the WAKE date (the morning you got up). Duration is
 * stored explicitly so it can be entered directly OR computed from bed/wake times
 * by the UI; the domain doesn't force a derivation. Bed/wake are optional wall-
 * clock strings ("HH:mm") kept for consistency analysis and display.
 */
export interface SleepEntry {
  readonly id: SleepEntryId;
  readonly date: LocalDate;
  readonly bedtime: string | null; // "HH:mm" the night before
  readonly wakeTime: string | null; // "HH:mm" on `date`
  readonly durationMinutes: number;
  readonly quality: number | null; // optional 1..5
  readonly note: string | null;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}
