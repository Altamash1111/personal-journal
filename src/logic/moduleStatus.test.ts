import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAppData } from "../domain/appData";
import { DEFAULT_SETTINGS } from "../config";
import { fixedClock } from "../core/clock";
import {
  createExercise,
  createWorkoutSession,
  addSessionExercise,
  addSet,
  logMeal,
  logWater,
  logSleep,
  createReadingItem,
  setReadingStatus,
  addLearningLog,
} from "../state/operations";
import type { ExerciseId, WorkoutSessionId, SessionExerciseId, ReadingItemId } from "../domain/ids";
import { todayModuleStatus } from "./moduleStatus";
import { exportJson, importJson } from "../persistence/serialization";
import { ld, makeDeps } from "../testing/util";

const today = ld("2025-08-22");

const fullyPopulated = () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const ex = createExercise(deps, data, { name: "Squat" });
  data = ex.data;
  const s = createWorkoutSession(deps, data, { date: today, name: "Legs" });
  data = s.data;
  data = addSessionExercise(deps, data, s.session.id as WorkoutSessionId, ex.exercise.id as ExerciseId);
  const seId = data.workoutSessions[0]!.exercises[0]!.id as SessionExerciseId;
  data = addSet(deps, data, s.session.id as WorkoutSessionId, seId, { reps: 5, weight: 100 });

  ({ data } = logMeal(deps, data, { date: today, type: "lunch", name: "Bowl", macros: { kcal: 600, protein: 50, carbs: 40, fat: 20 } }));
  ({ data } = logWater(deps, data, { date: today, amountMl: 1500 }));
  ({ data } = logSleep(deps, data, { date: today, durationMinutes: 450 }));
  const r = createReadingItem(deps, data, { kind: "book", title: "Book", total: 200 });
  data = r.data;
  data = setReadingStatus(deps, data, r.item.id as ReadingItemId, "current", today);
  ({ data } = addLearningLog(deps, data, { date: today, text: "note" }));
  return data;
};

test("todayModuleStatus aggregates all modules for the day", () => {
  const status = todayModuleStatus(fullyPopulated(), today, DEFAULT_SETTINGS);
  assert.equal(status.workout.loggedToday, true);
  assert.equal(status.workout.sessionsThisWeek, 1);
  assert.equal(status.workout.volumeThisWeek, 500);
  assert.equal(status.nutrition.calories.current, 600);
  assert.equal(status.nutrition.protein.current, 50);
  assert.equal(status.nutrition.water.current, 1500);
  assert.equal(status.sleep.logged, true);
  assert.equal(status.sleep.durationMinutes, 450);
  assert.equal(status.reading.currentlyReading, 1);
  assert.equal(status.reading.notesToday, 1);
});

test("empty day reports nothing logged", () => {
  const status = todayModuleStatus(emptyAppData(DEFAULT_SETTINGS), today, DEFAULT_SETTINGS);
  assert.equal(status.workout.loggedToday, false);
  assert.equal(status.nutrition.calories.current, 0);
  assert.equal(status.sleep.logged, false);
  assert.equal(status.reading.currentlyReading, 0);
});

test("Phase 3 data survives an export -> import round-trip exactly", () => {
  const clock = fixedClock("2025-08-22T06:00:00.000Z");
  const data = fullyPopulated();
  const outcome = importJson(exportJson(data, clock));
  assert.equal(outcome.status, "loaded");
  if (outcome.status !== "loaded") return;
  assert.deepEqual(outcome.data, data);
  assert.equal(outcome.issues.length, 0);
  assert.equal(outcome.migratedFrom, null);
});
