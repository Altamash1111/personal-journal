import type { AppData } from "../domain/appData";
import type { RoutineId } from "../domain/ids";
import type { LocalDate } from "../time/localDate";
import { isHabitDueOn, isHabitCompletedOn } from "./habits";
import { isRoutineDueOn, routineProgress } from "./routines";

export interface DimensionSummary {
  readonly due: number;
  readonly done: number;
  readonly ratio: number; // 0..1 (1 when nothing is due)
}

export interface RoutineSummary {
  readonly routineId: RoutineId;
  readonly name: string;
  readonly done: number;
  readonly total: number;
  readonly ratio: number;
}

export interface DailySummary {
  readonly date: LocalDate;
  readonly habits: DimensionSummary;
  readonly tasks: DimensionSummary;
  readonly routines: readonly RoutineSummary[];
  /** Overall = (habitsDone + tasksDone) / (habitsDue + tasksDue), or 1 if nothing due.
   *  Routines are intentionally NOT added in: their steps are habits already counted,
   *  so including them would double-count. This keeps the number honest + explainable. */
  readonly overall: number;
}

const ratio = (done: number, due: number): number => (due === 0 ? 1 : done / due);

export const computeDailySummary = (
  data: AppData,
  date: LocalDate,
): DailySummary => {
  const dueHabits = data.habits.filter((h) => isHabitDueOn(h, date));
  const habitsDone = dueHabits.filter((h) =>
    isHabitCompletedOn(h, date, data.habitCompletions),
  ).length;

  // A task counts toward "today" if it is due today and not cancelled.
  const dueTasks = data.tasks.filter(
    (t) => t.due === date && t.status !== "cancelled",
  );
  const tasksDone = dueTasks.filter((t) => t.status === "done").length;

  const routines: RoutineSummary[] = data.routines
    .filter((r) => isRoutineDueOn(r, date))
    .map((r) => {
      const p = routineProgress(r, date, data.habits, data.habitCompletions);
      return { routineId: r.id, name: r.name, done: p.done, total: p.total, ratio: p.ratio };
    });

  const habitsDue = dueHabits.length;
  const tasksDue = dueTasks.length;
  const overallDue = habitsDue + tasksDue;
  const overallDone = habitsDone + tasksDone;

  return {
    date,
    habits: { due: habitsDue, done: habitsDone, ratio: ratio(habitsDone, habitsDue) },
    tasks: { due: tasksDue, done: tasksDone, ratio: ratio(tasksDone, tasksDue) },
    routines,
    overall: overallDue === 0 ? 1 : overallDone / overallDue,
  };
};
