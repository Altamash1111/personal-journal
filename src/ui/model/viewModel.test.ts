import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAppData } from "../../domain/appData";
import { DEFAULT_SETTINGS } from "../../config";
import {
  createTask,
  createHabit,
  createRoutine,
  createGoal,
  setHabitChecked,
  completeTask,
} from "../../state/operations";
import { buildTodayView, greetingFor } from "./viewModel";
import { ld, makeDeps } from "../../testing/util";

const today = ld("2025-08-22");

test("greetingFor buckets the day", () => {
  assert.equal(greetingFor(2), "Still up");
  assert.equal(greetingFor(9), "Good morning");
  assert.equal(greetingFor(14), "Good afternoon");
  assert.equal(greetingFor(19), "Good evening");
  assert.equal(greetingFor(23), "Good night");
});

test("empty state is reported when nothing exists", () => {
  const vm = buildTodayView(emptyAppData(DEFAULT_SETTINGS), today, 9);
  assert.equal(vm.isEmpty, true);
  assert.equal(vm.tasks.length, 0);
  assert.equal(vm.habits.length, 0);
  assert.equal(vm.summary.overall, 1); // nothing due => 1
});

test("today's tasks include overdue + due-today, sorted by priority", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  ({ data } = createTask(deps, data, { title: "later", due: ld("2025-08-25") }));
  ({ data } = createTask(deps, data, { title: "overdue", due: ld("2025-08-20") }));
  ({ data } = createTask(deps, data, { title: "urgent today", due: today, priority: "urgent" }));
  const vm = buildTodayView(data, today, 9);
  assert.equal(vm.tasks.length, 2); // overdue + today, not the future one
  assert.equal(vm.tasks[0]!.title, "urgent today"); // urgent first
  assert.ok(vm.tasks.some((t) => t.overdue));
});

test("priorities surface up to 3 high-signal tasks", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  for (const [title, priority] of [
    ["a", "urgent"],
    ["b", "high"],
    ["c", "medium"],
    ["d", "low"],
  ] as const) {
    ({ data } = createTask(deps, data, { title, due: today, priority }));
  }
  const vm = buildTodayView(data, today, 9);
  assert.equal(vm.priorities.length, 3);
  assert.equal(vm.priorities[0]!.priority, "urgent");
});

test("habit rows reflect Phase 1 completion + measurable progress", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const plain = createHabit(deps, data, { name: "Meditate", schedule: { kind: "daily" } });
  data = plain.data;
  const water = createHabit(deps, data, {
    name: "Water",
    schedule: { kind: "daily" },
    target: { amount: 8, unit: "glasses" },
  });
  data = water.data;
  data = setHabitChecked(deps, data, plain.habit.id, today, true);

  const vm = buildTodayView(data, today, 9);
  assert.equal(vm.habits.length, 2);
  const plainRow = vm.habits.find((h) => h.name === "Meditate")!;
  const waterRow = vm.habits.find((h) => h.name === "Water")!;
  assert.equal(plainRow.done, true);
  assert.equal(plainRow.measurable, false);
  assert.equal(waterRow.measurable, true);
  assert.equal(waterRow.done, false);
  assert.equal(waterRow.target, 8);
  assert.equal(waterRow.ratio, 0);
});

test("routines are grouped into Morning / Day / Night with progress", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const h1 = createHabit(deps, data, { name: "Stretch", schedule: { kind: "daily" } });
  data = h1.data;
  const h2 = createHabit(deps, data, { name: "Read", schedule: { kind: "daily" } });
  data = h2.data;
  ({ data } = createRoutine(deps, data, {
    name: "Morning ritual",
    schedule: { kind: "daily" },
    daypart: "morning",
    steps: [{ habitId: h1.habit.id }],
  }));
  ({ data } = createRoutine(deps, data, {
    name: "Wind down",
    schedule: { kind: "daily" },
    daypart: "night",
    steps: [{ habitId: h2.habit.id }],
  }));
  data = setHabitChecked(deps, data, h1.habit.id, today, true);

  const vm = buildTodayView(data, today, 9);
  const buckets = vm.routineGroups.map((g) => g.bucket);
  assert.deepEqual(buckets, ["Morning", "Night"]); // no "Day" group when empty
  const morning = vm.routineGroups.find((g) => g.bucket === "Morning")!;
  assert.equal(morning.routines[0]!.ratio, 1); // stretch done
  const night = vm.routineGroups.find((g) => g.bucket === "Night")!;
  assert.equal(night.routines[0]!.ratio, 0);
});

test("goal widget shows transparent percent and hides archived", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  ({ data } = createGoal(deps, data, {
    horizon: "year",
    name: "Books",
    metric: { target: 10, current: 3, unit: null },
  }));
  ({ data } = createGoal(deps, data, {
    horizon: "month",
    name: "Old",
    status: "archived",
  }));
  const vm = buildTodayView(data, today, 9);
  assert.equal(vm.goals.length, 1);
  assert.equal(vm.goals[0]!.percent, 30);
});

test("summary overall matches completed work", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const h = createHabit(deps, data, { name: "H", schedule: { kind: "daily" } });
  data = h.data;
  const t = createTask(deps, data, { title: "T", due: today });
  data = t.data;
  data = setHabitChecked(deps, data, h.habit.id, today, true);
  ({ data } = completeTask(deps, data, t.task.id));
  const vm = buildTodayView(data, today, 9);
  assert.equal(vm.summary.overall, 1); // 1 habit + 1 task, both done
});
