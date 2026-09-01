import type { Timestamp } from "../core/scalars";
import type { LocalDate } from "../time/localDate";
import type { GoalId, MilestoneId } from "./ids";

/** Vision -> Year -> Quarter -> Month -> Week hierarchy (via parentId). */
export type GoalHorizon = "vision" | "year" | "quarter" | "month" | "week";

/** User-controlled lifecycle. Distinct from computed progress. */
export type GoalStatus = "active" | "completed" | "on_hold" | "archived";

/** Optional numeric objective, e.g. read 20 books, reach 70kg. */
export interface GoalMetric {
  readonly target: number;
  readonly current: number;
  readonly unit: string | null;
}

export interface Milestone {
  readonly id: MilestoneId;
  readonly title: string;
  readonly done: boolean;
  readonly targetDate: LocalDate | null;
  readonly completedAt: Timestamp | null;
}

export interface Goal {
  readonly id: GoalId;
  readonly horizon: GoalHorizon;
  readonly parentId: GoalId | null;
  readonly name: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly metric: GoalMetric | null;
  readonly deadline: LocalDate | null;
  readonly status: GoalStatus;
  readonly milestones: readonly Milestone[];
  readonly notes: string | null;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}
