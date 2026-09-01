import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAppData } from "../domain/appData";
import { DEFAULT_SETTINGS } from "../config";
import { ld, makeDeps } from "../testing/util";
import {
  createHabit,
  logHabitCompletion,
  createTask,
  completeTask,
  upsertJournalEntry,
} from "../state/operations";
import type { HabitId } from "../domain/ids";
import {
  weekRangeContaining,
  shiftWeek,
  buildWeeklyReview,
  habitConsistency,
  ratingSummary,
  learnedThisWeek,
  recurringProblems,
  taskStats,
  labelRange,
} from "./weeklyReview";

// A daily habit rule (occurs every day).
const daily = { kind: "daily" as const };

// Build a week Mon–Sun style using weekStartsOn=1 for predictability.
const WEEK_START = 1 as const; // Monday
// Choose a known week: 2026-08-31 (Mon) .. 2026-09-06 (Sun)
const MON = ld("2026-08-31");
const range = weekRangeContaining(MON, WEEK_START);

test("weekRangeContaining spans 7 days start..end inclusive", () => {
  assert.equal(range.start, "2026-08-31");
  assert.equal(range.end, "2026-09-06");
  assert.equal(range.days.length, 7);
  assert.equal(labelRange(range), "Aug 31 – Sep 6");
});

test("habitConsistency counts completed/expected and lists missed dates", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const h = createHabit(deps, data, { name: "Brush teeth", schedule: daily });
  data = h.data;
  const id = h.habit.id as HabitId;
  // Complete 5 of the 7 days; miss Tue (Sep 1) and Fri (Sep 4).
  for (const d of ["2026-08-31", "2026-09-02", "2026-09-03", "2026-09-05", "2026-09-06"]) {
    data = logHabitCompletion(deps, data, id, ld(d)).data;
  }
  const rows = habitConsistency(data, range);
  assert.equal(rows.length, 1);
  const row = rows[0]!;
  assert.equal(row.expected, 7);
  assert.equal(row.completed, 5);
  assert.equal(Math.round(row.rate * 100), 71);
  assert.deepEqual([...row.missedDates], ["2026-09-01", "2026-09-04"]);
});

test("ratingSummary averages only rated days", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  ({ data } = upsertJournalEntry(deps, data, ld("2026-08-31"), { rating: 4 }));
  ({ data } = upsertJournalEntry(deps, data, ld("2026-09-01"), { rating: 3 }));
  ({ data } = upsertJournalEntry(deps, data, ld("2026-09-05"), { rating: 5 }));
  const rs = ratingSummary(data, range);
  assert.equal(rs.count, 3);
  assert.equal(rs.average, 4); // (4+3+5)/3
  assert.equal(rs.perDay.length, 7);
});

test("learnedThisWeek collects 'learned' text by day, in order", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  ({ data } = upsertJournalEntry(deps, data, ld("2026-09-02"), { learned: "closures" }));
  ({ data } = upsertJournalEntry(deps, data, ld("2026-08-31"), { learned: "monads" }));
  // outside the week -> excluded
  ({ data } = upsertJournalEntry(deps, data, ld("2026-09-20"), { learned: "later thing" }));
  const items = learnedThisWeek(data, range);
  assert.deepEqual(items.map((i) => i.text), ["monads", "closures"]);
});

test("recurringProblems does deterministic theme matching with day counts", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  ({ data } = upsertJournalEntry(deps, data, ld("2026-08-31"), { wentWrong: "wasted time on reels" }));
  ({ data } = upsertJournalEntry(deps, data, ld("2026-09-01"), { wentWrong: "scrolled instagram again" }));
  ({ data } = upsertJournalEntry(deps, data, ld("2026-09-02"), { wentWrong: "procrastinated all morning" }));
  const problems = recurringProblems(data, range);
  const screen = problems.find((p) => p.theme === "Screen time / reels");
  assert.ok(screen, "screen-time theme detected");
  assert.equal(screen!.days, 2);
  assert.ok(problems.some((p) => p.theme === "Procrastination"));
});

test("taskStats counts completed/created/pending/overdue in the week", () => {
  // Clock set to a day inside the week so createdAt/completedAt land in range.
  const deps = makeDeps("2026-09-02T06:00:00.000Z");
  let data = emptyAppData(DEFAULT_SETTINGS);
  const a = createTask(deps, data, { title: "A" }); data = a.data;
  const b = createTask(deps, data, { title: "B", due: ld("2026-08-01") }); data = b.data; // overdue vs week end
  data = completeTask(deps, data, a.task.id).data;
  const stats = taskStats(data, range, "Asia/Kolkata");
  assert.equal(stats.created, 2);
  assert.equal(stats.completed, 1);
  assert.equal(stats.pending, 1); // B still pending
  assert.equal(stats.overdue, 1); // B overdue (due 2026-08-01 < week end)
});

test("buildWeeklyReview reports hasData=false on an empty week", () => {
  const data = emptyAppData(DEFAULT_SETTINGS);
  const review = buildWeeklyReview(data, range, "Asia/Kolkata");
  assert.equal(review.hasData, false);
  assert.equal(review.habitRate, null);
  assert.equal(review.ratings.average, null);
});

test("shiftWeek moves the range by whole weeks", () => {
  const prev = shiftWeek(range, -1);
  assert.equal(prev.start, "2026-08-24");
  assert.equal(prev.end, "2026-08-30");
  const next = shiftWeek(range, 1);
  assert.equal(next.start, "2026-09-07");
});

test("current week excludes data from adjacent weeks", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const h = createHabit(deps, data, { name: "X", schedule: daily });
  data = h.data;
  // completion in the PREVIOUS week should not count for this week
  data = logHabitCompletion(deps, data, h.habit.id as HabitId, ld("2026-08-30")).data;
  const rows = habitConsistency(data, range);
  assert.equal(rows[0]!.completed, 0);
});

// ---- Extended analytics: sleep, diet (minimums), fitness, reading ----
import { logSleep, logMeal, logWater } from "../state/operations";
import { sleepStats, dietStats } from "./weeklyReview";

test("sleepStats: avg, best/worst, and days meeting the target", () => {
  const deps = makeDeps("2026-09-02T06:00:00.000Z");
  let data = emptyAppData(DEFAULT_SETTINGS);
  data = logSleep(deps, data, { date: ld("2026-08-31"), durationMinutes: 480 }).data; // 8h
  data = logSleep(deps, data, { date: ld("2026-09-01"), durationMinutes: 420 }).data; // 7h
  data = logSleep(deps, data, { date: ld("2026-09-02"), durationMinutes: 500 }).data; // 8h20
  const s = sleepStats(data, range, 480); // target 8h
  assert.equal(s.nights, 3);
  assert.equal(s.avgMinutes, Math.round((480 + 420 + 500) / 3));
  assert.equal(s.bestMinutes, 500);
  assert.equal(s.worstMinutes, 420);
  assert.equal(s.daysMetTarget, 2); // 480 and 500 meet >= 480
});

test("dietStats: eating ABOVE the minimum still counts as success", () => {
  const deps = makeDeps("2026-09-02T06:00:00.000Z");
  let data = emptyAppData(DEFAULT_SETTINGS);
  const targets = { calories: 2100, proteinGrams: 80, waterMl: 3000 };
  // Day 1: 2200 kcal (ABOVE min) + 90g protein + 3200ml — all minimums met.
  data = logMeal(deps, data, { date: ld("2026-08-31"), type: "lunch", name: "Big meal", macros: { kcal: 2200, protein: 90, carbs: 200, fat: 70 } }).data;
  data = logWater(deps, data, { date: ld("2026-08-31"), amountMl: 3200 }).data;
  // Day 2: 1800 kcal (below) + 60g (below) + 2000ml (below) — none met.
  data = logMeal(deps, data, { date: ld("2026-09-01"), type: "lunch", name: "Small meal", macros: { kcal: 1800, protein: 60, carbs: 150, fat: 50 } }).data;
  data = logWater(deps, data, { date: ld("2026-09-01"), amountMl: 2000 }).data;
  const d = dietStats(data, range, targets);
  assert.equal(d.daysLogged, 2);
  assert.equal(d.daysCalorieMin, 1); // 2200 counts, 1800 doesn't — ABOVE target is NOT a failure
  assert.equal(d.daysProteinMin, 1);
  assert.equal(d.daysWaterMin, 1);
  assert.equal(d.avgCalories, 2000); // (2200+1800)/2
});
