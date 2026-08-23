import type { RecurrenceRule } from "../domain/recurrence";
import type { LocalDate } from "../time/localDate";
import {
  addDays,
  compareLocalDate,
  diffDays,
  parseLocalDate,
  weekdayOf,
} from "../time/localDate";
import { startOfWeek } from "../time/week";

/** Upper bound on forward scans in nextOccurrence, to guarantee termination
 *  even for rules that (in theory) might never match again. ~11 years. */
const MAX_SCAN_DAYS = 4000;

/** Does this recurrence rule land on the given local day? Pure + total. */
export const occursOn = (rule: RecurrenceRule, date: LocalDate): boolean => {
  switch (rule.kind) {
    case "daily":
      return true;
    case "everyNDays": {
      if (rule.n <= 0) return false;
      const d = diffDays(rule.anchor, date);
      return d >= 0 && d % rule.n === 0;
    }
    case "weekdays":
      return rule.days.includes(weekdayOf(date));
    case "weekly": {
      if (rule.everyNWeeks <= 0) return false;
      if (!rule.days.includes(weekdayOf(date))) return false;
      // Compare week indices relative to the anchor week (weeks start Sunday here;
      // the specific week-start only shifts both sides equally, so parity holds).
      const weeks = Math.floor(
        diffDays(startOfWeek(rule.anchor, 0), startOfWeek(date, 0)) / 7,
      );
      return weeks >= 0 && weeks % rule.everyNWeeks === 0;
    }
    case "monthlyDay":
      return parseLocalDate(date).day === rule.day;
    case "once":
      return compareLocalDate(rule.date, date) === 0;
  }
};

/** First occurrence strictly AFTER `after`, or null if none within the scan bound. */
export const nextOccurrence = (
  rule: RecurrenceRule,
  after: LocalDate,
): LocalDate | null => {
  if (rule.kind === "once") {
    return compareLocalDate(rule.date, after) > 0 ? rule.date : null;
  }
  let cursor = addDays(after, 1);
  for (let i = 0; i < MAX_SCAN_DAYS; i++) {
    if (occursOn(rule, cursor)) return cursor;
    cursor = addDays(cursor, 1);
  }
  return null;
};
