import type { Timestamp } from "../core/scalars";
import type { LocalDate } from "../time/localDate";
import type { Daypart } from "./common";
import type { RecurrenceRule } from "./recurrence";
import type { HabitCompletionId, HabitId } from "./ids";

/** Optional measurable target, e.g. drink water: 8 glasses. */
export interface HabitTarget {
  readonly amount: number;
  readonly unit: string | null;
}

/** Reminder metadata only — actually scheduling notifications is a later phase. */
export interface ReminderMeta {
  readonly enabled: boolean;
  readonly time: string | null; // \"HH:mm\" local wall-clock, or null
}

export interface Habit {
  readonly id: HabitId;
  readonly name: string;
  readonly category: string | null;
  readonly schedule: RecurrenceRule;
  readonly daypart: Daypart;
  readonly active: boolean;
  readonly target: HabitTarget | null;
  readonly reminder: ReminderMeta | null;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
  readonly archivedAt: Timestamp | null;
}

/**
 * A habit completion is a DATED EVENT, never a boolean on the habit. This is the
 * key architectural choice that makes historical analytics possible later:
 * streaks, consistency, per-day ratios all derive from these immutable events.
 */
export interface HabitCompletion {
  readonly id: HabitCompletionId;
  readonly habitId: HabitId;
  readonly date: LocalDate; // the local day this completion counts toward
  readonly amount: number | null; // for measurable habits; null = a plain check
  readonly completedAt: Timestamp; // the exact instant it was logged
  readonly note: string | null;
}
