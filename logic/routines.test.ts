import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAppData } from "../domain/appData";
import { DEFAULT_SETTINGS } from "../config";
import {
  createHabit,
  createRoutine,
  setHabitChecked,
} from "../state/operations";
import { isRoutineDueOn, routineProgress } from "./routines";
import { ld, makeDeps } from "../testing/util";

const today = ld("2025-08-22");

test("routine progress reflects completed member habits", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const h1 = createHabit(deps, data, { name: "Brush", schedule: { kind: "daily" } });
  data = h1.data;
  const h2 = createHabit(deps, data, { name: "Face wash", schedule: { kind: "daily" } });
  data = h2.data;
  const r = createRoutine(deps, data, {
    name: "Morning",
    daypart: "morning",
    schedule: { kind: "daily" },
    steps: [{ habitId: h1.habit.id }, { habitId: h2.habit.id }],
  });
  data = r.data;

  assert.ok(isRoutineDueOn(r.routine, today));
  let p = routineProgress(r.routine, today, data.habits, data.habitCompletions);
  assert.deepEqual({ done: p.done, total: p.total, ratio: p.ratio }, {
    done: 0,
    total: 2,
    ratio: 0,
  });

  data = setHabitChecked(deps, data, h1.habit.id, today, true);
  p = routineProgress(r.routine, today, data.habits, data.habitCompletions);
  assert.equal(p.done, 1);
  assert.equal(p.total, 2);
  assert.equal(p.ratio, 0.5);
});

test("steps pointing at a missing habit are ignored, not counted", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const h1 = createHabit(deps, data, { name: "Brush", schedule: { kind: "daily" } });
  data = h1.data;
  const r = createRoutine(deps, data, {
    name: "Morning",
    schedule: { kind: "daily" },
    steps: [{ habitId: h1.habit.id }],
  });
  data = r.data;
  // remove the habit; step now dangles
  data = { ...data, habits: [] };
  const p = routineProgress(r.routine, today, data.habits, data.habitCompletions);
  assert.equal(p.total, 0);
  assert.equal(p.ratio, 0);
});
