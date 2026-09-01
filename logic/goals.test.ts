import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAppData } from "../domain/appData";
import { DEFAULT_SETTINGS } from "../config";
import { createGoal, addMilestone, updateGoal } from "../state/operations";
import { goalProgress, isGoalComplete, rollupProgress } from "./goals";
import { makeDeps } from "../testing/util";

const base = () => emptyAppData(DEFAULT_SETTINGS);

test("metric progress = current/target, clamped", () => {
  const deps = makeDeps();
  const { goal } = createGoal(deps, base(), {
    horizon: "year",
    name: "Read 20 books",
    metric: { target: 20, current: 5, unit: "books" },
  });
  assert.equal(goalProgress(goal), 0.25);
});

test("target <= 0 yields 0 (no divide-by-zero)", () => {
  const deps = makeDeps();
  const { goal } = createGoal(deps, base(), {
    horizon: "month",
    name: "bad",
    metric: { target: 0, current: 3, unit: null },
  });
  assert.equal(goalProgress(goal), 0);
});

test("milestone progress = done/total", () => {
  const deps = makeDeps();
  let { data, goal } = createGoal(deps, base(), { horizon: "quarter", name: "Ship" });
  data = addMilestone(deps, data, goal.id, { title: "m1" });
  data = addMilestone(deps, data, goal.id, { title: "m2" });
  const g0 = data.goals[0]!;
  data = updateGoal(deps, data, g0.id, {
    milestones: g0.milestones.map((m, i) => (i === 0 ? { ...m, done: true } : m)),
  });
  assert.equal(goalProgress(data.goals[0]!), 0.5);
});

test("completed status forces progress 1", () => {
  const deps = makeDeps();
  const { goal } = createGoal(deps, base(), {
    horizon: "week",
    name: "x",
    status: "completed",
  });
  assert.ok(isGoalComplete(goal));
});

test("no metric/milestones => 0", () => {
  const deps = makeDeps();
  const { goal } = createGoal(deps, base(), { horizon: "vision", name: "vague" });
  assert.equal(goalProgress(goal), 0);
});

test("rollupProgress averages children", () => {
  const deps = makeDeps();
  let { data, goal: parent } = createGoal(deps, base(), { horizon: "year", name: "P" });
  ({ data } = createGoal(deps, data, {
    horizon: "quarter",
    name: "c1",
    parentId: parent.id,
    metric: { target: 10, current: 10, unit: null },
  }));
  ({ data } = createGoal(deps, data, {
    horizon: "quarter",
    name: "c2",
    parentId: parent.id,
    metric: { target: 10, current: 0, unit: null },
  }));
  const p = data.goals.find((g) => g.id === parent.id)!;
  assert.equal(rollupProgress(p, data.goals), 0.5); // (1 + 0)/2
});
