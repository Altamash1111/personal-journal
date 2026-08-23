import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAppData } from "../../domain/appData";
import { DEFAULT_SETTINGS } from "../../config";
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
  createHabit,
  createRoutine,
} from "../../state/operations";
import type { WorkoutSessionId, SessionExerciseId, ReadingItemId } from "../../domain/ids";
import {
  buildFitnessView,
  buildDietView,
  buildSleepView,
  buildRoutinesView,
  buildReadingView,
} from "../model/modules";
import { ld, makeDeps } from "../../testing/util";

/* ------- Minimal fake DOM (same shape as render.test.ts) ------- */
class FakeText {
  constructor(public readonly text: string) {}
}
class FakeEl {
  readonly attrs = new Map<string, string>();
  children: Array<FakeEl | FakeText> = [];
  #html = "";
  constructor(public readonly tag: string) {}
  setAttribute(k: string, v: string): void {
    this.attrs.set(k, String(v));
  }
  appendChild(c: FakeEl | FakeText): FakeEl | FakeText {
    this.children.push(c);
    return c;
  }
  replaceChildren(...c: Array<FakeEl | FakeText>): void {
    this.children = c;
  }
  set innerHTML(s: string) {
    this.#html = String(s);
  }
  get innerHTML(): string {
    return this.#html;
  }
}
const fakeDoc = {
  createElement: (t: string): FakeEl => new FakeEl(t),
  createTextNode: (t: string): FakeText => new FakeText(t),
};
(globalThis as unknown as { document: unknown }).document = fakeDoc;

const {
  renderFitness,
  renderDiet,
  renderSleep,
  renderRoutines,
  renderReading,
} = await import("./modules");

const walk = (node: FakeEl | FakeText, visit: (n: FakeEl | FakeText) => void): void => {
  visit(node);
  if (node instanceof FakeEl) for (const c of node.children) walk(c, visit);
};
const collect = (root: FakeEl, attr: string): string[] => {
  const out: string[] = [];
  walk(root, (n) => {
    if (n instanceof FakeEl) {
      const a = n.attrs.get(attr);
      if (a !== undefined) out.push(a);
    }
  });
  return out;
};
const allText = (root: FakeEl): string => {
  let s = "";
  walk(root, (n) => {
    if (n instanceof FakeText) s += n.text + " ";
  });
  return s;
};

const today = ld("2025-08-22");

const populated = () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const ex = createExercise(deps, data, { name: "Bench press" });
  data = ex.data;
  const s = createWorkoutSession(deps, data, { date: today, name: "Push" });
  data = s.data;
  data = addSessionExercise(deps, data, s.session.id as WorkoutSessionId, ex.exercise.id);
  const seId = data.workoutSessions[0]!.exercises[0]!.id as SessionExerciseId;
  data = addSet(deps, data, s.session.id as WorkoutSessionId, seId, { reps: 8, weight: 60 });
  ({ data } = logMeal(deps, data, { date: today, type: "lunch", name: "Rice bowl", macros: { kcal: 600, protein: 50, carbs: 60, fat: 18 } }));
  ({ data } = logWater(deps, data, { date: today, amountMl: 1500 }));
  ({ data } = logSleep(deps, data, { date: today, durationMinutes: 445, quality: 4 }));
  const r = createReadingItem(deps, data, { kind: "book", title: "Atomic Habits", total: 320 });
  data = r.data;
  data = setReadingStatus(deps, data, r.item.id as ReadingItemId, "current", today);
  const hab = createHabit(deps, data, { name: "Brush AM", schedule: { kind: "daily" }, daypart: "morning" });
  data = hab.data;
  ({ data } = createRoutine(deps, data, { name: "Morning", schedule: { kind: "daily" }, daypart: "morning", steps: [{ habitId: hab.habit.id }] }));
  return data;
};

test("fitness page renders sessions, PRs and interactive forms", () => {
  const root = renderFitness(buildFitnessView(populated(), today)) as unknown as FakeEl;
  const text = allText(root);
  assert.ok(/Fitness/.test(text));
  assert.ok(/Bench press/.test(text));
  assert.ok(/Push/.test(text));
  const forms = collect(root, "data-form");
  assert.ok(forms.includes("log-bodyweight"));
  assert.ok(forms.includes("add-exercise"));
  assert.ok(forms.includes("add-set"));
  assert.ok(collect(root, "data-action").includes("form-submit"));
  assert.ok(collect(root, "data-action").includes("finish-workout"));
});

test("diet page renders progress, meals and water actions", () => {
  const root = renderDiet(buildDietView(populated(), today, DEFAULT_SETTINGS)) as unknown as FakeEl;
  const text = allText(root);
  assert.ok(/Diet/.test(text));
  assert.ok(/Rice bowl/.test(text));
  assert.ok(/Calories/.test(text));
  const acts = collect(root, "data-action");
  assert.ok(acts.includes("log-water"));
  assert.ok(acts.includes("delete-meal"));
  assert.ok(collect(root, "data-form").includes("log-meal"));
});

test("sleep page renders duration + log form", () => {
  const root = renderSleep(buildSleepView(populated(), today, DEFAULT_SETTINGS)) as unknown as FakeEl;
  assert.ok(/Sleep/.test(allText(root)));
  assert.ok(collect(root, "data-form").includes("log-sleep"));
  assert.ok(collect(root, "data-form").includes("set-sleep-target"));
});

test("routines page renders habits, routines and admin actions", () => {
  const root = renderRoutines(buildRoutinesView(populated())) as unknown as FakeEl;
  const text = allText(root);
  assert.ok(/Brush AM/.test(text));
  assert.ok(/Morning/.test(text));
  const acts = collect(root, "data-action");
  assert.ok(acts.includes("toggle-habit-active"));
  assert.ok(acts.includes("delete-habit"));
  assert.ok(collect(root, "data-form").includes("add-habit"));
});

test("reading page renders items, status and note forms", () => {
  const root = renderReading(buildReadingView(populated(), today)) as unknown as FakeEl;
  const text = allText(root);
  assert.ok(/Atomic Habits/.test(text));
  const forms = collect(root, "data-form");
  assert.ok(forms.includes("add-reading"));
  assert.ok(forms.includes("set-progress"));
  assert.ok(forms.includes("add-note"));
  assert.ok(collect(root, "data-action").includes("reading-status"));
});
