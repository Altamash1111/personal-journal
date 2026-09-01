import type { Timestamp } from "../core/scalars";
import type { ProjectId } from "./ids";

/** Minimal in Phase 1 — enough for Task.projectId to reference a real entity.
 *  Milestones/links/progress rollups come in a later phase. */
export type ProjectStatus = "active" | "paused" | "completed" | "archived";

export interface Project {
  readonly id: ProjectId;
  readonly name: string;
  readonly description: string | null;
  readonly status: ProjectStatus;
  readonly notes: string | null;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}
