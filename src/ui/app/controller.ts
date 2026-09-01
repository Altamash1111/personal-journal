/**
 * AppController is the seam between the UI and Phase 1. It holds the current
 * AppData in memory, projects it into a Today view model, and exposes intent
 * methods (addTask, toggleHabit, ...). Every mutation goes through a Phase 1
 * OPERATION (never ad-hoc state edits) and is then persisted through the Phase 1
 * Store. It is completely DOM-free, so the whole app logic + persistence path is
 * testable without a browser.
 */
import type { AppData } from "../../domain/appData";
import type { OpDeps } from "../../state/helpers";
import type { Store } from "../../persistence/store";
import type { LocalDate } from "../../time/localDate";
import type {
  TaskId,
  HabitId,
  RoutineId,
  ExerciseId,
  WorkoutSessionId,
  SessionExerciseId,
  SetEntryId,
  MealId,
  ReadingItemId,
} from "../../domain/ids";
import type {
  CreateTaskInput,
  CreateHabitInput,
  CreateGoalInput,
  CreateRoutineInput,
  CreateExerciseInput,
  CreateWorkoutSessionInput,
  LogMealInput,
  LogSleepInput,
  CreateReadingItemInput,
  AddLearningLogInput,
  HabitPatch,
} from "../../state/operations";
import type { LoadUnit } from "../../domain/fitness";
import type { ReadingStatus } from "../../domain/reading";
import type { NutritionTargets } from "../../domain/settings";
import type { TodayView } from "../model/viewModel";
import type { InsightsView } from "../model/insights";
import { buildInsightsView } from "../model/insights";
import type { MonthlyInsightsView } from "../model/monthlyInsights";
import { buildMonthlyInsightsView } from "../model/monthlyInsights";
import type {
  FitnessView,
  DietView,
  SleepView,
  RoutinesView,
  ReadingView,
} from "../model/modules";
import type {
  GoalsView,
  TasksView,
  ProjectsView,
  JournalView,
  SettingsView,
} from "../model/plan";
import type {
  GoalId,
  MilestoneId,
  TaskId as TaskIdType,
  SubtaskId,
  ProjectId,
  JournalEntryId,
} from "../../domain/ids";
import type {
  GoalPatch,
  CreateProjectInput,
  ProjectPatch,
  TaskPatch,
  JournalPatch,
} from "../../state/operations";
import type { GoalMetric, GoalStatus } from "../../domain/goal";
import type { Weekday } from "../../time/localDate";

import { emptyAppData } from "../../domain/appData";
import { DEFAULT_SETTINGS } from "../../config";
import {
  todayLocalDate,
  instantToLocalDate,
  instantToLocalTime,
  isValidTimeZone,
} from "../../time/timezone";
import { buildTodayView } from "../model/viewModel";
import {
  buildFitnessView,
  buildDietView,
  buildSleepView,
  buildRoutinesView,
  buildReadingView,
} from "../model/modules";
import {
  buildGoalsView,
  buildTasksView,
  buildProjectsView,
  buildJournalView,
  buildSettingsView,
} from "../model/plan";
import { exportJson, importJson } from "../../persistence/serialization";
import {
  createTask,
  completeTask,
  updateTask,
  removeTask,
  createHabit,
  updateHabit,
  removeHabit,
  logHabitCompletion,
  setHabitChecked,
  createGoal,
  updateGoal,
  addMilestone,
  toggleMilestone,
  removeMilestone,
  removeGoal,
  addSubtask,
  toggleSubtask,
  removeSubtask,
  createProject,
  updateProject,
  removeProject,
  upsertJournalEntry,
  removeJournalEntry,
  createRoutine,
  removeRoutine,
  addRoutineStep,
  removeRoutineStep,
  updateSettings,
  createExercise,
  createWorkoutSession,
  addSessionExercise,
  addSet,
  removeSet,
  completeWorkoutSession,
  removeWorkoutSession,
  logBodyWeight,
  logMeasurement,
  logMeal,
  logWater,
  removeMeal,
  logSleep,
  createReadingItem,
  updateReadingProgress,
  setReadingStatus,
  addReadingNote,
  removeReadingItem,
  addLearningLog,
} from "../../state/operations";
import { completionsFor, isHabitCompletedOn } from "../../logic/habits";
import { findById } from "../../state/helpers";

export interface AppControllerOptions {
  readonly store: Store;
  readonly ops: OpDeps;
}

export type LoadStatus = "empty" | "loaded" | "error";

export class AppController {
  readonly #store: Store;
  readonly #ops: OpDeps;
  #state: AppData;
  #loadStatus: LoadStatus = "empty";
  #loadIssues: readonly string[] = [];
  readonly #listeners = new Set<() => void>();

  constructor(options: AppControllerOptions) {
    this.#store = options.store;
    this.#ops = options.ops;
    this.#state = emptyAppData(DEFAULT_SETTINGS);
  }

  /** Load persisted data (if any). Never throws; surfaces status + issues. */
  async init(): Promise<void> {
    const outcome = await this.#store.load();
    if (outcome.status === "loaded") {
      this.#state = outcome.data;
      this.#loadStatus = "loaded";
      this.#loadIssues = outcome.issues;
    } else if (outcome.status === "empty") {
      this.#loadStatus = "empty";
    } else {
      // error: keep the safe empty state; the raw bytes remain in storage
      // (Store.load never overwrites them).
      this.#loadStatus = "error";
      this.#loadIssues = [outcome.error];
    }
    this.#emit();
  }

  getState(): AppData {
    return this.#state;
  }

  loadStatus(): LoadStatus {
    return this.#loadStatus;
  }

  loadIssues(): readonly string[] {
    return this.#loadIssues;
  }

  timeZone(): string {
    return this.#state.settings.timeZone;
  }

  today(): LocalDate {
    return todayLocalDate(this.#ops.clock, this.timeZone());
  }

  localHour(): number {
    return instantToLocalTime(this.#ops.clock.now(), this.timeZone()).hour;
  }

  view(): TodayView {
    return buildTodayView(
      this.#state,
      this.today(),
      this.localHour(),
      this.#state.settings,
    );
  }

  insightsView(offset: number): InsightsView {
    return buildInsightsView(
      this.#state,
      this.today(),
      this.#state.settings.weekStartsOn,
      offset,
      this.timeZone(),
    );
  }

  monthlyView(offset: number): MonthlyInsightsView {
    return buildMonthlyInsightsView(
      this.#state,
      this.today(),
      this.#state.settings.weekStartsOn,
      offset,
      this.timeZone(),
    );
  }

  fitnessView(): FitnessView {
    return buildFitnessView(this.#state, this.today());
  }
  dietView(): DietView {
    return buildDietView(this.#state, this.today(), this.#state.settings);
  }
  sleepView(): SleepView {
    return buildSleepView(this.#state, this.today(), this.#state.settings);
  }
  routinesView(): RoutinesView {
    return buildRoutinesView(this.#state);
  }
  readingView(): ReadingView {
    return buildReadingView(this.#state, this.today());
  }

  goalsView(): GoalsView {
    return buildGoalsView(this.#state, this.today());
  }
  tasksView(): TasksView {
    return buildTasksView(this.#state, this.today());
  }
  projectsView(): ProjectsView {
    return buildProjectsView(this.#state);
  }
  journalView(): JournalView {
    return buildJournalView(this.#state, this.today());
  }
  settingsView(): SettingsView {
    return buildSettingsView(this.#state);
  }

  subscribe(fn: () => void): () => void {
    this.#listeners.add(fn);
    return () => {
      this.#listeners.delete(fn);
    };
  }

  #emit(): void {
    for (const fn of this.#listeners) fn();
  }

  async #commit(next: AppData): Promise<void> {
    this.#state = next;
    this.#emit(); // update UI immediately for responsiveness
    await this.#store.save(next); // persist in the background
  }

  // ----- Tasks -----

  async addTask(input: CreateTaskInput): Promise<void> {
    const { data } = createTask(this.#ops, this.#state, input);
    await this.#commit(data);
  }

  async toggleTask(id: TaskId): Promise<void> {
    const task = findById(this.#state.tasks, id);
    if (task === undefined) return;
    if (task.status === "done") {
      const data = updateTask(this.#ops, this.#state, id, {
        status: "todo",
        completedAt: null,
      });
      await this.#commit(data);
    } else {
      const { data } = completeTask(this.#ops, this.#state, id);
      await this.#commit(data);
    }
  }

  async deleteTask(id: TaskId): Promise<void> {
    await this.#commit(removeTask(this.#ops, this.#state, id));
  }

  // ----- Habits -----

  async addHabit(input: CreateHabitInput): Promise<void> {
    const { data } = createHabit(this.#ops, this.#state, input);
    await this.#commit(data);
  }

  /** Toggle a habit's completion for today. Measurable habits increment by one
   *  unit per tap (and clear to zero once the target is met and tapped again). */
  async toggleHabit(id: HabitId): Promise<void> {
    await this.#toggleHabitOn(id, this.today());
  }

  async incrementHabit(id: HabitId, amount = 1): Promise<void> {
    const { data } = logHabitCompletion(this.#ops, this.#state, id, this.today(), {
      amount,
    });
    await this.#commit(data);
  }

  async #toggleHabitOn(id: HabitId, date: LocalDate): Promise<void> {
    const habit = findById(this.#state.habits, id);
    if (habit === undefined) return;
    if (habit.target !== null) {
      // Measurable: if already complete, clear the day; else add one unit.
      if (isHabitCompletedOn(habit, date, this.#state.habitCompletions)) {
        await this.#commit(
          setHabitChecked(this.#ops, this.#state, id, date, false),
        );
      } else {
        const { data } = logHabitCompletion(this.#ops, this.#state, id, date, {
          amount: 1,
        });
        await this.#commit(data);
      }
      return;
    }
    const has =
      completionsFor(id, date, this.#state.habitCompletions).length > 0;
    await this.#commit(
      setHabitChecked(this.#ops, this.#state, id, date, !has),
    );
  }

  /** Toggle a routine step (which is just a habit) for today. */
  async toggleRoutineStep(habitId: HabitId): Promise<void> {
    await this.#toggleHabitOn(habitId, this.today());
  }

  // ----- Goals / Routines -----

  async addGoal(input: CreateGoalInput): Promise<void> {
    const { data } = createGoal(this.#ops, this.#state, input);
    await this.#commit(data);
  }

  async addRoutine(input: CreateRoutineInput): Promise<void> {
    const { data } = createRoutine(this.#ops, this.#state, input);
    await this.#commit(data);
  }

  // ----- Settings -----

  async setTimeZone(timeZone: string): Promise<{ readonly ok: boolean }> {
    // Guard against corrupting date logic with a non-IANA value (e.g. a typo or
    // free text). Invalid input is rejected and the current zone is kept.
    if (!isValidTimeZone(timeZone)) return { ok: false };
    await this.#commit(updateSettings(this.#ops, this.#state, { timeZone }));
    return { ok: true };
  }

  async setNutritionTargets(nutrition: NutritionTargets): Promise<void> {
    await this.#commit(updateSettings(this.#ops, this.#state, { nutrition }));
  }

  async setSleepTarget(minutes: number): Promise<void> {
    await this.#commit(
      updateSettings(this.#ops, this.#state, { sleepTargetMinutes: minutes }),
    );
  }

  // ----- Routines & hygiene (user-configurable habits) -----

  async addHabitAdmin(input: CreateHabitInput): Promise<void> {
    const { data } = createHabit(this.#ops, this.#state, input);
    await this.#commit(data);
  }
  async patchHabit(id: HabitId, patch: HabitPatch): Promise<void> {
    await this.#commit(updateHabit(this.#ops, this.#state, id, patch));
  }
  async toggleHabitActive(id: HabitId): Promise<void> {
    const habit = findById(this.#state.habits, id);
    if (habit === undefined) return;
    await this.#commit(
      updateHabit(this.#ops, this.#state, id, { active: !habit.active }),
    );
  }
  async deleteHabit(id: HabitId): Promise<void> {
    await this.#commit(removeHabit(this.#ops, this.#state, id));
  }
  async createRoutineWith(input: CreateRoutineInput): Promise<void> {
    const { data } = createRoutine(this.#ops, this.#state, input);
    await this.#commit(data);
  }
  async deleteRoutine(id: RoutineId): Promise<void> {
    await this.#commit(removeRoutine(this.#ops, this.#state, id));
  }
  async addStepToRoutine(routineId: RoutineId, habitId: HabitId): Promise<void> {
    await this.#commit(addRoutineStep(this.#ops, this.#state, routineId, habitId));
  }
  async removeStepFromRoutine(routineId: RoutineId, stepId: string): Promise<void> {
    await this.#commit(removeRoutineStep(this.#ops, this.#state, routineId, stepId));
  }

  // ----- Fitness -----

  async addExercise(input: CreateExerciseInput): Promise<ExerciseId> {
    const { data, exercise } = createExercise(this.#ops, this.#state, input);
    await this.#commit(data);
    return exercise.id;
  }
  async startWorkout(input: CreateWorkoutSessionInput): Promise<void> {
    const { data } = createWorkoutSession(this.#ops, this.#state, input);
    await this.#commit(data);
  }
  async addExerciseToSession(
    sessionId: WorkoutSessionId,
    exerciseId: ExerciseId,
  ): Promise<void> {
    await this.#commit(
      addSessionExercise(this.#ops, this.#state, sessionId, exerciseId),
    );
  }
  async addSetToSession(
    sessionId: WorkoutSessionId,
    sessionExerciseId: SessionExerciseId,
    reps: number | null,
    weight: number | null,
  ): Promise<void> {
    await this.#commit(
      addSet(this.#ops, this.#state, sessionId, sessionExerciseId, {
        reps,
        weight,
      }),
    );
  }
  async removeSetFromSession(
    sessionId: WorkoutSessionId,
    sessionExerciseId: SessionExerciseId,
    setId: SetEntryId,
  ): Promise<void> {
    await this.#commit(
      removeSet(this.#ops, this.#state, sessionId, sessionExerciseId, setId),
    );
  }
  async finishWorkout(id: WorkoutSessionId): Promise<void> {
    await this.#commit(completeWorkoutSession(this.#ops, this.#state, id));
  }
  async deleteWorkout(id: WorkoutSessionId): Promise<void> {
    await this.#commit(removeWorkoutSession(this.#ops, this.#state, id));
  }
  async logBodyWeight(weight: number, unit: LoadUnit = "kg"): Promise<void> {
    const { data } = logBodyWeight(this.#ops, this.#state, {
      date: this.today(),
      weight,
      unit,
    });
    await this.#commit(data);
  }
  async logMeasurement(site: string, value: number, unit = "cm"): Promise<void> {
    const { data } = logMeasurement(this.#ops, this.#state, {
      date: this.today(),
      site,
      value,
      unit,
    });
    await this.#commit(data);
  }

  // ----- Diet -----

  async logMeal(input: Omit<LogMealInput, "date">): Promise<void> {
    const { data } = logMeal(this.#ops, this.#state, {
      ...input,
      date: this.today(),
    });
    await this.#commit(data);
  }
  async deleteMeal(id: MealId): Promise<void> {
    await this.#commit(removeMeal(this.#ops, this.#state, id));
  }
  async logWater(amountMl: number): Promise<void> {
    const { data } = logWater(this.#ops, this.#state, {
      date: this.today(),
      amountMl,
    });
    await this.#commit(data);
  }

  // ----- Sleep -----

  async logSleep(input: Omit<LogSleepInput, "date">): Promise<void> {
    const { data } = logSleep(this.#ops, this.#state, {
      ...input,
      date: this.today(),
    });
    await this.#commit(data);
  }

  // ----- Reading & learning -----

  async addReadingItem(input: CreateReadingItemInput): Promise<void> {
    const { data } = createReadingItem(this.#ops, this.#state, input);
    await this.#commit(data);
  }
  async setReadingProgress(id: ReadingItemId, current: number): Promise<void> {
    await this.#commit(
      updateReadingProgress(this.#ops, this.#state, id, current, this.today()),
    );
  }
  async setReadingStatus(id: ReadingItemId, status: ReadingStatus): Promise<void> {
    await this.#commit(
      setReadingStatus(this.#ops, this.#state, id, status, this.today()),
    );
  }
  async addReadingNote(id: ReadingItemId, text: string): Promise<void> {
    await this.#commit(addReadingNote(this.#ops, this.#state, id, { text }));
  }
  async deleteReadingItem(id: ReadingItemId): Promise<void> {
    await this.#commit(removeReadingItem(this.#ops, this.#state, id));
  }
  async addLearning(input: Omit<AddLearningLogInput, "date">): Promise<void> {
    const { data } = addLearningLog(this.#ops, this.#state, {
      ...input,
      date: this.today(),
    });
    await this.#commit(data);
  }

  /**
   * Seed a small, REAL starter set (not fake data) so an empty install is
   * immediately explorable. Everything is created through Phase 1 operations and
   * persisted, exactly as if the user had added it.
   */
  // ----- Goals -----

  async createGoalFull(input: CreateGoalInput): Promise<void> {
    const { data } = createGoal(this.#ops, this.#state, input);
    await this.#commit(data);
  }
  async editGoal(id: GoalId, patch: GoalPatch): Promise<void> {
    await this.#commit(updateGoal(this.#ops, this.#state, id, patch));
  }
  async setGoalMetricCurrent(id: GoalId, current: number): Promise<void> {
    const goal = findById(this.#state.goals, id);
    if (goal === undefined || goal.metric === null) return;
    const metric: GoalMetric = { ...goal.metric, current };
    await this.#commit(updateGoal(this.#ops, this.#state, id, { metric }));
  }
  async setGoalStatus(id: GoalId, status: GoalStatus): Promise<void> {
    await this.#commit(updateGoal(this.#ops, this.#state, id, { status }));
  }
  async addMilestoneTo(goalId: GoalId, title: string): Promise<void> {
    await this.#commit(addMilestone(this.#ops, this.#state, goalId, { title }));
  }
  async toggleMilestone(goalId: GoalId, milestoneId: MilestoneId): Promise<void> {
    await this.#commit(toggleMilestone(this.#ops, this.#state, goalId, milestoneId));
  }
  async deleteMilestone(goalId: GoalId, milestoneId: MilestoneId): Promise<void> {
    await this.#commit(removeMilestone(this.#ops, this.#state, goalId, milestoneId));
  }
  async deleteGoal(id: GoalId): Promise<void> {
    await this.#commit(removeGoal(this.#ops, this.#state, id));
  }

  // ----- Tasks (full manager) -----

  async editTask(id: TaskIdType, patch: TaskPatch): Promise<void> {
    await this.#commit(updateTask(this.#ops, this.#state, id, patch));
  }
  async addSubtaskTo(taskId: TaskIdType, title: string): Promise<void> {
    await this.#commit(addSubtask(this.#ops, this.#state, taskId, title));
  }
  async toggleSubtask(taskId: TaskIdType, subtaskId: SubtaskId): Promise<void> {
    await this.#commit(toggleSubtask(this.#ops, this.#state, taskId, subtaskId));
  }
  async deleteSubtask(taskId: TaskIdType, subtaskId: SubtaskId): Promise<void> {
    await this.#commit(removeSubtask(this.#ops, this.#state, taskId, subtaskId));
  }

  // ----- Projects -----

  async createProjectFull(input: CreateProjectInput): Promise<void> {
    const { data } = createProject(this.#ops, this.#state, input);
    await this.#commit(data);
  }
  async editProject(id: ProjectId, patch: ProjectPatch): Promise<void> {
    await this.#commit(updateProject(this.#ops, this.#state, id, patch));
  }
  async deleteProject(id: ProjectId): Promise<void> {
    await this.#commit(removeProject(this.#ops, this.#state, id));
  }

  // ----- Journal (daily review) -----

  async saveJournalToday(patch: JournalPatch): Promise<void> {
    const { data } = upsertJournalEntry(this.#ops, this.#state, this.today(), patch);
    await this.#commit(data);
  }
  async deleteJournalEntry(id: JournalEntryId): Promise<void> {
    await this.#commit(removeJournalEntry(this.#ops, this.#state, id));
  }

  // ----- Settings & Data -----

  async setWeekStart(weekStartsOn: Weekday): Promise<void> {
    await this.#commit(updateSettings(this.#ops, this.#state, { weekStartsOn }));
  }

  /** Serialize the whole store to a JSON string (for download / backup). */
  exportData(): string {
    return exportJson(this.#state, this.#ops.clock);
  }

  /** Import a JSON string via the same safe load pipeline as startup. */
  async importData(
    raw: string,
  ): Promise<{ readonly ok: boolean; readonly error?: string; readonly issues?: readonly string[] }> {
    const outcome = importJson(raw);
    if (outcome.status === "loaded") {
      await this.#commit(outcome.data);
      this.#loadStatus = "loaded";
      this.#loadIssues = outcome.issues;
      return { ok: true, issues: outcome.issues };
    }
    if (outcome.status === "empty") {
      return { ok: false, error: "No data found in that file." };
    }
    return { ok: false, error: outcome.error };
  }

  /** Clear all tracked data but keep the user's settings (timezone/targets). */
  async resetData(): Promise<void> {
    // Keep the user's settings, but repair a corrupt timezone so clearing always
    // returns the app to a working state.
    const settings = isValidTimeZone(this.#state.settings.timeZone)
      ? this.#state.settings
      : { ...this.#state.settings, timeZone: DEFAULT_SETTINGS.timeZone };
    await this.#commit(emptyAppData(settings));
  }

  async seedExample(): Promise<void> {
    const ops = this.#ops;
    let data = this.#state;
    const today = this.today();

    ({ data } = createGoal(ops, data, {
      horizon: "year",
      name: "Read 24 books",
      metric: { target: 24, current: 7, unit: "books" },
    }));
    ({ data } = createGoal(ops, data, {
      horizon: "quarter",
      name: "Ship Life OS v1",
    }));

    ({ data } = createTask(ops, data, {
      title: "Plan the week",
      due: today,
      priority: "high",
    }));
    ({ data } = createTask(ops, data, {
      title: "Reply to Priya",
      due: today,
      priority: "urgent",
    }));
    ({ data } = createTask(ops, data, {
      title: "Draft blog outline",
      due: today,
      priority: "medium",
    }));

    const water = createHabit(ops, data, {
      name: "Drink water",
      schedule: { kind: "daily" },
      category: "Health",
      daypart: "anytime",
      target: { amount: 8, unit: "glasses" },
    });
    data = water.data;
    const meditate = createHabit(ops, data, {
      name: "Meditate",
      schedule: { kind: "daily" },
      category: "Mind",
      daypart: "morning",
    });
    data = meditate.data;
    const read = createHabit(ops, data, {
      name: "Read 20 min",
      schedule: { kind: "daily" },
      category: "Growth",
      daypart: "night",
    });
    data = read.data;
    const stretch = createHabit(ops, data, {
      name: "Stretch",
      schedule: { kind: "daily" },
      daypart: "morning",
    });
    data = stretch.data;

    ({ data } = createRoutine(ops, data, {
      name: "Morning ritual",
      schedule: { kind: "daily" },
      daypart: "morning",
      steps: [{ habitId: meditate.habit.id }, { habitId: stretch.habit.id }],
    }));
    ({ data } = createRoutine(ops, data, {
      name: "Wind down",
      schedule: { kind: "daily" },
      daypart: "night",
      steps: [{ habitId: read.habit.id }],
    }));

    // --- Phase 3 modules ---
    const squat = createExercise(ops, data, { name: "Back squat", loadUnit: "kg" });
    data = squat.data;
    const bench = createExercise(ops, data, { name: "Bench press", loadUnit: "kg" });
    data = bench.data;
    const pushups = createExercise(ops, data, { name: "Push-ups", loadUnit: null });
    data = pushups.data;
    const session = createWorkoutSession(ops, data, { date: today, name: "Push day" });
    data = session.data;
    data = addSessionExercise(ops, data, session.session.id, bench.exercise.id);
    const benchSe = data.workoutSessions
      .find((s) => s.id === session.session.id)!
      .exercises[0]!.id;
    data = addSet(ops, data, session.session.id, benchSe, { reps: 8, weight: 60 });
    data = addSet(ops, data, session.session.id, benchSe, { reps: 8, weight: 62.5 });
    data = addSessionExercise(ops, data, session.session.id, pushups.exercise.id);
    const pushSe = data.workoutSessions
      .find((s) => s.id === session.session.id)!
      .exercises[1]!.id;
    data = addSet(ops, data, session.session.id, pushSe, { reps: 15, weight: null });
    data = addSet(ops, data, session.session.id, pushSe, { reps: 12, weight: null });
    data = completeWorkoutSession(ops, data, session.session.id);
    ({ data } = logBodyWeight(ops, data, { date: today, weight: 78.4, unit: "kg" }));
    ({ data } = logMeasurement(ops, data, { date: today, site: "waist", value: 82, unit: "cm" }));

    ({ data } = logMeal(ops, data, {
      date: today,
      type: "breakfast",
      name: "Greek yogurt & berries",
      macros: { kcal: 320, protein: 28, carbs: 34, fat: 8 },
    }));
    ({ data } = logMeal(ops, data, {
      date: today,
      type: "lunch",
      name: "Chicken rice bowl",
      macros: { kcal: 640, protein: 52, carbs: 68, fat: 16 },
    }));
    ({ data } = logWater(ops, data, { date: today, amountMl: 1500 }));

    ({ data } = logSleep(ops, data, {
      date: today,
      durationMinutes: 445,
      bedtime: "23:20",
      wakeTime: "06:45",
      quality: 4,
    }));

    const book = createReadingItem(ops, data, {
      kind: "book",
      title: "Atomic Habits",
      author: "James Clear",
      unit: "pages",
      total: 320,
    });
    data = book.data;
    data = updateReadingProgress(ops, data, book.item.id, 140, today);
    ({ data } = addLearningLog(ops, data, {
      date: today,
      topic: "Systems",
      text: "Small habits compound — focus on identity, not outcomes.",
    }));
    void squat; // catalog entry available for the picker

    await this.#commit(data);
  }
}

/** Small helper used by the DOM layer to label a date without extra deps. */
export const formatFullDate = (date: LocalDate): string => {
  // date is already a LocalDate string "YYYY-MM-DD"; render via UTC to avoid
  // any timezone re-interpretation of an already-local calendar day.
  const [y, m, d] = date.split("-").map((n) => Number(n));
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  const weekday = dt.toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });
  const month = dt.toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  return `${weekday}, ${month} ${d ?? 1}`;
};

// Re-export so DOM/main can convert an instant if needed without new imports.
export { instantToLocalDate };
