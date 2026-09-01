import type { Timestamp } from "../core/scalars";
import type { Daypart } from "./common";
import type { RecurrenceRule } from "./recurrence";
import type { HabitId, RoutineId, RoutineStepId } from "./ids";

/**
 * Routines are ORDERED GROUPS OF HABITS (e.g. \"Morning\", \"Night\", \"Weekly care\").
 * A routine step points at a habit, so completing a step = logging that habit’s
 * completion event. This avoids a second, parallel tracking system and keeps all
 * analytics flowing through habit completions. Routines are fully user-configurable;
 * none of the user’s specific habits are hardcoded in logic.
 */
export interface RoutineStep {
  readonly id: RoutineStepId;
  readonly habitId: HabitId;
  readonly order: number;
}

export interface Routine {
  readonly id: RoutineId;
  readonly name: string;
  readonly daypart: Daypart | null;
  readonly schedule: RecurrenceRule;
  readonly steps: readonly RoutineStep[];
  readonly active: boolean;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}
