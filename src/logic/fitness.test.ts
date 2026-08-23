import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAppData } from "../domain/appData";
import { DEFAULT_SETTINGS } from "../config";
import {
  createExercise,
  createWorkoutSession,
  addSessionExercise,
  addSet,
  logBodyWeight,
  logMeasurement,
} from "../state/operations";
import type { ExerciseId, WorkoutSessionId, SessionExerciseId } from "../domain/ids";
import {
  estimatedOneRepMax,
  sessionVolume,
  exercisePR,
  progressiveOverload,
  bodyWeightTrend,
  latestMeasurements,
  weeklyProgress,
} from "./fitness";
import { ld, makeDeps } from "../testing/util";

const seedSquatSession = (
  deps: ReturnType<typeof makeDeps>,
  data: ReturnType<typeof emptyAppData>,
  exId: ExerciseId,
  date: string,
  sets: readonly [number, number][], // [reps, weight]
) => {
  let d = data;
  const s = createWorkoutSession(deps, d, { date: ld(date), name: "Legs" });
  d = s.data;
  d = addSessionExercise(deps, d, s.session.id as WorkoutSessionId, exId);
  const seId = (findSessionExerciseId(d, s.session.id)) as SessionExerciseId;
  for (const [reps, weight] of sets) {
    d = addSet(deps, d, s.session.id as WorkoutSessionId, seId, { reps, weight });
  }
  return { data: d, sessionId: s.session.id };
};

const findSessionExerciseId = (
  data: ReturnType<typeof emptyAppData>,
  sessionId: string,
): string => {
  const s = data.workoutSessions.find((x) => x.id === sessionId)!;
  return s.exercises[0]!.id;
};

test("estimatedOneRepMax uses Epley and handles edge cases", () => {
  assert.equal(estimatedOneRepMax(100, 1), 100);
  assert.equal(Math.round(estimatedOneRepMax(100, 10)), 133);
  assert.equal(estimatedOneRepMax(0, 5), 0);
});

test("sessionVolume sums completed sets only", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const ex = createExercise(deps, data, { name: "Squat" });
  data = ex.data;
  const r = seedSquatSession(deps, data, ex.exercise.id as ExerciseId, "2025-08-22", [
    [5, 100],
    [5, 100],
  ]);
  data = r.data;
  const session = data.workoutSessions[0]!;
  assert.equal(sessionVolume(session), 1000);
});

test("exercisePR captures max weight, reps and best e1RM", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const ex = createExercise(deps, data, { name: "Bench" });
  data = ex.data;
  data = seedSquatSession(deps, data, ex.exercise.id as ExerciseId, "2025-08-20", [
    [10, 60],
    [3, 90],
  ]).data;
  const pr = exercisePR(data, ex.exercise.id as ExerciseId);
  assert.equal(pr.maxWeight, 90);
  assert.equal(pr.maxReps, 10);
  assert.ok(pr.bestOneRepMax >= 90);
  assert.equal(pr.onDate, ld("2025-08-20"));
});

test("progressiveOverload compares the two latest sessions", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const ex = createExercise(deps, data, { name: "Deadlift" });
  data = ex.data;
  const exId = ex.exercise.id as ExerciseId;
  data = seedSquatSession(deps, data, exId, "2025-08-15", [[5, 100]]).data;
  data = seedSquatSession(deps, data, exId, "2025-08-22", [[5, 110]]).data;
  const o = progressiveOverload(data, exId);
  assert.equal(o.trend, "up");
  assert.ok(o.deltaPercent > 0);

  const single = createExercise(deps, data, { name: "Row" });
  assert.equal(progressiveOverload(single.data, single.exercise.id as ExerciseId).trend, "insufficient");
});

test("bodyWeightTrend reports latest and delta", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  ({ data } = logBodyWeight(deps, data, { date: ld("2025-08-20"), weight: 80 }));
  ({ data } = logBodyWeight(deps, data, { date: ld("2025-08-22"), weight: 79.2 }));
  const t = bodyWeightTrend(data);
  assert.equal(t.latest, 79.2);
  assert.equal(t.latestDate, ld("2025-08-22"));
  assert.ok(t.delta !== null && Math.abs(t.delta - -0.8) < 1e-9);
  assert.equal(t.unit, "kg");
});

test("latestMeasurements keeps the newest per site", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  ({ data } = logMeasurement(deps, data, { date: ld("2025-08-10"), site: "waist", value: 85 }));
  ({ data } = logMeasurement(deps, data, { date: ld("2025-08-22"), site: "waist", value: 83 }));
  ({ data } = logMeasurement(deps, data, { date: ld("2025-08-22"), site: "chest", value: 100 }));
  const m = latestMeasurements(data);
  assert.equal(m.length, 2);
  const waist = m.find((x) => x.site === "waist")!;
  assert.equal(waist.value, 83);
});

test("weeklyProgress counts sessions in the last 7 days", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const ex = createExercise(deps, data, { name: "Squat" });
  data = ex.data;
  const exId = ex.exercise.id as ExerciseId;
  data = seedSquatSession(deps, data, exId, "2025-08-22", [[5, 100]]).data; // today
  data = seedSquatSession(deps, data, exId, "2025-08-01", [[5, 100]]).data; // >7d ago
  const w = weeklyProgress(data, ld("2025-08-22"));
  assert.equal(w.sessions, 1);
  assert.equal(w.volume, 500);
});
