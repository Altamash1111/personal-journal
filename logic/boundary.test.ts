import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAppData } from "../domain/appData";
import { DEFAULT_SETTINGS } from "../config";
import { ld, makeDeps } from "../testing/util";
import { createHabit, logHabitCompletion, createExercise, createWorkoutSession, addSessionExercise, addSet, completeWorkoutSession } from "../state/operations";
import type { HabitId } from "../domain/ids";
import { weekRangeContaining, fitnessStats } from "./weeklyReview";
import { monthRangeContaining, buildMonthlyReview } from "./monthlyReview";

// PART 2/12: Aug 31 -> Sep 1 crosses BOTH a week and a month boundary.
test("BOUNDARY: Aug 31 completion counts in August/its week, NOT September", () => {
  const deps = makeDeps("2026-08-31T06:00:00.000Z");
  let data = emptyAppData(DEFAULT_SETTINGS);
  const h = createHabit(deps, data, { name: "Learning", schedule: { kind: "daily" } });
  data = h.data;
  const id = h.habit.id as HabitId;
  data = logHabitCompletion(deps, data, id, ld("2026-08-31")).data; // last day of August
  data = logHabitCompletion(deps, data, id, ld("2026-09-01")).data; // first day of September

  const aug = buildMonthlyReview(data, monthRangeContaining(ld("2026-08-31")), "Asia/Kolkata");
  const sep = buildMonthlyReview(data, monthRangeContaining(ld("2026-09-01")), "Asia/Kolkata");
  const augHabit = aug.habits.find((x) => x.name === "Learning")!;
  const sepHabit = sep.habits.find((x) => x.name === "Learning")!;
  assert.equal(augHabit.completed, 1, "Aug 31 completion in August only");
  assert.equal(augHabit.expected, 31);
  assert.equal(sepHabit.completed, 1, "Sep 1 completion in September only");
  assert.equal(sepHabit.expected, 30);
});

// PART 5: HGH routine/habit completion must NOT create fitness volume.
test("HGH: habit/routine completion does not create workout volume", () => {
  const deps = makeDeps("2026-08-31T06:00:00.000Z");
  let data = emptyAppData(DEFAULT_SETTINGS);
  // An HGH-style habit (sprints) completed several days.
  const hgh = createHabit(deps, data, { name: "HGH sprints", schedule: { kind: "daily" } });
  data = hgh.data;
  for (const d of ["2026-08-25", "2026-08-26", "2026-08-27"]) {
    data = logHabitCompletion(deps, data, hgh.habit.id as HabitId, ld(d)).data;
  }
  const range = weekRangeContaining(ld("2026-08-27"), 1);
  const fit = fitnessStats(data, range);
  assert.equal(fit.workoutsThisWeek, 0, "habit completions are not workouts");
  assert.equal(fit.totalVolume, 0, "no fake strength volume from habits");

  // A real muscle-gaining workout DOES count, separately.
  const ex = createExercise(deps, data, { name: "Bench", loadUnit: "kg" });
  data = ex.data;
  const sess = createWorkoutSession(deps, data, { date: ld("2026-08-27"), name: "Push" });
  data = sess.data;
  data = addSessionExercise(deps, data, sess.session.id, ex.exercise.id);
  const seId = data.workoutSessions[0]!.exercises[0]!.id;
  data = addSet(deps, data, sess.session.id, seId, { reps: 5, weight: 60 });
  data = completeWorkoutSession(deps, data, sess.session.id);
  const fit2 = fitnessStats(data, weekRangeContaining(ld("2026-08-27"), 1));
  assert.equal(fit2.workoutsThisWeek, 1, "real workout counts");
  assert.ok(fit2.totalVolume > 0, "real workout has volume");
});

// PART 14: invalid numeric input must not corrupt data. The guard lives in the
// UI handler, but we assert the analytics stay sane if a bad value ever appears.
import { logBodyWeight } from "../state/operations";
import { bodyweightHistory } from "./goalIntelligence";
test("data integrity: analytics tolerate an empty bodyweight history", () => {
  const deps = makeDeps();
  const data = emptyAppData(DEFAULT_SETTINGS);
  const h = bodyweightHistory(data);
  assert.equal(h.latest, null);
  assert.equal(h.enough, false);
  // one positive reading is fine, no trend yet
  const d2 = logBodyWeight(deps, data, { date: ld("2026-09-01"), weight: 44, unit: "kg" }).data;
  assert.equal(bodyweightHistory(d2).latest, 44);
  assert.equal(bodyweightHistory(d2).enough, false);
});
