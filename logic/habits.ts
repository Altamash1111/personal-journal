import type { Habit, HabitCompletion } from "../domain/habit";
import type { HabitId } from "../domain/ids";
import type { LocalDate } from "../time/localDate";
import { addDays } from "../time/localDate";
import { occursOn } from "./recurrence";

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Is the habit scheduled (and active) on this day? */
export const isHabitDueOn = (habit: Habit, date: LocalDate): boolean =>
  habit.active && habit.archivedAt === null && occursOn(habit.schedule, date);

export const completionsFor = (
  habitId: HabitId,
  date: LocalDate,
  completions: readonly HabitCompletion[],
): readonly HabitCompletion[] =>
  completions.filter((c) => c.habitId === habitId && c.date === date);

const totalAmount = (cs: readonly HabitCompletion[]): number =>
  cs.reduce((acc, c) => acc + (c.amount ?? 0), 0);

/** Considered done: a plain habit needs >=1 completion; a measurable habit needs
 *  its target amount reached (summed across that day’s completions). */
export const isHabitCompletedOn = (
  habit: Habit,
  date: LocalDate,
  completions: readonly HabitCompletion[],
): boolean => {
  const cs = completionsFor(habit.id, date, completions);
  if (cs.length === 0) return false;
  if (habit.target !== null) return totalAmount(cs) >= habit.target.amount;
  return true;
};

/** Fractional completion for a day (measurable -> amount/target; plain -> 0 or 1). */
export const habitDayRatio = (
  habit: Habit,
  date: LocalDate,
  completions: readonly HabitCompletion[],
): number => {
  const cs = completionsFor(habit.id, date, completions);
  if (habit.target !== null) {
    return habit.target.amount <= 0
      ? 0
      : clamp01(totalAmount(cs) / habit.target.amount);
  }
  return cs.length > 0 ? 1 : 0;
};

/**
 * Consecutive DUE days completed, counting back from `today` (inclusive).
 * Non-due days are skipped (they don’t break a streak). Bounded scan.
 */
export const currentStreak = (
  habit: Habit,
  completions: readonly HabitCompletion[],
  today: LocalDate,
): number => {
  let streak = 0;
  let cursor = today;
  for (let i = 0; i < 4000; i++) {
    if (occursOn(habit.schedule, cursor)) {
      if (isHabitCompletedOn(habit, cursor, completions)) streak++;
      else break;
    }
    cursor = addDays(cursor, -1);
  }
  return streak;
};
