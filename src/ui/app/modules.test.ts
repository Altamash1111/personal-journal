import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../persistence/store";
import { MemoryStorageAdapter } from "../../persistence/adapter";
import { fixedClock } from "../../core/clock";
import { sequentialFactory } from "../../core/id";
import type { OpDeps } from "../../state/helpers";
import type { WorkoutSessionId, SessionExerciseId, ReadingItemId } from "../../domain/ids";
import { AppController } from "./controller";

const ISO = "2025-08-22T06:00:00.000Z";

const makeOps = (): OpDeps => ({
  ids: sequentialFactory("c"),
  clock: fixedClock(ISO),
});
const makeController = (adapter: MemoryStorageAdapter) =>
  new AppController({ store: new Store(adapter, { clock: fixedClock(ISO) }), ops: makeOps() });

test("diet + water intents persist and drive the diet view", async () => {
  const adapter = new MemoryStorageAdapter();
  const c1 = makeController(adapter);
  await c1.init();
  await c1.logMeal({
    type: "lunch",
    name: "Rice bowl",
    macros: { kcal: 600, protein: 50, carbs: 60, fat: 18 },
  });
  await c1.logWater(750);
  const v1 = c1.dietView();
  assert.equal(v1.meals.length, 1);
  assert.equal(v1.progress.calories.current, 600);
  assert.equal(v1.progress.waterMl, 750);

  // Reload over the same adapter: data survived.
  const c2 = makeController(adapter);
  await c2.init();
  assert.equal(c2.loadStatus(), "loaded");
  assert.equal(c2.dietView().meals.length, 1);
  assert.equal(c2.dietView().progress.protein.current, 50);
});

test("a full workout flows through session -> exercise -> set and persists", async () => {
  const adapter = new MemoryStorageAdapter();
  const c = makeController(adapter);
  await c.init();
  const exId = await c.addExercise({ name: "Bench", loadUnit: "kg" });
  await c.startWorkout({ date: c.today(), name: "Push" });
  const sessionId = c.getState().workoutSessions[0]!.id as WorkoutSessionId;
  await c.addExerciseToSession(sessionId, exId);
  const seId = c.getState().workoutSessions[0]!.exercises[0]!.id as SessionExerciseId;
  await c.addSetToSession(sessionId, seId, 8, 60);
  await c.addSetToSession(sessionId, seId, 8, 62.5);
  await c.finishWorkout(sessionId);

  const fv = c.fitnessView();
  assert.equal(fv.sessions.length, 1);
  assert.equal(fv.sessions[0]!.exercises[0]!.sets.length, 2);
  assert.equal(fv.sessions[0]!.completed, true);
  assert.ok(fv.sessions[0]!.volume === 8 * 60 + 8 * 62.5);
  assert.ok(fv.prs.length === 1);

  const c2 = makeController(adapter);
  await c2.init();
  assert.equal(c2.fitnessView().sessions[0]!.exercises[0]!.sets.length, 2);
});

test("sleep target + log update the sleep view and persist", async () => {
  const adapter = new MemoryStorageAdapter();
  const c = makeController(adapter);
  await c.init();
  await c.setSleepTarget(450);
  await c.logSleep({ durationMinutes: 430, bedtime: "23:30", wakeTime: "06:40", quality: 4 });
  const sv = c.sleepView();
  assert.equal(sv.targetMinutes, 450);
  assert.equal(sv.progress.durationMinutes, 430);
  assert.equal(sv.nights.length, 1);

  const c2 = makeController(adapter);
  await c2.init();
  assert.equal(c2.sleepView().targetMinutes, 450);
  assert.equal(c2.getState().sleepLog[0]!.quality, 4);
});

test("reading progress auto-advances status and persists", async () => {
  const adapter = new MemoryStorageAdapter();
  const c = makeController(adapter);
  await c.init();
  await c.addReadingItem({ kind: "book", title: "Deep Work", total: 300 });
  const id = c.getState().reading[0]!.id as ReadingItemId;
  await c.setReadingProgress(id, 300);
  assert.equal(c.readingView().finished.length, 1);
  await c.addLearning({ text: "Focus is a skill", topic: "work" });
  assert.equal(c.readingView().learningToday.length, 1);

  const c2 = makeController(adapter);
  await c2.init();
  assert.equal(c2.readingView().finished.length, 1);
});

test("routines: add habit, group into a routine, all persist", async () => {
  const adapter = new MemoryStorageAdapter();
  const c = makeController(adapter);
  await c.init();
  await c.addHabitAdmin({ name: "Brush AM", schedule: { kind: "daily" }, daypart: "morning" });
  const habitId = c.getState().habits[0]!.id;
  await c.createRoutineWith({ name: "Morning", schedule: { kind: "daily" }, daypart: "morning", steps: [] });
  const routineId = c.getState().routines[0]!.id;
  await c.addStepToRoutine(routineId, habitId);

  const rv = c.routinesView();
  assert.equal(rv.habits.length, 1);
  assert.equal(rv.routines[0]!.steps.length, 1);
  assert.equal(rv.routines[0]!.steps[0]!.name, "Brush AM");

  const c2 = makeController(adapter);
  await c2.init();
  assert.equal(c2.routinesView().routines[0]!.steps.length, 1);
});
