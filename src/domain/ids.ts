import type { Brand } from "../core/brand";

export type GoalId = Brand<string, "GoalId">;
export type MilestoneId = Brand<string, "MilestoneId">;
export type TaskId = Brand<string, "TaskId">;
export type SubtaskId = Brand<string, "SubtaskId">;
export type HabitId = Brand<string, "HabitId">;
export type HabitCompletionId = Brand<string, "HabitCompletionId">;
export type RoutineId = Brand<string, "RoutineId">;
export type RoutineStepId = Brand<string, "RoutineStepId">;
export type ProjectId = Brand<string, "ProjectId">;
export type JournalEntryId = Brand<string, "JournalEntryId">;

// --- Phase 3 module ids ---
export type ExerciseId = Brand<string, "ExerciseId">;
export type WorkoutPlanId = Brand<string, "WorkoutPlanId">;
export type PlanExerciseId = Brand<string, "PlanExerciseId">;
export type WorkoutSessionId = Brand<string, "WorkoutSessionId">;
export type SessionExerciseId = Brand<string, "SessionExerciseId">;
export type SetEntryId = Brand<string, "SetEntryId">;
export type BodyWeightId = Brand<string, "BodyWeightId">;
export type MeasurementId = Brand<string, "MeasurementId">;
export type FoodId = Brand<string, "FoodId">;
export type MealId = Brand<string, "MealId">;
export type MealItemId = Brand<string, "MealItemId">;
export type WaterEntryId = Brand<string, "WaterEntryId">;
export type SleepEntryId = Brand<string, "SleepEntryId">;
export type ReadingItemId = Brand<string, "ReadingItemId">;
export type ReadingNoteId = Brand<string, "ReadingNoteId">;
export type LearningLogId = Brand<string, "LearningLogId">;
