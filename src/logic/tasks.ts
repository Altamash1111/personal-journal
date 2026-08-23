import type { Task } from "../domain/task";
import type { LocalDate } from "../time/localDate";
import type { RecurrenceRule } from "../domain/recurrence";
import { compareLocalDate } from "../time/localDate";
import { PRIORITY_ORDER } from "../config";
import { nextOccurrence } from "./recurrence";

export type TaskView = "today" | "upcoming" | "overdue" | "completed";

/** A task still needing action. */
export const isActive = (t: Task): boolean =>
  t.status === "todo" || t.status === "in_progress";

export const isCompleted = (t: Task): boolean => t.status === "done";

export const isOverdue = (t: Task, today: LocalDate): boolean =>
  isActive(t) && t.due !== null && compareLocalDate(t.due, today) < 0;

export const isDueToday = (t: Task, today: LocalDate): boolean =>
  isActive(t) && t.due !== null && compareLocalDate(t.due, today) === 0;

export const isUpcoming = (t: Task, today: LocalDate): boolean =>
  isActive(t) && t.due !== null && compareLocalDate(t.due, today) > 0;

export const filterTasks = (
  tasks: readonly Task[],
  view: TaskView,
  today: LocalDate,
): readonly Task[] => {
  switch (view) {
    case "today":
      return tasks.filter((t) => isDueToday(t, today) || isOverdue(t, today));
    case "upcoming":
      return tasks.filter((t) => isUpcoming(t, today));
    case "overdue":
      return tasks.filter((t) => isOverdue(t, today));
    case "completed":
      return tasks.filter(isCompleted);
  }
};

/** Sort by priority (urgent first), then earliest due date, stable-ish. */
export const sortByPriority = (tasks: readonly Task[]): readonly Task[] =>
  [...tasks].sort((a, b) => {
    const p = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
    if (p !== 0) return p;
    if (a.due === null && b.due === null) return 0;
    if (a.due === null) return 1;
    if (b.due === null) return -1;
    return compareLocalDate(a.due, b.due);
  });

/** The next due date for a recurring task, based at its current due (or `from`). */
export const nextTaskDue = (
  rule: RecurrenceRule,
  from: LocalDate,
): LocalDate | null => nextOccurrence(rule, from);
