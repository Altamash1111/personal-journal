import type { Goal } from "./goal";
import type { Task } from "./task";
import type { Habit, HabitCompletion } from "./habit";
import type { Routine } from "./routine";
import type { Project } from "./project";
import type { JournalEntry } from "./journal";
import type { Settings } from "./settings";
import type {
  Exercise,
  WorkoutPlan,
  WorkoutSession,
  BodyWeightEntry,
  MeasurementEntry,
} from "./fitness";
import type { FoodItem, MealEntry, WaterEntry } from "./diet";
import type { SleepEntry } from "./sleep";
import type { ReadingItem, LearningLogEntry } from "./reading";

/** The complete persisted application state (the `data` inside the envelope). */
export interface AppData {
  // Phase 1
  readonly goals: readonly Goal[];
  readonly tasks: readonly Task[];
  readonly habits: readonly Habit[];
  readonly habitCompletions: readonly HabitCompletion[];
  readonly routines: readonly Routine[];
  readonly projects: readonly Project[];
  readonly journal: readonly JournalEntry[];
  // Phase 3 — Fitness
  readonly exercises: readonly Exercise[];
  readonly workoutPlans: readonly WorkoutPlan[];
  readonly workoutSessions: readonly WorkoutSession[];
  readonly bodyWeights: readonly BodyWeightEntry[];
  readonly measurements: readonly MeasurementEntry[];
  // Phase 3 — Diet
  readonly foods: readonly FoodItem[];
  readonly meals: readonly MealEntry[];
  readonly waterLog: readonly WaterEntry[];
  // Phase 3 — Sleep
  readonly sleepLog: readonly SleepEntry[];
  // Phase 3 — Reading & learning
  readonly reading: readonly ReadingItem[];
  readonly learningLog: readonly LearningLogEntry[];

  readonly settings: Settings;
}

export const emptyAppData = (settings: Settings): AppData => ({
  goals: [],
  tasks: [],
  habits: [],
  habitCompletions: [],
  routines: [],
  projects: [],
  journal: [],
  exercises: [],
  workoutPlans: [],
  workoutSessions: [],
  bodyWeights: [],
  measurements: [],
  foods: [],
  meals: [],
  waterLog: [],
  sleepLog: [],
  reading: [],
  learningLog: [],
  settings,
});
