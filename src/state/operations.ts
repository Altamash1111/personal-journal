import type { AppData } from "../domain/appData";
import type {
  Goal,
  GoalHorizon,
  GoalMetric,
  GoalStatus,
  Milestone,
} from "../domain/goal";
import type {
  Task,
  TaskPriority,
  Subtask,
} from "../domain/task";
import type {
  Habit,
  HabitCompletion,
  HabitTarget,
  ReminderMeta,
} from "../domain/habit";
import type { Routine, RoutineStep } from "../domain/routine";
import type { Project, ProjectStatus } from "../domain/project";
import type { JournalEntry } from "../domain/journal";
import type { Settings } from "../domain/settings";
import type { RecurrenceRule } from "../domain/recurrence";
import type { Daypart } from "../domain/common";
import type {
  GoalId,
  HabitCompletionId,
  HabitId,
  MilestoneId,
  JournalEntryId,
  ProjectId,
  RoutineId,
  SubtaskId,
  TaskId,
} from "../domain/ids";
import type { LocalDate } from "../time/localDate";
import type { OpDeps } from "./helpers";
import { newId, stamp, upsertById, removeById, findById } from "./helpers";
import { nextOccurrence } from "../logic/recurrence";
import { completionsFor } from "../logic/habits";

/*
 * Pure reducers over AppData. Each returns a NEW AppData (never mutates input).
 * Creates also return the created entity for convenience. All timestamps + ids
 * come from injected deps, so operations are deterministic under a fixed clock.
 */

// ---------- Goals ----------

export interface CreateGoalInput {
  readonly horizon: GoalHorizon;
  readonly name: string;
  readonly parentId?: GoalId | null;
  readonly description?: string | null;
  readonly category?: string | null;
  readonly metric?: GoalMetric | null;
  readonly deadline?: LocalDate | null;
  readonly status?: GoalStatus;
  readonly notes?: string | null;
}

export const createGoal = (
  deps: OpDeps,
  data: AppData,
  input: CreateGoalInput,
): { readonly data: AppData; readonly goal: Goal } => {
  const ts = stamp(deps);
  const goal: Goal = {
    id: newId<GoalId>(deps),
    horizon: input.horizon,
    parentId: input.parentId ?? null,
    name: input.name,
    description: input.description ?? null,
    category: input.category ?? null,
    metric: input.metric ?? null,
    deadline: input.deadline ?? null,
    status: input.status ?? "active",
    milestones: [],
    notes: input.notes ?? null,
    createdAt: ts,
    updatedAt: ts,
  };
  return { data: { ...data, goals: upsertById(data.goals, goal) }, goal };
};

export type GoalPatch = Partial<
  Omit<Goal, "id" | "createdAt" | "updatedAt">
>;

export const updateGoal = (
  deps: OpDeps,
  data: AppData,
  id: GoalId,
  patch: GoalPatch,
): AppData => {
  const existing = findById(data.goals, id);
  if (existing === undefined) return data;
  const updated: Goal = { ...existing, ...patch, updatedAt: stamp(deps) };
  return { ...data, goals: upsertById(data.goals, updated) };
};

export const addMilestone = (
  deps: OpDeps,
  data: AppData,
  goalId: GoalId,
  input: { readonly title: string; readonly targetDate?: LocalDate | null },
): AppData => {
  const existing = findById(data.goals, goalId);
  if (existing === undefined) return data;
  const milestone: Milestone = {
    id: newId(deps),
    title: input.title,
    done: false,
    targetDate: input.targetDate ?? null,
    completedAt: null,
  };
  const updated: Goal = {
    ...existing,
    milestones: [...existing.milestones, milestone],
    updatedAt: stamp(deps),
  };
  return { ...data, goals: upsertById(data.goals, updated) };
};

export const removeGoal = (
  _deps: OpDeps,
  data: AppData,
  id: GoalId,
): AppData => ({ ...data, goals: removeById(data.goals, id) });

// ---------- Tasks ----------

export interface CreateTaskInput {
  readonly title: string;
  readonly description?: string | null;
  readonly due?: LocalDate | null;
  readonly priority?: TaskPriority;
  readonly category?: string | null;
  readonly estimateMinutes?: number | null;
  readonly recurrence?: RecurrenceRule | null;
  readonly notes?: string | null;
  readonly goalId?: GoalId | null;
  readonly projectId?: ProjectId | null;
}

export const createTask = (
  deps: OpDeps,
  data: AppData,
  input: CreateTaskInput,
): { readonly data: AppData; readonly task: Task } => {
  const ts = stamp(deps);
  const task: Task = {
    id: newId<TaskId>(deps),
    title: input.title,
    description: input.description ?? null,
    due: input.due ?? null,
    priority: input.priority ?? "none",
    category: input.category ?? null,
    estimateMinutes: input.estimateMinutes ?? null,
    status: "todo",
    recurrence: input.recurrence ?? null,
    subtasks: [],
    notes: input.notes ?? null,
    goalId: input.goalId ?? null,
    projectId: input.projectId ?? null,
    completedAt: null,
    createdAt: ts,
    updatedAt: ts,
  };
  return { data: { ...data, tasks: upsertById(data.tasks, task) }, task };
};

export type TaskPatch = Partial<
  Omit<Task, "id" | "createdAt" | "updatedAt">
>;

export const updateTask = (
  deps: OpDeps,
  data: AppData,
  id: TaskId,
  patch: TaskPatch,
): AppData => {
  const existing = findById(data.tasks, id);
  if (existing === undefined) return data;
  const updated: Task = { ...existing, ...patch, updatedAt: stamp(deps) };
  return { ...data, tasks: upsertById(data.tasks, updated) };
};

export const addSubtask = (
  deps: OpDeps,
  data: AppData,
  taskId: TaskId,
  title: string,
): AppData => {
  const existing = findById(data.tasks, taskId);
  if (existing === undefined) return data;
  const subtask: Subtask = { id: newId<SubtaskId>(deps), title, done: false };
  const updated: Task = {
    ...existing,
    subtasks: [...existing.subtasks, subtask],
    updatedAt: stamp(deps),
  };
  return { ...data, tasks: upsertById(data.tasks, updated) };
};

/**
 * Mark a task done. If it is recurring and has a due date, spawn the next
 * occurrence as a fresh todo (subtasks reset), so recurring tasks keep flowing.
 */
export const completeTask = (
  deps: OpDeps,
  data: AppData,
  id: TaskId,
): { readonly data: AppData; readonly spawned: Task | null } => {
  const existing = findById(data.tasks, id);
  if (existing === undefined) return { data, spawned: null };
  const ts = stamp(deps);
  const done: Task = {
    ...existing,
    status: "done",
    completedAt: ts,
    updatedAt: ts,
  };
  let tasks = upsertById(data.tasks, done);
  let spawned: Task | null = null;
  if (existing.recurrence !== null && existing.due !== null) {
    const next = nextOccurrence(existing.recurrence, existing.due);
    if (next !== null) {
      spawned = {
        ...existing,
        id: newId<TaskId>(deps),
        due: next,
        status: "todo",
        completedAt: null,
        subtasks: existing.subtasks.map((s) => ({
          id: newId<SubtaskId>(deps),
          title: s.title,
          done: false,
        })),
        createdAt: ts,
        updatedAt: ts,
      };
      tasks = upsertById(tasks, spawned);
    }
  }
  return { data: { ...data, tasks }, spawned };
};

export const removeTask = (
  _deps: OpDeps,
  data: AppData,
  id: TaskId,
): AppData => ({ ...data, tasks: removeById(data.tasks, id) });

// ---------- Habits ----------

export interface CreateHabitInput {
  readonly name: string;
  readonly schedule: RecurrenceRule;
  readonly category?: string | null;
  readonly daypart?: Daypart;
  readonly active?: boolean;
  readonly target?: HabitTarget | null;
  readonly reminder?: ReminderMeta | null;
}

export const createHabit = (
  deps: OpDeps,
  data: AppData,
  input: CreateHabitInput,
): { readonly data: AppData; readonly habit: Habit } => {
  const ts = stamp(deps);
  const habit: Habit = {
    id: newId<HabitId>(deps),
    name: input.name,
    category: input.category ?? null,
    schedule: input.schedule,
    daypart: input.daypart ?? "anytime",
    active: input.active ?? true,
    target: input.target ?? null,
    reminder: input.reminder ?? null,
    createdAt: ts,
    updatedAt: ts,
    archivedAt: null,
  };
  return { data: { ...data, habits: upsertById(data.habits, habit) }, habit };
};

export type HabitPatch = Partial<
  Omit<Habit, "id" | "createdAt" | "updatedAt">
>;

export const updateHabit = (
  deps: OpDeps,
  data: AppData,
  id: HabitId,
  patch: HabitPatch,
): AppData => {
  const existing = findById(data.habits, id);
  if (existing === undefined) return data;
  const updated: Habit = { ...existing, ...patch, updatedAt: stamp(deps) };
  return { ...data, habits: upsertById(data.habits, updated) };
};

export const archiveHabit = (
  deps: OpDeps,
  data: AppData,
  id: HabitId,
): AppData => {
  const existing = findById(data.habits, id);
  if (existing === undefined) return data;
  const ts = stamp(deps);
  const updated: Habit = {
    ...existing,
    active: false,
    archivedAt: ts,
    updatedAt: ts,
  };
  return { ...data, habits: upsertById(data.habits, updated) };
};

/** Explicit delete cascades this habit’s completion events (intended, not silent
 *  loss — it is a direct user delete). Routine steps referencing it are left in
 *  place and simply ignored by routine progress. */
export const removeHabit = (
  _deps: OpDeps,
  data: AppData,
  id: HabitId,
): AppData => ({
  ...data,
  habits: removeById(data.habits, id),
  habitCompletions: data.habitCompletions.filter((c) => c.habitId !== id),
});

export const logHabitCompletion = (
  deps: OpDeps,
  data: AppData,
  habitId: HabitId,
  date: LocalDate,
  input?: { readonly amount?: number | null; readonly note?: string | null },
): { readonly data: AppData; readonly completion: HabitCompletion } => {
  const completion: HabitCompletion = {
    id: newId<HabitCompletionId>(deps),
    habitId,
    date,
    amount: input?.amount ?? null,
    completedAt: stamp(deps),
    note: input?.note ?? null,
  };
  return {
    data: {
      ...data,
      habitCompletions: [...data.habitCompletions, completion],
    },
    completion,
  };
};

export const removeHabitCompletion = (
  _deps: OpDeps,
  data: AppData,
  completionId: HabitCompletionId,
): AppData => ({
  ...data,
  habitCompletions: removeById(data.habitCompletions, completionId),
});

/**
 * One-tap check/uncheck for a plain habit on a day. Checking adds a single
 * completion event (only if none exists); unchecking removes all that day’s
 * events for the habit. (Measurable habits use logHabitCompletion instead.)
 */
export const setHabitChecked = (
  deps: OpDeps,
  data: AppData,
  habitId: HabitId,
  date: LocalDate,
  checked: boolean,
): AppData => {
  const existing = completionsFor(habitId, date, data.habitCompletions);
  if (checked) {
    if (existing.length > 0) return data;
    return logHabitCompletion(deps, data, habitId, date).data;
  }
  if (existing.length === 0) return data;
  const ids = new Set(existing.map((c) => c.id));
  return {
    ...data,
    habitCompletions: data.habitCompletions.filter((c) => !ids.has(c.id)),
  };
};

// ---------- Routines ----------

export interface CreateRoutineInput {
  readonly name: string;
  readonly schedule: RecurrenceRule;
  readonly daypart?: Daypart | null;
  readonly active?: boolean;
  readonly steps?: readonly { readonly habitId: HabitId; readonly order?: number }[];
}

export const createRoutine = (
  deps: OpDeps,
  data: AppData,
  input: CreateRoutineInput,
): { readonly data: AppData; readonly routine: Routine } => {
  const ts = stamp(deps);
  const steps: RoutineStep[] = (input.steps ?? []).map((s, i) => ({
    id: newId(deps),
    habitId: s.habitId,
    order: s.order ?? i,
  }));
  const routine: Routine = {
    id: newId<RoutineId>(deps),
    name: input.name,
    daypart: input.daypart ?? null,
    schedule: input.schedule,
    steps,
    active: input.active ?? true,
    createdAt: ts,
    updatedAt: ts,
  };
  return {
    data: { ...data, routines: upsertById(data.routines, routine) },
    routine,
  };
};

export type RoutinePatch = Partial<
  Omit<Routine, "id" | "createdAt" | "updatedAt">
>;

export const updateRoutine = (
  deps: OpDeps,
  data: AppData,
  id: RoutineId,
  patch: RoutinePatch,
): AppData => {
  const existing = findById(data.routines, id);
  if (existing === undefined) return data;
  const updated: Routine = { ...existing, ...patch, updatedAt: stamp(deps) };
  return { ...data, routines: upsertById(data.routines, updated) };
};

export const removeRoutine = (
  _deps: OpDeps,
  data: AppData,
  id: RoutineId,
): AppData => ({ ...data, routines: removeById(data.routines, id) });

// ---------- Projects ----------

export interface CreateProjectInput {
  readonly name: string;
  readonly description?: string | null;
  readonly status?: ProjectStatus;
  readonly notes?: string | null;
}

export const createProject = (
  deps: OpDeps,
  data: AppData,
  input: CreateProjectInput,
): { readonly data: AppData; readonly project: Project } => {
  const ts = stamp(deps);
  const project: Project = {
    id: newId<ProjectId>(deps),
    name: input.name,
    description: input.description ?? null,
    status: input.status ?? "active",
    notes: input.notes ?? null,
    createdAt: ts,
    updatedAt: ts,
  };
  return {
    data: { ...data, projects: upsertById(data.projects, project) },
    project,
  };
};

export type ProjectPatch = Partial<
  Omit<Project, "id" | "createdAt" | "updatedAt">
>;

export const updateProject = (
  deps: OpDeps,
  data: AppData,
  id: ProjectId,
  patch: ProjectPatch,
): AppData => {
  const existing = findById(data.projects, id);
  if (existing === undefined) return data;
  const updated: Project = { ...existing, ...patch, updatedAt: stamp(deps) };
  return { ...data, projects: upsertById(data.projects, updated) };
};

export const removeProject = (
  _deps: OpDeps,
  data: AppData,
  id: ProjectId,
): AppData => ({ ...data, projects: removeById(data.projects, id) });

// ---------- Journal (dated reflection, one entry per day) ----------

export interface JournalPatch {
  readonly accomplished?: string | null;
  readonly wentWrong?: string | null;
  readonly learned?: string | null;
  readonly rating?: number | null;
  readonly topPriorityTomorrow?: string | null;
}

export const upsertJournalEntry = (
  deps: OpDeps,
  data: AppData,
  date: LocalDate,
  patch: JournalPatch,
): { readonly data: AppData; readonly entry: JournalEntry } => {
  const ts = stamp(deps);
  const existing = data.journal.find((e) => e.date === date);
  const entry: JournalEntry =
    existing === undefined
      ? {
          id: newId(deps),
          date,
          accomplished: patch.accomplished ?? null,
          wentWrong: patch.wentWrong ?? null,
          learned: patch.learned ?? null,
          rating: patch.rating ?? null,
          topPriorityTomorrow: patch.topPriorityTomorrow ?? null,
          createdAt: ts,
          updatedAt: ts,
        }
      : {
          ...existing,
          accomplished: patch.accomplished ?? existing.accomplished,
          wentWrong: patch.wentWrong ?? existing.wentWrong,
          learned: patch.learned ?? existing.learned,
          rating: patch.rating ?? existing.rating,
          topPriorityTomorrow:
            patch.topPriorityTomorrow ?? existing.topPriorityTomorrow,
          updatedAt: ts,
        };
  return { data: { ...data, journal: upsertById(data.journal, entry) }, entry };
};

// ---------- Settings ----------

export const updateSettings = (
  _deps: OpDeps,
  data: AppData,
  patch: Partial<Settings>,
): AppData => ({ ...data, settings: { ...data.settings, ...patch } });

/* ============================================================================
 * Phase 3 — module operations. Same rules: pure reducers, ids/timestamps from
 * deps, return new AppData. Creates return the created entity for convenience.
 * ==========================================================================*/

import type {
  Exercise,
  ExerciseKind,
  LoadUnit,
  WorkoutSession,
  SessionExercise,
  SetEntry,
  BodyWeightEntry,
  MeasurementEntry,
} from "../domain/fitness";
import type {
  MealEntry,
  MealItem,
  MealType,
  Macros,
  FoodItem,
  WaterEntry,
} from "../domain/diet";
import type { SleepEntry } from "../domain/sleep";
import type {
  ReadingItem,
  ReadingKind,
  ReadingStatus,
  ProgressUnit,
  ReadingNote,
  LearningLogEntry,
} from "../domain/reading";
import type {
  ExerciseId,
  WorkoutSessionId,
  SessionExerciseId,
  SetEntryId,
  BodyWeightId,
  MeasurementId,
  FoodId,
  MealId,
  MealItemId,
  WaterEntryId,
  SleepEntryId,
  ReadingItemId,
  ReadingNoteId,
} from "../domain/ids";

// ---------- Fitness: exercises ----------

export interface CreateExerciseInput {
  readonly name: string;
  readonly kind?: ExerciseKind;
  readonly loadUnit?: LoadUnit | null;
  readonly category?: string | null;
  readonly notes?: string | null;
}

export const createExercise = (
  deps: OpDeps,
  data: AppData,
  input: CreateExerciseInput,
): { readonly data: AppData; readonly exercise: Exercise } => {
  const ts = stamp(deps);
  const exercise: Exercise = {
    id: newId<ExerciseId>(deps),
    name: input.name,
    kind: input.kind ?? "strength",
    loadUnit: input.loadUnit ?? "kg",
    category: input.category ?? null,
    notes: input.notes ?? null,
    archived: false,
    createdAt: ts,
    updatedAt: ts,
  };
  return {
    data: { ...data, exercises: upsertById(data.exercises, exercise) },
    exercise,
  };
};

export const removeExercise = (
  _deps: OpDeps,
  data: AppData,
  id: ExerciseId,
): AppData => ({ ...data, exercises: removeById(data.exercises, id) });

// ---------- Fitness: workout sessions ----------

export interface CreateWorkoutSessionInput {
  readonly date: LocalDate;
  readonly name?: string | null;
  readonly note?: string | null;
}

export const createWorkoutSession = (
  deps: OpDeps,
  data: AppData,
  input: CreateWorkoutSessionInput,
): { readonly data: AppData; readonly session: WorkoutSession } => {
  const ts = stamp(deps);
  const session: WorkoutSession = {
    id: newId<WorkoutSessionId>(deps),
    date: input.date,
    planId: null,
    name: input.name ?? null,
    exercises: [],
    note: input.note ?? null,
    startedAt: ts,
    completedAt: null,
    createdAt: ts,
    updatedAt: ts,
  };
  return {
    data: { ...data, workoutSessions: upsertById(data.workoutSessions, session) },
    session,
  };
};

const patchSession = (
  deps: OpDeps,
  data: AppData,
  id: WorkoutSessionId,
  fn: (s: WorkoutSession) => WorkoutSession,
): AppData => {
  const existing = findById(data.workoutSessions, id);
  if (existing === undefined) return data;
  const updated = { ...fn(existing), updatedAt: stamp(deps) };
  return { ...data, workoutSessions: upsertById(data.workoutSessions, updated) };
};

export const addSessionExercise = (
  deps: OpDeps,
  data: AppData,
  sessionId: WorkoutSessionId,
  exerciseId: ExerciseId,
): AppData =>
  patchSession(deps, data, sessionId, (s) => {
    const se: SessionExercise = {
      id: newId<SessionExerciseId>(deps),
      exerciseId,
      sets: [],
      note: null,
      order: s.exercises.length,
    };
    return { ...s, exercises: [...s.exercises, se] };
  });

export const addSet = (
  deps: OpDeps,
  data: AppData,
  sessionId: WorkoutSessionId,
  sessionExerciseId: SessionExerciseId,
  input: { readonly reps: number | null; readonly weight: number | null },
): AppData =>
  patchSession(deps, data, sessionId, (s) => ({
    ...s,
    exercises: s.exercises.map((se) =>
      se.id === sessionExerciseId
        ? {
            ...se,
            sets: [
              ...se.sets,
              {
                id: newId<SetEntryId>(deps),
                reps: input.reps,
                weight: input.weight,
                completed: true,
              } satisfies SetEntry,
            ],
          }
        : se,
    ),
  }));

export const setSetCompleted = (
  deps: OpDeps,
  data: AppData,
  sessionId: WorkoutSessionId,
  sessionExerciseId: SessionExerciseId,
  setId: SetEntryId,
  completed: boolean,
): AppData =>
  patchSession(deps, data, sessionId, (s) => ({
    ...s,
    exercises: s.exercises.map((se) =>
      se.id === sessionExerciseId
        ? {
            ...se,
            sets: se.sets.map((x) => (x.id === setId ? { ...x, completed } : x)),
          }
        : se,
    ),
  }));

export const removeSet = (
  deps: OpDeps,
  data: AppData,
  sessionId: WorkoutSessionId,
  sessionExerciseId: SessionExerciseId,
  setId: SetEntryId,
): AppData =>
  patchSession(deps, data, sessionId, (s) => ({
    ...s,
    exercises: s.exercises.map((se) =>
      se.id === sessionExerciseId
        ? { ...se, sets: se.sets.filter((x) => x.id !== setId) }
        : se,
    ),
  }));

export const completeWorkoutSession = (
  deps: OpDeps,
  data: AppData,
  id: WorkoutSessionId,
): AppData => patchSession(deps, data, id, (s) => ({ ...s, completedAt: stamp(deps) }));

export const removeWorkoutSession = (
  _deps: OpDeps,
  data: AppData,
  id: WorkoutSessionId,
): AppData => ({
  ...data,
  workoutSessions: removeById(data.workoutSessions, id),
});

// ---------- Fitness: body weight + measurements ----------

export const logBodyWeight = (
  deps: OpDeps,
  data: AppData,
  input: {
    readonly date: LocalDate;
    readonly weight: number;
    readonly unit?: LoadUnit;
    readonly note?: string | null;
  },
): { readonly data: AppData; readonly entry: BodyWeightEntry } => {
  const entry: BodyWeightEntry = {
    id: newId<BodyWeightId>(deps),
    date: input.date,
    weight: input.weight,
    unit: input.unit ?? "kg",
    note: input.note ?? null,
    recordedAt: stamp(deps),
  };
  return {
    data: { ...data, bodyWeights: [...data.bodyWeights, entry] },
    entry,
  };
};

export const removeBodyWeight = (
  _deps: OpDeps,
  data: AppData,
  id: BodyWeightId,
): AppData => ({ ...data, bodyWeights: removeById(data.bodyWeights, id) });

export const logMeasurement = (
  deps: OpDeps,
  data: AppData,
  input: {
    readonly date: LocalDate;
    readonly site: string;
    readonly value: number;
    readonly unit?: string;
    readonly note?: string | null;
  },
): { readonly data: AppData; readonly entry: MeasurementEntry } => {
  const entry: MeasurementEntry = {
    id: newId<MeasurementId>(deps),
    date: input.date,
    site: input.site,
    value: input.value,
    unit: input.unit ?? "cm",
    note: input.note ?? null,
    recordedAt: stamp(deps),
  };
  return {
    data: { ...data, measurements: [...data.measurements, entry] },
    entry,
  };
};

export const removeMeasurement = (
  _deps: OpDeps,
  data: AppData,
  id: MeasurementId,
): AppData => ({ ...data, measurements: removeById(data.measurements, id) });

// ---------- Diet ----------

export interface CreateFoodInput {
  readonly name: string;
  readonly serving?: string | null;
  readonly per: Macros;
}

export const createFood = (
  deps: OpDeps,
  data: AppData,
  input: CreateFoodInput,
): { readonly data: AppData; readonly food: FoodItem } => {
  const ts = stamp(deps);
  const food: FoodItem = {
    id: newId<FoodId>(deps),
    name: input.name,
    serving: input.serving ?? null,
    per: input.per,
    archived: false,
    createdAt: ts,
    updatedAt: ts,
  };
  return { data: { ...data, foods: upsertById(data.foods, food) }, food };
};

export interface LogMealInput {
  readonly date: LocalDate;
  readonly type: MealType;
  readonly name: string;
  readonly macros: Macros;
  readonly quantity?: number;
  readonly foodId?: FoodId | null;
  readonly note?: string | null;
}

/** Log a meal as a single-item entry. Daily totals sum across all entries, so a
 *  meal can also be several separate logs; this keeps the common case one tap. */
export const logMeal = (
  deps: OpDeps,
  data: AppData,
  input: LogMealInput,
): { readonly data: AppData; readonly meal: MealEntry } => {
  const ts = stamp(deps);
  const item: MealItem = {
    id: newId<MealItemId>(deps),
    foodId: input.foodId ?? null,
    name: input.name,
    quantity: input.quantity ?? 1,
    macros: input.macros,
  };
  const meal: MealEntry = {
    id: newId<MealId>(deps),
    date: input.date,
    type: input.type,
    items: [item],
    note: input.note ?? null,
    loggedAt: ts,
    createdAt: ts,
    updatedAt: ts,
  };
  return { data: { ...data, meals: upsertById(data.meals, meal) }, meal };
};

export const removeMeal = (
  _deps: OpDeps,
  data: AppData,
  id: MealId,
): AppData => ({ ...data, meals: removeById(data.meals, id) });

export const logWater = (
  deps: OpDeps,
  data: AppData,
  input: { readonly date: LocalDate; readonly amountMl: number },
): { readonly data: AppData; readonly entry: WaterEntry } => {
  const entry: WaterEntry = {
    id: newId<WaterEntryId>(deps),
    date: input.date,
    amountMl: input.amountMl,
    loggedAt: stamp(deps),
  };
  return { data: { ...data, waterLog: [...data.waterLog, entry] }, entry };
};

export const removeWater = (
  _deps: OpDeps,
  data: AppData,
  id: WaterEntryId,
): AppData => ({ ...data, waterLog: removeById(data.waterLog, id) });

// ---------- Sleep (one entry per night, keyed by wake date) ----------

export interface LogSleepInput {
  readonly date: LocalDate;
  readonly durationMinutes: number;
  readonly bedtime?: string | null;
  readonly wakeTime?: string | null;
  readonly quality?: number | null;
  readonly note?: string | null;
}

export const logSleep = (
  deps: OpDeps,
  data: AppData,
  input: LogSleepInput,
): { readonly data: AppData; readonly entry: SleepEntry } => {
  const ts = stamp(deps);
  const existing = data.sleepLog.find((s) => s.date === input.date);
  const entry: SleepEntry =
    existing === undefined
      ? {
          id: newId<SleepEntryId>(deps),
          date: input.date,
          bedtime: input.bedtime ?? null,
          wakeTime: input.wakeTime ?? null,
          durationMinutes: input.durationMinutes,
          quality: input.quality ?? null,
          note: input.note ?? null,
          createdAt: ts,
          updatedAt: ts,
        }
      : {
          ...existing,
          bedtime: input.bedtime ?? existing.bedtime,
          wakeTime: input.wakeTime ?? existing.wakeTime,
          durationMinutes: input.durationMinutes,
          quality: input.quality ?? existing.quality,
          note: input.note ?? existing.note,
          updatedAt: ts,
        };
  return { data: { ...data, sleepLog: upsertById(data.sleepLog, entry) }, entry };
};

export const removeSleep = (
  _deps: OpDeps,
  data: AppData,
  id: SleepEntryId,
): AppData => ({ ...data, sleepLog: removeById(data.sleepLog, id) });

// ---------- Reading & learning ----------

export interface CreateReadingItemInput {
  readonly kind: ReadingKind;
  readonly title: string;
  readonly author?: string | null;
  readonly url?: string | null;
  readonly unit?: ProgressUnit;
  readonly total?: number | null;
  readonly status?: ReadingStatus;
}

export const createReadingItem = (
  deps: OpDeps,
  data: AppData,
  input: CreateReadingItemInput,
): { readonly data: AppData; readonly item: ReadingItem } => {
  const ts = stamp(deps);
  const item: ReadingItem = {
    id: newId<ReadingItemId>(deps),
    kind: input.kind,
    title: input.title,
    author: input.author ?? null,
    url: input.url ?? null,
    status: input.status ?? "upcoming",
    unit: input.unit ?? (input.kind === "book" ? "pages" : "minutes"),
    total: input.total ?? null,
    current: 0,
    notes: [],
    startedAt: null,
    finishedAt: null,
    createdAt: ts,
    updatedAt: ts,
  };
  return { data: { ...data, reading: upsertById(data.reading, item) }, item };
};

const patchReading = (
  deps: OpDeps,
  data: AppData,
  id: ReadingItemId,
  fn: (r: ReadingItem) => ReadingItem,
): AppData => {
  const existing = findById(data.reading, id);
  if (existing === undefined) return data;
  const updated = { ...fn(existing), updatedAt: stamp(deps) };
  return { ...data, reading: upsertById(data.reading, updated) };
};

/**
 * Update reading progress. Moving above zero starts the item (status current +
 * startedAt); reaching the total finishes it (status finished + finishedAt).
 * Status transitions are derived here so the UI never has to special-case them.
 */
export const updateReadingProgress = (
  deps: OpDeps,
  data: AppData,
  id: ReadingItemId,
  current: number,
  today: LocalDate,
): AppData =>
  patchReading(deps, data, id, (r) => {
    const clamped = Math.max(0, current);
    const total =
      r.unit === "percent" ? 100 : r.total !== null ? r.total : null;
    const finished = total !== null && clamped >= total;
    const status: ReadingStatus = finished
      ? "finished"
      : clamped > 0
        ? "current"
        : r.status === "finished"
          ? "current"
          : r.status;
    return {
      ...r,
      current: total !== null ? Math.min(clamped, total) : clamped,
      status,
      startedAt: r.startedAt ?? (clamped > 0 ? today : null),
      finishedAt: finished ? (r.finishedAt ?? today) : null,
    };
  });

export const setReadingStatus = (
  deps: OpDeps,
  data: AppData,
  id: ReadingItemId,
  status: ReadingStatus,
  today: LocalDate,
): AppData =>
  patchReading(deps, data, id, (r) => ({
    ...r,
    status,
    startedAt:
      status !== "upcoming" ? (r.startedAt ?? today) : r.startedAt,
    finishedAt:
      status === "finished" ? (r.finishedAt ?? today) : null,
    current:
      status === "finished" && r.total !== null ? r.total : r.current,
  }));

export const addReadingNote = (
  deps: OpDeps,
  data: AppData,
  id: ReadingItemId,
  input: { readonly text: string; readonly location?: number | null },
): AppData =>
  patchReading(deps, data, id, (r) => {
    const note: ReadingNote = {
      id: newId<ReadingNoteId>(deps),
      at: stamp(deps),
      text: input.text,
      location: input.location ?? null,
    };
    return { ...r, notes: [...r.notes, note] };
  });

export const removeReadingItem = (
  _deps: OpDeps,
  data: AppData,
  id: ReadingItemId,
): AppData => ({ ...data, reading: removeById(data.reading, id) });

export interface AddLearningLogInput {
  readonly date: LocalDate;
  readonly text: string;
  readonly topic?: string | null;
}

export const addLearningLog = (
  deps: OpDeps,
  data: AppData,
  input: AddLearningLogInput,
): { readonly data: AppData; readonly entry: LearningLogEntry } => {
  const entry: LearningLogEntry = {
    id: newId(deps),
    date: input.date,
    topic: input.topic ?? null,
    text: input.text,
    createdAt: stamp(deps),
  };
  return {
    data: { ...data, learningLog: [...data.learningLog, entry] },
    entry,
  };
};

// ---------- Routine steps (add/remove a habit to/from a routine) ----------

export const addRoutineStep = (
  deps: OpDeps,
  data: AppData,
  routineId: RoutineId,
  habitId: HabitId,
): AppData => {
  const existing = findById(data.routines, routineId);
  if (existing === undefined) return data;
  const step: RoutineStep = {
    id: newId(deps),
    habitId,
    order: existing.steps.length,
  };
  const updated: Routine = {
    ...existing,
    steps: [...existing.steps, step],
    updatedAt: stamp(deps),
  };
  return { ...data, routines: upsertById(data.routines, updated) };
};

export const removeRoutineStep = (
  deps: OpDeps,
  data: AppData,
  routineId: RoutineId,
  stepId: string,
): AppData => {
  const existing = findById(data.routines, routineId);
  if (existing === undefined) return data;
  const updated: Routine = {
    ...existing,
    steps: existing.steps.filter((s) => s.id !== stepId),
    updatedAt: stamp(deps),
  };
  return { ...data, routines: upsertById(data.routines, updated) };
};

/* ============================================================================
 * Phase 4 — plan/reflect operations. Small additive reducers over collections
 * that already exist (goals/tasks/journal); no schema change. Same pure pattern.
 * ==========================================================================*/

// ---------- Goals: milestones ----------

export const toggleMilestone = (
  deps: OpDeps,
  data: AppData,
  goalId: GoalId,
  milestoneId: MilestoneId,
): AppData => {
  const goal = findById(data.goals, goalId);
  if (goal === undefined) return data;
  const ts = stamp(deps);
  const milestones = goal.milestones.map((m) =>
    m.id === milestoneId
      ? { ...m, done: !m.done, completedAt: !m.done ? ts : null }
      : m,
  );
  return {
    ...data,
    goals: upsertById(data.goals, { ...goal, milestones, updatedAt: ts }),
  };
};

export const removeMilestone = (
  deps: OpDeps,
  data: AppData,
  goalId: GoalId,
  milestoneId: MilestoneId,
): AppData => {
  const goal = findById(data.goals, goalId);
  if (goal === undefined) return data;
  return {
    ...data,
    goals: upsertById(data.goals, {
      ...goal,
      milestones: goal.milestones.filter((m) => m.id !== milestoneId),
      updatedAt: stamp(deps),
    }),
  };
};

// ---------- Tasks: subtasks ----------

export const toggleSubtask = (
  deps: OpDeps,
  data: AppData,
  taskId: TaskId,
  subtaskId: SubtaskId,
): AppData => {
  const task = findById(data.tasks, taskId);
  if (task === undefined) return data;
  return {
    ...data,
    tasks: upsertById(data.tasks, {
      ...task,
      subtasks: task.subtasks.map((s) =>
        s.id === subtaskId ? { ...s, done: !s.done } : s,
      ),
      updatedAt: stamp(deps),
    }),
  };
};

export const removeSubtask = (
  deps: OpDeps,
  data: AppData,
  taskId: TaskId,
  subtaskId: SubtaskId,
): AppData => {
  const task = findById(data.tasks, taskId);
  if (task === undefined) return data;
  return {
    ...data,
    tasks: upsertById(data.tasks, {
      ...task,
      subtasks: task.subtasks.filter((s) => s.id !== subtaskId),
      updatedAt: stamp(deps),
    }),
  };
};

// ---------- Journal ----------

export const removeJournalEntry = (
  _deps: OpDeps,
  data: AppData,
  id: JournalEntryId,
): AppData => ({ ...data, journal: removeById(data.journal, id) });
