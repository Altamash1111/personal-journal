import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAppData } from "../domain/appData";
import { DEFAULT_SETTINGS } from "../config";
import {
  logMeal,
  logWater,
  logSleep,
  createReadingItem,
  updateReadingProgress,
  setReadingStatus,
  addReadingNote,
  addLearningLog,
} from "../state/operations";
import type { ReadingItemId } from "../domain/ids";
import { dayMacros, dayWaterMl, nutritionProgress } from "./diet";
import {
  sleepForDate,
  averageDurationMinutes,
  consistencyScore,
  sleepProgress,
  formatDuration,
} from "./sleep";
import { readingProgress, groupByStatus, learningForDate } from "./reading";
import { ld, makeDeps } from "../testing/util";

const today = ld("2025-08-22");

// ---------- Diet ----------

test("dayMacros sums logged meal items for the date", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  ({ data } = logMeal(deps, data, {
    date: today,
    type: "breakfast",
    name: "Oats",
    macros: { kcal: 350, protein: 12, carbs: 60, fat: 6 },
  }));
  ({ data } = logMeal(deps, data, {
    date: today,
    type: "lunch",
    name: "Chicken bowl",
    macros: { kcal: 650, protein: 55, carbs: 45, fat: 20 },
  }));
  ({ data } = logMeal(deps, data, {
    date: ld("2025-08-21"),
    type: "dinner",
    name: "Yesterday",
    macros: { kcal: 999, protein: 99, carbs: 99, fat: 99 },
  }));
  const m = dayMacros(data, today);
  assert.equal(m.kcal, 1000);
  assert.equal(m.protein, 67);
});

test("water totals and nutrition progress against targets", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  ({ data } = logWater(deps, data, { date: today, amountMl: 500 }));
  ({ data } = logWater(deps, data, { date: today, amountMl: 750 }));
  assert.equal(dayWaterMl(data, today), 1250);
  ({ data } = logMeal(deps, data, {
    date: today,
    type: "snack",
    name: "Shake",
    macros: { kcal: 220, protein: 40, carbs: 8, fat: 3 },
  }));
  const np = nutritionProgress(data, today, DEFAULT_SETTINGS.nutrition);
  assert.equal(np.protein.current, 40);
  assert.equal(np.protein.target, DEFAULT_SETTINGS.nutrition.proteinGrams);
  assert.ok(np.water.ratio > 0 && np.water.ratio < 1);
});

// ---------- Sleep ----------

test("logSleep upserts one entry per night and computes progress", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  ({ data } = logSleep(deps, data, { date: today, durationMinutes: 400 }));
  ({ data } = logSleep(deps, data, { date: today, durationMinutes: 450 })); // overwrite
  assert.equal(data.sleepLog.length, 1);
  const entry = sleepForDate(data, today);
  assert.equal(entry?.durationMinutes, 450);
  const sp = sleepProgress(entry, DEFAULT_SETTINGS.sleepTargetMinutes);
  assert.ok(sp.logged);
  assert.ok(sp.ratio > 0.9 && sp.ratio <= 1);
});

test("averages, consistency and duration formatting", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  ({ data } = logSleep(deps, data, { date: ld("2025-08-20"), durationMinutes: 420 }));
  ({ data } = logSleep(deps, data, { date: ld("2025-08-21"), durationMinutes: 420 }));
  ({ data } = logSleep(deps, data, { date: ld("2025-08-22"), durationMinutes: 420 }));
  assert.equal(averageDurationMinutes(data.sleepLog), 420);
  assert.equal(consistencyScore(data.sleepLog), 1); // identical => perfectly consistent
  assert.equal(consistencyScore([]), null);
  assert.equal(formatDuration(450), "7h 30m");
});

// ---------- Reading ----------

test("reading progress + auto status transitions", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const item = createReadingItem(deps, data, {
    kind: "book",
    title: "Deep Work",
    total: 300,
  });
  data = item.data;
  const id = item.item.id as ReadingItemId;
  assert.equal(item.item.status, "upcoming");

  data = updateReadingProgress(deps, data, id, 150, today);
  let r = data.reading.find((x) => x.id === id)!;
  assert.equal(r.status, "current");
  assert.equal(r.startedAt, today);
  assert.ok(Math.abs(readingProgress(r) - 0.5) < 1e-9);

  data = updateReadingProgress(deps, data, id, 300, today);
  r = data.reading.find((x) => x.id === id)!;
  assert.equal(r.status, "finished");
  assert.equal(r.finishedAt, today);
  assert.equal(readingProgress(r), 1);
});

test("reading notes, manual status, and grouping", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const a = createReadingItem(deps, data, { kind: "book", title: "A", total: 100 });
  data = a.data;
  const b = createReadingItem(deps, data, { kind: "article", title: "B" });
  data = b.data;
  data = setReadingStatus(deps, data, a.item.id as ReadingItemId, "current", today);
  data = addReadingNote(deps, data, a.item.id as ReadingItemId, { text: "great chapter", location: 42 });
  const groups = groupByStatus(data);
  assert.equal(groups.current.length, 1);
  assert.equal(groups.upcoming.length, 1);
  assert.equal(groups.current[0]!.notes.length, 1);
  assert.equal(groups.current[0]!.notes[0]!.location, 42);
});

test("learning log is dated and filterable", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  ({ data } = addLearningLog(deps, data, { date: today, text: "Learned about SystemJS", topic: "web" }));
  ({ data } = addLearningLog(deps, data, { date: ld("2025-08-21"), text: "old" }));
  const entries = learningForDate(data, today);
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.topic, "web");
});
