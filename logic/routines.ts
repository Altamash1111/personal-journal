import type { Habit, HabitCompletion } from "../domain/habit";
import type { Routine } from "../domain/routine";
import type { LocalDate } from "../time/localDate";
import { occursOn } from "./recurrence";
import { isHabitCompletedOn } from "./habits";

export interface RoutineProgress {
  readonly done: number;
  readonly total: number;
  readonly ratio: number; // 0..1
}

export const isRoutineDueOn = (routine: Routine, date: LocalDate): boolean =>
  routine.active && occursOn(routine.schedule, date);

/**
 * Routine progress for a day = fraction of its steps whose underlying habit is
 * completed that day. Steps pointing at a missing habit are ignored (not counted
 * in the total) rather than silently failing.
 */
export const routineProgress = (
  routine: Routine,
  date: LocalDate,
  habits: readonly Habit[],
  completions: readonly HabitCompletion[],
): RoutineProgress => {
  const byId = new Map(habits.map((h) => [h.id, h]));
  let total = 0;
  let done = 0;
  for (const step of routine.steps) {
    const habit = byId.get(step.habitId);
    if (habit === undefined) continue;
    total++;
    if (isHabitCompletedOn(habit, date, completions)) done++;
  }
  return { done, total, ratio: total === 0 ? 0 : done / total };
};
