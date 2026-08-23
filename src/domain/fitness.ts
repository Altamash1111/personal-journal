import type { Timestamp } from "../core/scalars";
import type { LocalDate } from "../time/localDate";
import type { RecurrenceRule } from "./recurrence";
import type {
  ExerciseId,
  WorkoutPlanId,
  PlanExerciseId,
  WorkoutSessionId,
  SessionExerciseId,
  SetEntryId,
  BodyWeightId,
  MeasurementId,
} from "./ids";

export type ExerciseKind = "strength" | "cardio" | "mobility" | "other";
/** Load unit for an exercise; null for bodyweight/cardio. */
export type LoadUnit = "kg" | "lb";

/** A reusable exercise definition (the catalog). Sessions reference these. */
export interface Exercise {
  readonly id: ExerciseId;
  readonly name: string;
  readonly kind: ExerciseKind;
  readonly loadUnit: LoadUnit | null;
  readonly category: string | null;
  readonly notes: string | null;
  readonly archived: boolean;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

/** An exercise inside a plan template, with optional targets. */
export interface PlanExercise {
  readonly id: PlanExerciseId;
  readonly exerciseId: ExerciseId;
  readonly targetSets: number | null;
  readonly targetReps: number | null;
  readonly targetWeight: number | null;
  readonly order: number;
}

export interface WorkoutPlan {
  readonly id: WorkoutPlanId;
  readonly name: string;
  readonly description: string | null;
  readonly schedule: RecurrenceRule | null;
  readonly exercises: readonly PlanExercise[];
  readonly active: boolean;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

/** A single logged set. `completed` lets you plan sets and tick them off. */
export interface SetEntry {
  readonly id: SetEntryId;
  readonly reps: number | null;
  readonly weight: number | null;
  readonly completed: boolean;
}

export interface SessionExercise {
  readonly id: SessionExerciseId;
  readonly exerciseId: ExerciseId;
  readonly sets: readonly SetEntry[];
  readonly note: string | null;
  readonly order: number;
}

/** One workout on one day. The unit of workout history + progressive overload. */
export interface WorkoutSession {
  readonly id: WorkoutSessionId;
  readonly date: LocalDate;
  readonly planId: WorkoutPlanId | null;
  readonly name: string | null;
  readonly exercises: readonly SessionExercise[];
  readonly note: string | null;
  readonly startedAt: Timestamp | null;
  readonly completedAt: Timestamp | null;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

/** A dated body-weight reading. */
export interface BodyWeightEntry {
  readonly id: BodyWeightId;
  readonly date: LocalDate;
  readonly weight: number;
  readonly unit: LoadUnit;
  readonly note: string | null;
  readonly recordedAt: Timestamp;
}

/** A dated body measurement at a user-named site (waist, chest, arm, ...). */
export interface MeasurementEntry {
  readonly id: MeasurementId;
  readonly date: LocalDate;
  readonly site: string;
  readonly value: number;
  readonly unit: string; // e.g. "cm" | "in"
  readonly note: string | null;
  readonly recordedAt: Timestamp;
}
