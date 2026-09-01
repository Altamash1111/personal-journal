import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAppData } from "../domain/appData";
import { DEFAULT_SETTINGS } from "../config";
import { createTask } from "../state/operations";
import {
  isOverdue,
  isDueToday,
  isUpcoming,
  filterTasks,
  sortByPriority,
  nextTaskDue,
} from "./tasks";
import { ld, makeDeps } from "../testing/util";

const today = ld("2025-08-22");

const build = () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const yesterday = createTask(deps, data, { title: "overdue", due: ld("2025-08-21") });
  data = yesterday.data;
  const dueNow = createTask(deps, data, { title: "today", due: today, priority: "high" });
  data = dueNow.data;
  const later = createTask(deps, data, { title: "later", due: ld("2025-08-25") });
  data = later.data;
  return { data, overdue: yesterday.task, todayTask: dueNow.task, later: later.task };
};

test("overdue / dueToday / upcoming classification", () => {
  const { overdue, todayTask, later } = build();
  assert.ok(isOverdue(overdue, today));
  assert.ok(isDueToday(todayTask, today));
  assert.ok(isUpcoming(later, today));
  assert.equal(isOverdue(todayTask, today), false);
});

test("today view includes overdue + due-today, not upcoming", () => {
  const { data } = build();
  const view = filterTasks(data.tasks, "today", today);
  assert.equal(view.length, 2);
  const upcoming = filterTasks(data.tasks, "upcoming", today);
  assert.equal(upcoming.length, 1);
});

test("sortByPriority puts urgent first", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  ({ data } = createTask(deps, data, { title: "low", priority: "low" }));
  ({ data } = createTask(deps, data, { title: "urgent", priority: "urgent" }));
  const sorted = sortByPriority(data.tasks);
  assert.equal(sorted[0]!.title, "urgent");
});

test("nextTaskDue follows recurrence", () => {
  assert.equal(nextTaskDue({ kind: "daily" }, today), "2025-08-23");
});
