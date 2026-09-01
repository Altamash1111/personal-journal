import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAppData } from "../domain/appData";
import { DEFAULT_SETTINGS } from "../config";
import { ld, makeDeps } from "../testing/util";
import {
  createHabit,
  logHabitCompletion,
  logSleep,
  logMeal,
  logWater,
  upsertJournalEntry,
} from "../state/operations";
import type { HabitId } from "../domain/ids";
import { weekRangeContaining, buildWeeklyReview } from "./weeklyReview";
import { buildScorecard, overallLabel, attentionItems } from "./scorecard";

const WEEK_START = 1 as const;
const MON = ld("2026-08-31");
const range = weekRangeContaining(MON, WEEK_START);
const TZ = "Asia/Kolkata";
const CLOCK = "2026-09-02T06:00:00.000Z";

test("scorecard areas carry a transparent detail formula", () => {
  const deps = makeDeps(CLOCK);
  let data = emptyAppData(DEFAULT_SETTINGS);
  const h = createHabit(deps, data, { name: "Learning", schedule: { kind: "daily" } });
  data = h.data;
  for (const d of ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03"]) {
    data = logHabitCompletion(deps, data, h.habit.id as HabitId, ld(d)).data;
  }
  const review = buildWeeklyReview(data, range, TZ);
  const sc = buildScorecard(review);
  const habits = sc.areas.find((a) => a.key === "habits")!;
  assert.ok(/\d+\/\d+ scheduled completed/.test(habits.detail), habits.detail);
  const learning = sc.areas.find((a) => a.key === "learning")!;
  assert.equal(learning.detail, "4/7 days"); // transparent
  assert.ok(sc.overall !== null);
});

test("overallLabel thresholds are transparent", () => {
  assert.equal(overallLabel(null), "Not enough data");
  assert.equal(overallLabel(0.9), "Strong week");
  assert.equal(overallLabel(0.65), "Solid week");
  assert.equal(overallLabel(0.45), "Mixed week");
  assert.equal(overallLabel(0.2), "Needs improvement");
});

test("attention: one bad day does NOT trigger a warning", () => {
  const deps = makeDeps(CLOCK);
  let data = emptyAppData(DEFAULT_SETTINGS);
  // Only ONE sleep night below target -> below the >=4-night threshold, no warning.
  data = logSleep(deps, data, { date: ld("2026-08-31"), durationMinutes: 300 }).data;
  const review = buildWeeklyReview(data, range, TZ);
  const items = attentionItems(data, review, MON);
  assert.ok(!items.some((i) => i.key === "sleep"), "no sleep warning from a single night");
});

test("attention: protein minimum repeatedly missed IS flagged with numbers", () => {
  const deps = makeDeps(CLOCK);
  let data = emptyAppData({
    ...DEFAULT_SETTINGS,
    nutrition: { calories: 2100, proteinGrams: 80, waterMl: 3000 },
  });
  // 4 logged days, protein under 80 on 3 of them.
  const days: [string, number][] = [
    ["2026-08-31", 50],
    ["2026-09-01", 60],
    ["2026-09-02", 55],
    ["2026-09-03", 95], // met
  ];
  for (const [d, protein] of days) {
    data = logMeal(deps, data, { date: ld(d), type: "lunch", name: "meal", macros: { kcal: 2200, protein, carbs: 100, fat: 50 } }).data;
    data = logWater(deps, data, { date: ld(d), amountMl: 3200 }).data;
  }
  const review = buildWeeklyReview(data, range, TZ);
  const items = attentionItems(data, review, ld("2026-09-03"));
  const prot = items.find((i) => i.key === "diet-protein");
  assert.ok(prot, "protein attention present");
  assert.ok(/missed 3 of 4/.test(prot!.message), prot!.message);
});

test("attention: sleep consistently below target IS flagged", () => {
  const deps = makeDeps(CLOCK);
  let data = emptyAppData(DEFAULT_SETTINGS); // target 480m
  for (const d of ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]) {
    data = logSleep(deps, data, { date: ld(d), durationMinutes: 360 }).data; // 6h < 8h
  }
  const review = buildWeeklyReview(data, range, TZ);
  const items = attentionItems(data, review, ld("2026-09-04"));
  assert.ok(items.some((i) => i.key === "sleep" && /below target on 5 of 5/.test(i.message)));
});

test("attention: recurring problem theme across 3+ days is surfaced", () => {
  const deps = makeDeps(CLOCK);
  let data = emptyAppData(DEFAULT_SETTINGS);
  for (const d of ["2026-08-31", "2026-09-01", "2026-09-02"]) {
    data = upsertJournalEntry(deps, data, ld(d), { wentWrong: "procrastinated again" }).data;
  }
  const review = buildWeeklyReview(data, range, TZ);
  const items = attentionItems(data, review, ld("2026-09-02"));
  assert.ok(items.some((i) => i.message.includes("Procrastination") && i.message.includes("3 days")));
});

test("attention is empty on an empty week (no noise)", () => {
  const data = emptyAppData(DEFAULT_SETTINGS);
  const review = buildWeeklyReview(data, range, TZ);
  // reviewsWritten <= 3 would trigger the info item; that's expected only when
  // there IS other data. On a fully empty week we still may surface the review-gap
  // info, so assert there are no WARN items.
  const items = attentionItems(data, review, MON);
  assert.ok(!items.some((i) => i.severity === "warn"), "no warnings on empty week");
});

// ---- Correctness-pass: period-scoped scorecard + attention ----
test("scorecard daily-review denominator scales with the period (month = 31)", () => {
  const deps = makeDeps(CLOCK);
  let data = emptyAppData(DEFAULT_SETTINGS);
  data = upsertJournalEntry(deps, data, ld("2026-08-31"), { rating: 4 }).data;
  const review = buildWeeklyReview(data, weekRangeContaining(ld("2026-08-31"), WEEK_START), TZ);
  const monthly = buildScorecard(review, { days: 31, noun: "month" });
  const dr = monthly.areas.find((a) => a.key === "review")!;
  assert.equal(dr.detail, "1/31 days written"); // NOT /7
});

test("attention uses monthly language + denominator when period is a month", () => {
  const data = emptyAppData(DEFAULT_SETTINGS);
  const review = buildWeeklyReview(data, weekRangeContaining(ld("2026-08-31"), WEEK_START), TZ);
  const items = attentionItems(data, review, ld("2026-08-31"), { days: 31, noun: "month" });
  const gap = items.find((i) => i.key === "review-gap");
  assert.ok(gap, "review-gap present");
  assert.ok(/0\/31 daily reviews written this month/.test(gap!.message), gap!.message);
});

// ---- Production audit: no-data areas must NOT be scored as failure ----
test("scorecard excludes no-data areas from overall (missing != 0%)", () => {
  const deps = makeDeps(CLOCK);
  let data = emptyAppData(DEFAULT_SETTINGS);
  // Only sleep + a review logged; no habits/tasks/fitness/diet.
  data = logSleep(deps, data, { date: ld("2026-08-31"), durationMinutes: 480 }).data;
  data = upsertJournalEntry(deps, data, ld("2026-08-31"), { rating: 4 }).data;
  const review = buildWeeklyReview(data, weekRangeContaining(ld("2026-08-31"), WEEK_START), TZ);
  const sc = buildScorecard(review);
  const byKey = (k: string) => sc.areas.find((a) => a.key === k)!;
  // Untracked areas are null (excluded), NOT 0%.
  assert.equal(byKey("habits").score, null);
  assert.equal(byKey("fitness").score, null);
  assert.equal(byKey("fitness").detail, "No workouts tracked");
  assert.equal(byKey("diet").score, null);
  // Sleep IS scored.
  assert.equal(byKey("sleep").score, 1);
  // Overall is the mean of ONLY the scored areas (sleep 1.0 + review 1/7), not diluted by nulls.
  const scored = sc.areas.filter((a) => a.score !== null);
  const expected = scored.reduce((a, s) => a + (s.score as number), 0) / scored.length;
  assert.ok(Math.abs((sc.overall as number) - expected) < 1e-9);
  // Strongest is sleep, and weakest is NOT a no-data area.
  assert.equal(sc.strongest!.key, "sleep");
  assert.ok(sc.weakest!.score !== null);
});
