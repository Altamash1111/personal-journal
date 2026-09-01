/**
 * The Today dashboard VIEW MODEL. This is the only place the UI turns app state
 * into screen-ready shapes, and it does so purely — no DOM, no I/O, deterministic
 * given (data, today, hour). Crucially it delegates every DECISION to Phase 1
 * logic (completeness, due-ness, progress, ordering); it never re-derives a
 * business rule. That keeps the "rules live in one place" guarantee from Phase 1
 * intact while the UI stays a thin projection.
 */
import type { AppData } from "../../domain/appData";
import type { Task } from "../../domain/task";
import type { TaskPriority, TaskStatus } from "../../domain/task";
import type { Habit } from "../../domain/habit";
import type { LocalDate } from "../../time/localDate";
import { diffDays, parseLocalDate } from "../../time/localDate";
import type { GoalHorizon } from "../../domain/goal";
import type { DailySummary } from "../../logic/dailySummary";
import type { Settings } from "../../domain/settings";
import type { ModuleStatus } from "../../logic/moduleStatus";
import type { WinterArcState } from "../../logic/winterArc";
import { winterArcState } from "../../logic/winterArc";
import { weekRangeContaining, buildWeeklyReview } from "../../logic/weeklyReview";
import { attentionItems } from "../../logic/scorecard";
import { DEFAULT_SETTINGS } from "../../config";
import { todayModuleStatus } from "../../logic/moduleStatus";

import { computeDailySummary } from "../../logic/dailySummary";
import { filterTasks, sortByPriority, isActive, isOverdue, isDueToday } from "../../logic/tasks";
import {
  isHabitDueOn,
  isHabitCompletedOn,
  habitDayRatio,
  completionsFor,
  currentStreak,
} from "../../logic/habits";
import { isRoutineDueOn, routineProgress } from "../../logic/routines";
import { rollupProgress } from "../../logic/goals";

export interface TaskCardVM {
  readonly id: string;
  readonly title: string;
  readonly priority: TaskPriority;
  readonly status: TaskStatus;
  readonly due: LocalDate | null;
  readonly overdue: boolean;
  readonly done: boolean;
  readonly category: string | null;
  readonly dueLabel: string; // "Overdue" | "Today" | "Tomorrow" | "Mon 27 Aug" | ""
}

export interface HabitRowVM {
  readonly id: string;
  readonly name: string;
  readonly category: string | null;
  readonly measurable: boolean;
  readonly done: boolean;
  readonly current: number;
  readonly target: number | null;
  readonly unit: string | null;
  readonly ratio: number; // 0..1, from Phase 1 habitDayRatio
  readonly streak: number;
}

export type RoutineBucket = "Morning" | "Day" | "Night";

export interface RoutineStepVM {
  readonly habitId: string;
  readonly name: string;
  readonly done: boolean;
}

export interface RoutineVM {
  readonly id: string;
  readonly name: string;
  readonly bucket: RoutineBucket;
  readonly done: number;
  readonly total: number;
  readonly ratio: number;
  readonly steps: readonly RoutineStepVM[];
}

export interface RoutineGroupVM {
  readonly bucket: RoutineBucket;
  readonly routines: readonly RoutineVM[];
}

export interface GoalVM {
  readonly id: string;
  readonly name: string;
  readonly horizon: GoalHorizon;
  readonly percent: number; // 0..100
}

export interface TodayView {
  readonly date: LocalDate;
  readonly greeting: string;
  readonly summary: DailySummary;
  readonly priorities: readonly TaskCardVM[];
  readonly tasks: readonly TaskCardVM[];
  readonly habits: readonly HabitRowVM[];
  readonly routineGroups: readonly RoutineGroupVM[];
  readonly goals: readonly GoalVM[];
  readonly modules: ModuleStatus;
  readonly winterArc: WinterArcState;
  readonly recentPerformance: {
    readonly habitRate: number | null;
    readonly avgRating: number | null;
    readonly tasksCompleted: number;
    readonly hasData: boolean;
  };
  readonly attention: readonly { readonly severity: "warn" | "info"; readonly message: string }[];
  readonly isEmpty: boolean;
}

export const greetingFor = (hour: number): string => {
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Human due label relative to the current day (in the app's timezone). */
const dueLabelFor = (t: Task, today: LocalDate): string => {
  if (t.due === null) return "";
  if (isOverdue(t, today)) return "Overdue";
  const delta = diffDays(today, t.due); // due - today, in whole days
  if (delta === 0) return "Today";
  if (delta === 1) return "Tomorrow";
  const { month, day } = parseLocalDate(t.due);
  return `${MONTHS[month - 1]} ${day}`;
};

const toTaskCard = (t: Task, today: LocalDate): TaskCardVM => ({
  id: t.id,
  title: t.title,
  priority: t.priority,
  status: t.status,
  due: t.due,
  overdue: isOverdue(t, today),
  done: t.status === "done",
  category: t.category,
  dueLabel: dueLabelFor(t, today),
});

const HORIZON_ORDER: Readonly<Record<GoalHorizon, number>> = {
  vision: 0,
  year: 1,
  quarter: 2,
  month: 3,
  week: 4,
};

const bucketForDaypart = (
  daypart: Habit["daypart"] | null,
): RoutineBucket => {
  if (daypart === "morning") return "Morning";
  if (daypart === "evening" || daypart === "night") return "Night";
  return "Day";
};

const BUCKET_ORDER: readonly RoutineBucket[] = ["Morning", "Day", "Night"];

/** Build the full Today view model. `hour` is the user's local hour (0-23). */
export const buildTodayView = (
  data: AppData,
  today: LocalDate,
  hour: number,
  settings: Settings = DEFAULT_SETTINGS,
): TodayView => {
  const summary = computeDailySummary(data, today);
  const modules = todayModuleStatus(data, today, settings);

  // Today's task list = due-today + overdue, still-active, priority-sorted.
  const todayTasks = sortByPriority(filterTasks(data.tasks, "today", today));
  const tasks = todayTasks.map((t) => toTaskCard(t, today));

  // Priorities = the highest-signal actionable tasks: anything due today/overdue,
  // plus any active high/urgent task, sorted by Phase 1 ordering, top 3.
  const prioritySet = data.tasks.filter(
    (t) =>
      isActive(t) &&
      (isDueToday(t, today) ||
        isOverdue(t, today) ||
        t.priority === "high" ||
        t.priority === "urgent"),
  );
  const priorities = sortByPriority(prioritySet)
    .slice(0, 3)
    .map((t) => toTaskCard(t, today));

  // Habit checklist = habits scheduled today; state comes from Phase 1 logic.
  const habits: HabitRowVM[] = data.habits
    .filter((h) => isHabitDueOn(h, today))
    .map((h) => {
      const measurable = h.target !== null;
      const dayCompletions = completionsFor(h.id, today, data.habitCompletions);
      const current = dayCompletions.reduce((acc, c) => acc + (c.amount ?? 0), 0);
      return {
        id: h.id,
        name: h.name,
        category: h.category,
        measurable,
        done: isHabitCompletedOn(h, today, data.habitCompletions),
        current: measurable ? current : dayCompletions.length,
        target: h.target?.amount ?? null,
        unit: h.target?.unit ?? null,
        ratio: habitDayRatio(h, today, data.habitCompletions),
        streak: currentStreak(h, data.habitCompletions, today),
      };
    });

  // Routines due today, grouped into Morning / Day / Night.
  const habitName = new Map(data.habits.map((h) => [h.id, h.name] as const));
  const routineVMs: RoutineVM[] = data.routines
    .filter((r) => isRoutineDueOn(r, today))
    .map((r) => {
      const p = routineProgress(r, today, data.habits, data.habitCompletions);
      const steps: RoutineStepVM[] = [...r.steps]
        .sort((a, b) => a.order - b.order)
        .flatMap((s) => {
          const name = habitName.get(s.habitId);
          if (name === undefined) return [];
          const h = data.habits.find((x) => x.id === s.habitId)!;
          return [
            {
              habitId: s.habitId,
              name,
              done: isHabitCompletedOn(h, today, data.habitCompletions),
            },
          ];
        });
      return {
        id: r.id,
        name: r.name,
        bucket: bucketForDaypart(r.daypart),
        done: p.done,
        total: p.total,
        ratio: p.ratio,
        steps,
      };
    });

  const routineGroups: RoutineGroupVM[] = BUCKET_ORDER.map((bucket) => ({
    bucket,
    routines: routineVMs.filter((r) => r.bucket === bucket),
  })).filter((g) => g.routines.length > 0);

  // Goals with transparent Phase 1 progress (rollup falls back to own progress).
  const goals: GoalVM[] = data.goals
    .filter((g) => g.status !== "archived")
    .slice()
    .sort((a, b) => HORIZON_ORDER[a.horizon] - HORIZON_ORDER[b.horizon])
    .map((g) => {
      // rollupProgress delegates to the canonical goalProgress rule at the leaves.
      const frac = g.status === "completed" ? 1 : rollupProgress(g, data.goals);
      return {
        id: g.id,
        name: g.name,
        horizon: g.horizon,
        percent: Math.round(frac * 100),
      };
    })
    .slice(0, 6);

  const isEmpty =
    data.tasks.length === 0 &&
    data.habits.length === 0 &&
    data.routines.length === 0 &&
    data.goals.length === 0;

  return {
    date: today,
    greeting: greetingFor(hour),
    summary,
    priorities,
    tasks,
    habits,
    routineGroups,
    goals,
    modules,
    winterArc: winterArcState(today),
    recentPerformance: (() => {
      const range = weekRangeContaining(today, settings.weekStartsOn);
      const wr = buildWeeklyReview(data, range, settings.timeZone);
      return {
        habitRate: wr.habitRate,
        avgRating: wr.ratings.average,
        tasksCompleted: wr.tasks.completed,
        hasData: wr.hasData,
      };
    })(),
    attention: (() => {
      const range = weekRangeContaining(today, settings.weekStartsOn);
      const wr = buildWeeklyReview(data, range, settings.timeZone);
      // Only surface warnings on Home; keep it calm. Cap at 3.
      return attentionItems(data, wr, today)
        .filter((a) => a.severity === "warn")
        .slice(0, 3)
        .map((a) => ({ severity: a.severity, message: a.message }));
    })(),
    isEmpty,
  };
};
