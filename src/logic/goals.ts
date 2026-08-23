import type { Goal } from "../domain/goal";
import type { GoalId } from "../domain/ids";

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Progress as a fraction 0..1. Transparent, single rule (no arbitrary scores):
 *   1. status \"completed\"     -> 1
 *   2. else has numeric metric -> current / target (clamped)
 *   3. else has milestones     -> done / total
 *   4. else                    -> 0
 * Progress is always DERIVED here, never stored on the goal.
 */
export const goalProgress = (goal: Goal): number => {
  if (goal.status === "completed") return 1;
  if (goal.metric !== null) {
    return goal.metric.target <= 0
      ? 0
      : clamp01(goal.metric.current / goal.metric.target);
  }
  if (goal.milestones.length > 0) {
    const done = goal.milestones.filter((m) => m.done).length;
    return clamp01(done / goal.milestones.length);
  }
  return 0;
};

export const isGoalComplete = (goal: Goal): boolean => goalProgress(goal) >= 1;

export const childGoals = (
  parentId: GoalId,
  all: readonly Goal[],
): readonly Goal[] => all.filter((g) => g.parentId === parentId);

/** Average progress of direct children, or own progress if it has none. */
export const rollupProgress = (goal: Goal, all: readonly Goal[]): number => {
  const kids = childGoals(goal.id, all);
  if (kids.length === 0) return goalProgress(goal);
  const sum = kids.reduce((acc, g) => acc + rollupProgress(g, all), 0);
  return sum / kids.length;
};
