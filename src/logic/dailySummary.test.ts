import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAppData } from "../domain/appData";
import { DEFAULT_SETTINGS } from "../config";
import {
  createHabit,
  createTask,
  completeTask,
  setHabitChecked,
} from "../state/operations";
import { computeDailySummary } from "./dailySummary";
import { ld, makeDeps } from "../testing/util";

const today = ld("2025-08-22");

test("overall = (habitsDone + tasksDone) / (habitsDue + tasksDue)", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const h1 = createHabit(deps, data, { name: "Brush", schedule: { kind: "daily" } });
  data = h1.data;
  const h2 = createHabit(deps, data, { name: "Read", schedule: { kind: "daily" } });
  data = h2.data;
  const t1 = createTask(deps, data, { title: "A", due: today });
  data = t1.data;
  const t2 = createTask(deps, data, { title: "B", due: today });
  data = t2.data;

  data = setHabitChecked(deps, data, h1.habit.id, today, true); // 1/2 habits
  ({ data } = completeTask(deps, data, t1.task.id)); // 1/2 tasks

  const s = computeDailySummary(data, today);
  assert.equal(s.habits.due, 2);
  assert.equal(s.habits.done, 1);
  assert.equal(s.tasks.due, 2);
  assert.equal(s.tasks.done, 1);
  assert.equal(s.overall, 0.5);
});

test("nothing due => overall 1 (a clear day is complete)", () => {
  const data = emptyAppData(DEFAULT_SETTINGS);
  const s = computeDailySummary(data, today);
  assert.equal(s.overall, 1);
  assert.equal(s.habits.ratio, 1);
});
