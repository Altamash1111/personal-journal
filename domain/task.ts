import type { Timestamp } from "../core/scalars";
import type { LocalDate } from "../time/localDate";
import type { RecurrenceRule } from "./recurrence";
import type { GoalId, ProjectId, SubtaskId, TaskId } from "./ids";

export type TaskPriority = "none" | "low" | "medium" | "high" | "urgent";
export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";

export interface Subtask {
  readonly id: SubtaskId;
  readonly title: string;
  readonly done: boolean;
}

export interface Task {
  readonly id: TaskId;
  readonly title: string;
  readonly description: string | null;
  readonly due: LocalDate | null;
  readonly priority: TaskPriority;
  readonly category: string | null;
  readonly estimateMinutes: number | null;
  readonly status: TaskStatus;
  /** If set, the task recurs; completing it can spawn the next occurrence. */
  readonly recurrence: RecurrenceRule | null;
  readonly subtasks: readonly Subtask[];
  readonly notes: string | null;
  readonly goalId: GoalId | null;
  readonly projectId: ProjectId | null;
  readonly completedAt: Timestamp | null;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}
