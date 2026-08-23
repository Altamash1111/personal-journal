export { occursOn, nextOccurrence } from "./recurrence";
export {
  goalProgress,
  isGoalComplete,
  childGoals,
  rollupProgress,
} from "./goals";
export type { TaskView } from "./tasks";
export {
  isActive,
  isCompleted,
  isOverdue,
  isDueToday,
  isUpcoming,
  filterTasks,
  sortByPriority,
  nextTaskDue,
} from "./tasks";
export {
  isHabitDueOn,
  completionsFor,
  isHabitCompletedOn,
  habitDayRatio,
  currentStreak,
} from "./habits";
export type { RoutineProgress } from "./routines";
export { isRoutineDueOn, routineProgress } from "./routines";
export type {
  DailySummary,
  DimensionSummary,
  RoutineSummary,
} from "./dailySummary";
export { computeDailySummary } from "./dailySummary";

// --- Phase 3 module logic ---
export type { ExercisePR, OverloadResult, OverloadTrend, BodyWeightTrend, PeriodSummary } from "./fitness";
export {
  estimatedOneRepMax,
  sessionVolume,
  exercisePR,
  allPRs,
  progressiveOverload,
  bodyWeightTrend,
  latestMeasurements,
  weeklyProgress,
  monthlyProgress,
} from "./fitness";
export type { Progress, NutritionProgress } from "./diet";
export {
  ZERO_MACROS,
  addMacros,
  mealMacros,
  mealsForDate,
  dayMacros,
  dayWaterMl,
  nutritionProgress,
} from "./diet";
export type { SleepProgress } from "./sleep";
export {
  sleepForDate,
  lastNights,
  averageDurationMinutes,
  consistencyScore,
  sleepProgress,
  formatDuration,
} from "./sleep";
export type { ReadingGroups } from "./reading";
export { readingProgress, groupByStatus, finishedCount, learningForDate } from "./reading";
export type {
  ModuleStatus,
  WorkoutStatus,
  NutritionStatus,
  SleepStatus,
  ReadingStatus,
} from "./moduleStatus";
export { todayModuleStatus } from "./moduleStatus";
