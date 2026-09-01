import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAppData } from "../domain/appData";
import { DEFAULT_SETTINGS } from "../config";
import { fixedClock } from "../core/clock";
import {
  createGoal,
  createTask,
  createHabit,
  logHabitCompletion,
  updateSettings,
} from "../state/operations";
import { exportJson, importJson } from "./serialization";
import { ld, makeDeps } from "../testing/util";

const populated = () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  ({ data } = createGoal(deps, data, {
    horizon: "year",
    name: "Read 20 books",
    metric: { target: 20, current: 3, unit: "books" },
  }));
  ({ data } = createTask(deps, data, { title: "Workout", due: ld("2025-08-22") }));
  const h = createHabit(deps, data, { name: "Brush", schedule: { kind: "daily" } });
  data = h.data;
  ({ data } = logHabitCompletion(deps, data, h.habit.id, ld("2025-08-22")));
  return data;
};

test("export -> import round-trips AppData exactly", () => {
  const clock = fixedClock("2025-08-22T06:00:00.000Z");
  const data = populated();
  const json = exportJson(data, clock);
  const outcome = importJson(json);
  assert.equal(outcome.status, "loaded");
  if (outcome.status !== "loaded") return;
  assert.deepEqual(outcome.data, data);
  assert.equal(outcome.migratedFrom, null);
  assert.equal(outcome.issues.length, 0);
});

test("importing a NEWER schema is refused (no data loss)", () => {
  const raw = JSON.stringify({
    schemaVersion: 999,
    savedAt: "2025-08-22T00:00:00.000Z",
    data: {},
  });
  const outcome = importJson(raw);
  assert.equal(outcome.status, "error");
  if (outcome.status !== "error") return;
  assert.equal(outcome.rawBackup, raw); // original preserved
});

test("importing non-JSON returns error with the raw bytes", () => {
  const raw = "{ this is not json";
  const outcome = importJson(raw);
  assert.equal(outcome.status, "error");
  if (outcome.status !== "error") return;
  assert.equal(outcome.rawBackup, raw);
});

test("F: export -> import preserves saved nutrition targets (2100/80/3000)", () => {
  const clock = fixedClock("2026-08-31T06:00:00.000Z");
  const deps = makeDeps("2026-08-31T06:00:00.000Z");
  // Start from defaults, then save the user's real minimums.
  let data = emptyAppData(DEFAULT_SETTINGS);
  data = updateSettings(deps, data, {
    nutrition: { calories: 2100, proteinGrams: 80, waterMl: 3000 },
  });
  assert.equal(data.settings.nutrition.calories, 2100);

  const json = exportJson(data, clock);
  // The exported JSON carries the saved values (not the 2200/130 defaults).
  const exportedNutrition = JSON.parse(json).data.settings.nutrition;
  assert.deepEqual(exportedNutrition, { calories: 2100, proteinGrams: 80, waterMl: 3000 });

  const outcome = importJson(json);
  assert.equal(outcome.status, "loaded");
  if (outcome.status !== "loaded") return;
  // After re-import the saved minimums are intact (not reset to 2200/130 defaults).
  assert.equal(outcome.data.settings.nutrition.calories, 2100);
  assert.equal(outcome.data.settings.nutrition.proteinGrams, 80);
  assert.equal(outcome.data.settings.nutrition.waterMl, 3000);
});
