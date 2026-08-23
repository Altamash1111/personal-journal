import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAppData } from "../domain/appData";
import { DEFAULT_SETTINGS } from "../config";
import {
  createHabit,
  setHabitChecked,
  logHabitCompletion,
} from "../state/operations";
import {
  isHabitDueOn,
  isHabitCompletedOn,
  habitDayRatio,
  currentStreak,
} from "./habits";
import { ld, makeDeps } from "../testing/util";

const today = ld("2025-08-22");

test("plain habit: due, check, uncheck", () => {
  const deps = makeDeps();
  let { data, habit } = createHabit(deps, emptyAppData(DEFAULT_SETTINGS), {
    name: "Brush",
    schedule: { kind: "daily" },
    daypart: "morning",
  });
  assert.ok(isHabitDueOn(habit, today));
  assert.equal(isHabitCompletedOn(habit, today, data.habitCompletions), false);

  data = setHabitChecked(deps, data, habit.id, today, true);
  assert.ok(isHabitCompletedOn(habit, today, data.habitCompletions));
  assert.equal(habitDayRatio(habit, today, data.habitCompletions), 1);

  data = setHabitChecked(deps, data, habit.id, today, false);
  assert.equal(isHabitCompletedOn(habit, today, data.habitCompletions), false);
});

test("measurable habit reaches target across completions", () => {
  const deps = makeDeps();
  let { data, habit } = createHabit(deps, emptyAppData(DEFAULT_SETTINGS), {
    name: "Water",
    schedule: { kind: "daily" },
    target: { amount: 8, unit: "glasses" },
  });
  ({ data } = logHabitCompletion(deps, data, habit.id, today, { amount: 3 }));
  assert.equal(isHabitCompletedOn(habit, today, data.habitCompletions), false);
  assert.equal(habitDayRatio(habit, today, data.habitCompletions), 3 / 8);
  ({ data } = logHabitCompletion(deps, data, habit.id, today, { amount: 5 }));
  assert.ok(isHabitCompletedOn(habit, today, data.habitCompletions));
  assert.equal(habitDayRatio(habit, today, data.habitCompletions), 1);
});

test("currentStreak counts consecutive completed due-days", () => {
  const deps = makeDeps();
  let { data, habit } = createHabit(deps, emptyAppData(DEFAULT_SETTINGS), {
    name: "Read",
    schedule: { kind: "daily" },
  });
  for (const d of ["2025-08-20", "2025-08-21", "2025-08-22"]) {
    data = setHabitChecked(deps, data, habit.id, ld(d), true);
  }
  assert.equal(currentStreak(habit, data.habitCompletions, today), 3);
  // a gap two days back should stop the streak there
  assert.equal(currentStreak(habit, data.habitCompletions, ld("2025-08-19")), 0);
});

test("inactive/archived habit is never due", () => {
  const deps = makeDeps();
  const { habit } = createHabit(deps, emptyAppData(DEFAULT_SETTINGS), {
    name: "X",
    schedule: { kind: "daily" },
    active: false,
  });
  assert.equal(isHabitDueOn(habit, today), false);
});
