import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAppData } from "../domain/appData";
import { DEFAULT_SETTINGS } from "../config";
import {
  createGoal,
  addMilestone,
  toggleMilestone,
  removeMilestone,
  createTask,
  addSubtask,
  toggleSubtask,
  removeSubtask,
  upsertJournalEntry,
  removeJournalEntry,
} from "./operations";
import type { GoalId, MilestoneId, TaskId, SubtaskId } from "../domain/ids";
import { ld, makeDeps } from "../testing/util";

test("toggleMilestone flips done and sets/clears completedAt", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const g = createGoal(deps, data, { horizon: "quarter", name: "Ship v1" });
  data = g.data;
  data = addMilestone(deps, data, g.goal.id as GoalId, { title: "Alpha" });
  const mId = data.goals[0]!.milestones[0]!.id as MilestoneId;

  data = toggleMilestone(deps, data, g.goal.id as GoalId, mId);
  let m = data.goals[0]!.milestones[0]!;
  assert.equal(m.done, true);
  assert.ok(m.completedAt !== null);

  data = toggleMilestone(deps, data, g.goal.id as GoalId, mId);
  m = data.goals[0]!.milestones[0]!;
  assert.equal(m.done, false);
  assert.equal(m.completedAt, null);
});

test("removeMilestone drops it from the goal", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const g = createGoal(deps, data, { horizon: "month", name: "Learn" });
  data = g.data;
  data = addMilestone(deps, data, g.goal.id as GoalId, { title: "One" });
  data = addMilestone(deps, data, g.goal.id as GoalId, { title: "Two" });
  const first = data.goals[0]!.milestones[0]!.id as MilestoneId;
  data = removeMilestone(deps, data, g.goal.id as GoalId, first);
  assert.equal(data.goals[0]!.milestones.length, 1);
  assert.equal(data.goals[0]!.milestones[0]!.title, "Two");
});

test("toggleSubtask flips a subtask done flag", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const t = createTask(deps, data, { title: "Write report" });
  data = t.data;
  data = addSubtask(deps, data, t.task.id as TaskId, "Outline");
  const sId = data.tasks[0]!.subtasks[0]!.id as SubtaskId;
  data = toggleSubtask(deps, data, t.task.id as TaskId, sId);
  assert.equal(data.tasks[0]!.subtasks[0]!.done, true);
  data = toggleSubtask(deps, data, t.task.id as TaskId, sId);
  assert.equal(data.tasks[0]!.subtasks[0]!.done, false);
});

test("removeSubtask drops a subtask", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const t = createTask(deps, data, { title: "Plan" });
  data = t.data;
  data = addSubtask(deps, data, t.task.id as TaskId, "A");
  data = addSubtask(deps, data, t.task.id as TaskId, "B");
  const first = data.tasks[0]!.subtasks[0]!.id as SubtaskId;
  data = removeSubtask(deps, data, t.task.id as TaskId, first);
  assert.equal(data.tasks[0]!.subtasks.length, 1);
  assert.equal(data.tasks[0]!.subtasks[0]!.title, "B");
});

test("removeJournalEntry deletes a day's reflection", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  ({ data } = upsertJournalEntry(deps, data, ld("2025-08-22"), { accomplished: "Shipped" }));
  assert.equal(data.journal.length, 1);
  const id = data.journal[0]!.id;
  data = removeJournalEntry(deps, data, id);
  assert.equal(data.journal.length, 0);
});

test("upsertJournalEntry updates the same day's entry in place (no duplicate)", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const day = ld("2025-08-22");
  ({ data } = upsertJournalEntry(deps, data, day, {
    accomplished: "Initial win",
    wentWrong: "Initial wrong",
    learned: "Initial lesson",
    rating: 3,
  }));
  assert.equal(data.journal.length, 1);
  const firstId = data.journal[0]!.id;

  // Update the same day: change values AND clear one field (wentWrong -> null).
  ({ data } = upsertJournalEntry(deps, data, day, {
    accomplished: "UPDATED win",
    wentWrong: null, // explicit clear
    learned: "UPDATED lesson",
    topPriorityTomorrow: "UPDATED priority",
    rating: 5,
  }));
  assert.equal(data.journal.length, 1); // no duplicate
  const e = data.journal[0]!;
  assert.equal(e.id, firstId); // same entry
  assert.equal(e.accomplished, "UPDATED win");
  assert.equal(e.wentWrong, null); // cleared, not stuck on old value
  assert.equal(e.learned, "UPDATED lesson");
  assert.equal(e.topPriorityTomorrow, "UPDATED priority");
  assert.equal(e.rating, 5);
});

test("upsertJournalEntry keeps fields absent from the patch untouched", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const day = ld("2025-08-22");
  ({ data } = upsertJournalEntry(deps, data, day, { accomplished: "Win", rating: 4 }));
  // Patch that omits `accomplished` must not wipe it.
  ({ data } = upsertJournalEntry(deps, data, day, { learned: "A lesson" }));
  const e = data.journal[0]!;
  assert.equal(e.accomplished, "Win"); // untouched
  assert.equal(e.rating, 4); // untouched
  assert.equal(e.learned, "A lesson");
});
