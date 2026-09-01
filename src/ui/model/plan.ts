/**
 * Pure view models for the Phase 4 plan/reflect pages. Deterministic projections
 * that delegate all computation to Phase 1 logic (goals, tasks). No new schema.
 */
import type { AppData } from "../../domain/appData";
import type { Settings } from "../../domain/settings";
import type { LocalDate } from "../../time/localDate";
import type { GoalHorizon, GoalStatus } from "../../domain/goal";
import type { TaskPriority, TaskStatus } from "../../domain/task";
import type { ProjectStatus } from "../../domain/project";
import {
  rollupProgress,
  childGoals,
} from "../../logic/goals";
import type { GoalIntel } from "../../logic/goalIntelligence";
import { goalIntel, bodyweightSeries } from "../../logic/goalIntelligence";
import { filterTasks, sortByPriority, isActive, isOverdue } from "../../logic/tasks";
import { isHabitDueOn, isHabitCompletedOn } from "../../logic/habits";
import { dayMacros, dayWaterMl } from "../../logic/diet";

// Convert a stored instant to the local calendar day (tolerant of bad input).
const instantDayOf = (ts: string, timeZone: string): LocalDate => {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ts));
    const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "01";
    return `${g("year")}-${g("month")}-${g("day")}` as LocalDate;
  } catch {
    return ts.slice(0, 10) as LocalDate;
  }
};

// ---------------- Goals ----------------

export const GOAL_HORIZONS: readonly GoalHorizon[] = [
  "vision",
  "year",
  "quarter",
  "month",
  "week",
];
export const GOAL_STATUSES: readonly GoalStatus[] = [
  "active",
  "completed",
  "on_hold",
  "archived",
];

export interface MilestoneVM {
  readonly id: string;
  readonly title: string;
  readonly done: boolean;
}
export interface GoalNodeVM {
  readonly id: string;
  readonly name: string;
  readonly horizon: GoalHorizon;
  readonly status: GoalStatus;
  readonly category: string | null;
  readonly metricLabel: string | null;
  readonly hasMetric: boolean;
  readonly metricCurrent: number | null;
  readonly progress: number; // rollup (0..1)
  readonly milestones: readonly MilestoneVM[];
  readonly parentId: string | null;
  readonly depth: number;
  readonly intel: GoalIntel | null; // pace/projection for measurable goals
  readonly metricFromSeries: boolean; // true when current comes from a linked log (e.g. bodyweight)
}
export interface GoalsView {
  readonly goals: readonly GoalNodeVM[]; // tree order (parent before children)
  readonly parentOptions: readonly { readonly id: string; readonly name: string }[];
  readonly isEmpty: boolean;
}

// Format a number without a trailing ".0" but keeping real decimals (45.5).
const fmtNum = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export const buildGoalsView = (data: AppData, today: LocalDate): GoalsView => {
  const nodes: GoalNodeVM[] = [];
  const bwSeries = bodyweightSeries(data);
  const isBodyweightGoal = (g: (typeof data.goals)[number]): boolean =>
    g.metric !== null &&
    ((g.metric.unit ?? "").toLowerCase() === "kg" ||
      (g.metric.unit ?? "").toLowerCase() === "lb" ||
      /weight|kg|bodyweight/i.test(g.name));
  const toNode = (g: (typeof data.goals)[number], depth: number): GoalNodeVM => {
    const usesSeries = g.metric !== null && isBodyweightGoal(g) && bwSeries.length > 0;
    const intel =
      g.metric !== null
        ? goalIntel(g, today, usesSeries ? bwSeries : undefined)
        : null;
    // Single source of truth: when intel resolves a current value from a linked
    // series (e.g. latest bodyweight), the progress bar, metric label, current
    // value and remaining must all use THAT same value — never the stale stored
    // metric.current. Otherwise the card contradicts its own intelligence panel.
    const displayCurrent = intel?.current ?? g.metric?.current ?? null;
    const displayProgress =
      intel !== null && intel.measurable ? intel.progress : rollupProgress(g, data.goals);
    return {
      id: g.id,
      name: g.name,
      horizon: g.horizon,
      status: g.status,
      category: g.category,
      hasMetric: g.metric !== null,
      metricCurrent: displayCurrent,
      metricLabel:
        g.metric !== null
          ? `${fmtNum(displayCurrent ?? 0)} / ${g.metric.target}${g.metric.unit ? " " + g.metric.unit : ""}`
          : null,
      progress: displayProgress,
      milestones: g.milestones.map((m) => ({ id: m.id, title: m.title, done: m.done })),
      parentId: g.parentId,
      depth,
      intel,
      metricFromSeries: usesSeries,
    };
  };
  // DFS from roots so a parent is immediately followed by its descendants.
  const visit = (parentId: string | null, depth: number): void => {
    const kids =
      parentId === null
        ? data.goals.filter((g) => g.parentId === null)
        : childGoals(parentId as (typeof data.goals)[number]["parentId"] & string, data.goals);
    for (const g of kids) {
      nodes.push(toNode(g, depth));
      visit(g.id, depth + 1);
    }
  };
  visit(null, 0);
  // Safety net: include any goals whose parent is missing (orphans) at depth 0.
  const seen = new Set(nodes.map((n) => n.id));
  for (const g of data.goals) {
    if (!seen.has(g.id)) nodes.push(toNode(g, 0));
  }
  return {
    goals: nodes,
    parentOptions: data.goals.map((g) => ({ id: g.id, name: g.name })),
    isEmpty: data.goals.length === 0,
  };
};

// ---------------- Tasks ----------------

export interface SubtaskVM {
  readonly id: string;
  readonly title: string;
  readonly done: boolean;
}
export interface TaskRowVM {
  readonly id: string;
  readonly title: string;
  readonly priority: TaskPriority;
  readonly status: TaskStatus;
  readonly due: LocalDate | null;
  readonly overdue: boolean;
  readonly completed: boolean;
  readonly recurring: boolean;
  readonly goalName: string | null;
  readonly projectName: string | null;
  readonly subtasks: readonly SubtaskVM[];
}
export type TaskBucket = "today" | "upcoming" | "overdue" | "noDate" | "completed";
export interface TasksView {
  readonly buckets: Readonly<Record<TaskBucket, readonly TaskRowVM[]>>;
  readonly counts: Readonly<Record<TaskBucket, number>>;
  readonly goalOptions: readonly { readonly id: string; readonly name: string }[];
  readonly projectOptions: readonly { readonly id: string; readonly name: string }[];
  readonly isEmpty: boolean;
}

export const buildTasksView = (data: AppData, today: LocalDate): TasksView => {
  const goalName = new Map(data.goals.map((g) => [g.id, g.name] as const));
  const projName = new Map(data.projects.map((p) => [p.id, p.name] as const));
  const row = (t: (typeof data.tasks)[number]): TaskRowVM => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    status: t.status,
    due: t.due,
    overdue: isOverdue(t, today),
    completed: t.status === "done",
    recurring: t.recurrence !== null,
    goalName: t.goalId !== null ? goalName.get(t.goalId) ?? null : null,
    projectName: t.projectId !== null ? projName.get(t.projectId) ?? null : null,
    subtasks: t.subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done })),
  });
  const rowsOf = (arr: readonly (typeof data.tasks)[number][]): TaskRowVM[] =>
    sortByPriority(arr).map(row);

  const todayRows = rowsOf(filterTasks(data.tasks, "today", today));
  const upcoming = rowsOf(filterTasks(data.tasks, "upcoming", today));
  const overdue = rowsOf(filterTasks(data.tasks, "overdue", today));
  const noDate = rowsOf(data.tasks.filter((t) => isActive(t) && t.due === null));
  const completed = rowsOf(filterTasks(data.tasks, "completed", today));

  const buckets = { today: todayRows, upcoming, overdue, noDate, completed };
  return {
    buckets,
    counts: {
      today: todayRows.length,
      upcoming: upcoming.length,
      overdue: overdue.length,
      noDate: noDate.length,
      completed: completed.length,
    },
    goalOptions: data.goals.map((g) => ({ id: g.id, name: g.name })),
    projectOptions: data.projects.map((p) => ({ id: p.id, name: p.name })),
    isEmpty: data.tasks.length === 0,
  };
};

// ---------------- Projects ----------------

export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  "active",
  "paused",
  "completed",
  "archived",
];

export interface ProjectVM {
  readonly id: string;
  readonly name: string;
  readonly status: ProjectStatus;
  readonly description: string | null;
  readonly taskCount: number;
  readonly doneCount: number;
  readonly tasks: readonly {
    readonly id: string;
    readonly title: string;
    readonly done: boolean;
    readonly priority: TaskPriority;
  }[];
}
export interface ProjectsView {
  readonly projects: readonly ProjectVM[];
  readonly isEmpty: boolean;
}

export const buildProjectsView = (data: AppData): ProjectsView => ({
  projects: data.projects.map((p) => {
    const tasks = data.tasks.filter((t) => t.projectId === p.id);
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      description: p.description,
      taskCount: tasks.length,
      doneCount: tasks.filter((t) => t.status === "done").length,
      tasks: sortByPriority(tasks).map((t) => ({
        id: t.id,
        title: t.title,
        done: t.status === "done",
        priority: t.priority,
      })),
    };
  }),
  isEmpty: data.projects.length === 0,
});

// ---------------- Journal ----------------

export interface JournalDayVM {
  readonly id: string;
  readonly date: LocalDate;
  readonly accomplished: string | null;
  readonly wentWrong: string | null;
  readonly learned: string | null;
  readonly rating: number | null;
  readonly topPriorityTomorrow: string | null;
}
export interface JournalContext {
  readonly habitsCompleted: number;
  readonly habitsScheduled: number;
  readonly tasksCompleted: number;
  readonly workoutLogged: boolean;
  readonly calories: number | null;
  readonly protein: number | null;
  readonly waterMl: number | null;
  readonly sleepMinutes: number | null;
  readonly bodyweight: number | null;
  readonly readingProgressed: boolean;
  readonly hasAny: boolean;
}
export interface JournalView {
  readonly today: LocalDate;
  readonly todayEntry: JournalDayVM | null;
  readonly history: readonly JournalDayVM[];
  readonly context: JournalContext;
  readonly isEmpty: boolean;
}

const toDay = (e: {
  id: string;
  date: LocalDate;
  accomplished: string | null;
  wentWrong: string | null;
  learned: string | null;
  rating: number | null;
  topPriorityTomorrow: string | null;
}): JournalDayVM => ({
  id: e.id,
  date: e.date,
  accomplished: e.accomplished,
  wentWrong: e.wentWrong,
  learned: e.learned,
  rating: e.rating,
  topPriorityTomorrow: e.topPriorityTomorrow,
});

export const buildJournalView = (data: AppData, today: LocalDate): JournalView => {
  const todayEntry = data.journal.find((e) => e.date === today);
  const history = data.journal
    .filter((e) => e.date !== today)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map(toDay);

  // Today's factual context — derived from existing stored data, no fabrication.
  const activeHabits = data.habits.filter((hh) => hh.active && hh.archivedAt === null);
  const habitsScheduled = activeHabits.filter((hh) => isHabitDueOn(hh, today)).length;
  const habitsCompleted = activeHabits.filter(
    (hh) => isHabitDueOn(hh, today) && isHabitCompletedOn(hh, today, data.habitCompletions),
  ).length;
  const tasksCompleted = data.tasks.filter(
    (t) => t.completedAt !== null && instantDayOf(t.completedAt, data.settings.timeZone) === today,
  ).length;
  const workoutLogged = data.workoutSessions.some((s) => s.date === today && s.completedAt !== null);
  const m = dayMacros(data, today);
  const water = dayWaterMl(data, today);
  const sleepEntry = data.sleepLog.find((s) => s.date === today);
  const bw = data.bodyWeights.filter((w) => w.date === today);
  const readingProgressed = data.reading.some((r) =>
    r.notes.some((n) => (n.at ?? "").slice(0, 10) === today),
  );
  const calories = m.kcal > 0 ? m.kcal : null;
  const protein = m.protein > 0 ? m.protein : null;
  const context: JournalContext = {
    habitsCompleted,
    habitsScheduled,
    tasksCompleted,
    workoutLogged,
    calories,
    protein,
    waterMl: water > 0 ? water : null,
    sleepMinutes: sleepEntry?.durationMinutes ?? null,
    bodyweight: bw.length > 0 ? bw[bw.length - 1]!.weight : null,
    readingProgressed,
    hasAny:
      habitsScheduled > 0 ||
      tasksCompleted > 0 ||
      workoutLogged ||
      calories !== null ||
      water > 0 ||
      sleepEntry !== undefined ||
      bw.length > 0 ||
      readingProgressed,
  };

  return {
    today,
    todayEntry: todayEntry ? toDay(todayEntry) : null,
    history,
    context,
    isEmpty: data.journal.length === 0,
  };
};

// ---------------- Settings & Data ----------------

export interface SettingsView {
  readonly timeZone: string;
  readonly weekStartsOn: number;
  readonly nutrition: Settings["nutrition"];
  readonly sleepTargetMinutes: number;
  readonly counts: readonly { readonly label: string; readonly count: number }[];
}

export const buildSettingsView = (data: AppData): SettingsView => ({
  timeZone: data.settings.timeZone,
  weekStartsOn: data.settings.weekStartsOn,
  nutrition: data.settings.nutrition,
  sleepTargetMinutes: data.settings.sleepTargetMinutes,
  counts: [
    { label: "Goals", count: data.goals.length },
    { label: "Tasks", count: data.tasks.length },
    { label: "Projects", count: data.projects.length },
    { label: "Habits", count: data.habits.length },
    { label: "Workouts", count: data.workoutSessions.length },
    { label: "Meals", count: data.meals.length },
    { label: "Sleep nights", count: data.sleepLog.length },
    { label: "Reading items", count: data.reading.length },
    { label: "Journal days", count: data.journal.length },
  ],
});
