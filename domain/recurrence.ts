import type { LocalDate, Weekday } from "../time/localDate";

/**
 * A single recurrence engine powers habit frequency, routine schedules, and
 * recurring tasks — so there is exactly one place that answers \"does this happen
 * on day X?\". (See logic/recurrence.ts for the evaluator.)
 */
export type RecurrenceRule =
  | { readonly kind: "daily" }
  | { readonly kind: "everyNDays"; readonly n: number; readonly anchor: LocalDate }
  | { readonly kind: "weekdays"; readonly days: readonly Weekday[] }
  | {
      readonly kind: "weekly";
      readonly days: readonly Weekday[];
      readonly everyNWeeks: number;
      readonly anchor: LocalDate;
    }
  | { readonly kind: "monthlyDay"; readonly day: number }
  | { readonly kind: "once"; readonly date: LocalDate };
