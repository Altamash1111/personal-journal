import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAppData } from "../domain/appData";
import { DEFAULT_SETTINGS } from "../config";
import {
  createTask,
  completeTask,
  createHabit,
  createExercise,
  logHabitCompletion,
  removeHabit,
  upsertJournalEntry,
  updateSettings,
  setHabitChecked,
} from "./operations";
import { ld, makeDeps } from "../testing/util";

const today = ld("2025-08-22");

test("completing a recurring task spawns the next occurrence", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const { data: d1, task } = createTask(deps, data, {
    title: "Workout",
    due: today,
    recurrence: { kind: "daily" },
  });
  data = d1;
  const { data: d2, spawned } = completeTask(deps, data, task.id);
  data = d2;
  assert.ok(spawned !== null);
  assert.equal(spawned!.status, "todo");
  assert.equal(spawned!.due, "2025-08-23");
  // original is done, plus a fresh occurrence => 2 tasks
  assert.equal(data.tasks.length, 2);
  const done = data.tasks.find((t) => t.id === task.id)!;
  assert.equal(done.status, "done");
});

test("completing a non-recurring task spawns nothing", () => {
  const deps = makeDeps();
  const { data, task } = createTask(deps, emptyAppData(DEFAULT_SETTINGS), {
    title: "One-off",
    due: today,
  });
  const { spawned } = completeTask(deps, data, task.id);
  assert.equal(spawned, null);
});

test("removing a habit cascades its completion events", () => {
  const deps = makeDeps();
  let { data, habit } = createHabit(deps, emptyAppData(DEFAULT_SETTINGS), {
    name: "Read",
    schedule: { kind: "daily" },
  });
  ({ data } = logHabitCompletion(deps, data, habit.id, today));
  assert.equal(data.habitCompletions.length, 1);
  data = removeHabit(deps, data, habit.id);
  assert.equal(data.habits.length, 0);
  assert.equal(data.habitCompletions.length, 0);
});

test("setHabitChecked is idempotent when checking twice", () => {
  const deps = makeDeps();
  let { data, habit } = createHabit(deps, emptyAppData(DEFAULT_SETTINGS), {
    name: "Bath",
    schedule: { kind: "daily" },
  });
  data = setHabitChecked(deps, data, habit.id, today, true);
  data = setHabitChecked(deps, data, habit.id, today, true);
  assert.equal(data.habitCompletions.length, 1);
});

test("journal upsert creates then merges without clobbering other fields", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  ({ data } = upsertJournalEntry(deps, data, today, { accomplished: "shipped" }));
  ({ data } = upsertJournalEntry(deps, data, today, { learned: "migrations" }));
  assert.equal(data.journal.length, 1);
  const e = data.journal[0]!;
  assert.equal(e.accomplished, "shipped");
  assert.equal(e.learned, "migrations");
});

test("updateSettings merges", () => {
  const deps = makeDeps();
  const data = updateSettings(deps, emptyAppData(DEFAULT_SETTINGS), {
    weekStartsOn: 0,
  });
  assert.equal(data.settings.weekStartsOn, 0);
  assert.equal(data.settings.timeZone, "Asia/Kolkata"); // unchanged
});

test("createExercise preserves explicit null loadUnit (bodyweight) but defaults when unspecified", () => {
  const deps = makeDeps();
  const data = emptyAppData(DEFAULT_SETTINGS);
  // Explicit bodyweight — null must survive (regression: `?? "kg"` used to clobber it).
  const bw = createExercise(deps, data, { name: "Push-ups", loadUnit: null });
  assert.equal(bw.exercise.loadUnit, null);
  // Unspecified — defaults to kg.
  const def = createExercise(deps, data, { name: "Squat" });
  assert.equal(def.exercise.loadUnit, "kg");
  // Explicit unit is kept.
  const lb = createExercise(deps, data, { name: "Deadlift", loadUnit: "lb" });
  assert.equal(lb.exercise.loadUnit, "lb");
});
