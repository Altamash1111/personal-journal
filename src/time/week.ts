import type { LocalDate, Weekday } from "./localDate";
import { addDays, weekdayOf } from "./localDate";

/** First day of the week containing `ld`, given which weekday starts the week. */
export const startOfWeek = (ld: LocalDate, weekStartsOn: Weekday): LocalDate => {
  const wd = weekdayOf(ld);
  const back = (wd - weekStartsOn + 7) % 7;
  return addDays(ld, -back);
};

/** Stable key for the week containing `ld` (its start date string). */
export const weekKey = (ld: LocalDate, weekStartsOn: Weekday): string =>
  startOfWeek(ld, weekStartsOn);
