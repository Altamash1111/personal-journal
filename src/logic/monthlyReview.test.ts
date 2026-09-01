import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAppData } from "../domain/appData";
import { DEFAULT_SETTINGS } from "../config";
import { ld, makeDeps } from "../testing/util";
import { createHabit, logHabitCompletion, upsertJournalEntry } from "../state/operations";
import type { HabitId } from "../domain/ids";
import { monthRangeContaining, shiftMonth, buildMonthlyReview } from "./monthlyReview";

test("monthRangeContaining spans the whole month", () => {
  const r = monthRangeContaining(ld("2026-09-15"));
  assert.equal(r.start, "2026-09-01");
  assert.equal(r.end, "2026-09-30");
  assert.equal(r.days.length, 30);
  assert.equal(r.label, "September 2026");
});

test("monthRangeContaining handles February (non-leap 2026 = 28 days)", () => {
  const r = monthRangeContaining(ld("2026-02-10"));
  assert.equal(r.end, "2026-02-28");
  assert.equal(r.days.length, 28);
});

test("shiftMonth crosses year boundaries", () => {
  const jan = monthRangeContaining(ld("2027-01-10"));
  const prev = shiftMonth(jan, -1);
  assert.equal(prev.label, "December 2026");
  assert.equal(prev.start, "2026-12-01");
  const next = shiftMonth(jan, 1);
  assert.equal(next.label, "February 2027");
});

test("buildMonthlyReview aggregates the month and excludes other months", () => {
  const deps = makeDeps("2026-09-15T06:00:00.000Z");
  let data = emptyAppData(DEFAULT_SETTINGS);
  const h = createHabit(deps, data, { name: "Read", schedule: { kind: "daily" } });
  data = h.data;
  // Complete on 3 September days + 1 October day (should be excluded).
  for (const d of ["2026-09-01", "2026-09-02", "2026-09-03", "2026-10-05"]) {
    data = logHabitCompletion(deps, data, h.habit.id as HabitId, ld(d)).data;
  }
  ({ data } = upsertJournalEntry(deps, data, ld("2026-09-10"), { rating: 4, learned: "September lesson" }));
  ({ data } = upsertJournalEntry(deps, data, ld("2026-10-10"), { rating: 2, learned: "October lesson" }));

  const sep = buildMonthlyReview(data, monthRangeContaining(ld("2026-09-15")), "Asia/Kolkata");
  const readHabit = sep.habits.find((x) => x.name === "Read")!;
  assert.equal(readHabit.completed, 3); // Oct 5 excluded
  assert.equal(readHabit.expected, 30);
  assert.equal(sep.ratings.count, 1); // only the Sep rating
  assert.equal(sep.ratings.average, 4);
  assert.equal(sep.learned.length, 1);
  assert.equal(sep.learned[0]!.text, "September lesson");
});

test("empty month reports hasData=false", () => {
  const data = emptyAppData(DEFAULT_SETTINGS);
  const r = buildMonthlyReview(data, monthRangeContaining(ld("2026-09-15")), "Asia/Kolkata");
  assert.equal(r.hasData, false);
});

// ---- Correctness-pass regression tests (reported bugs A/B/C) ----
import { instantToLocalDate } from "../time/timezone";

test("A: Aug 31 2026 in Asia/Kolkata resolves to August (not September)", () => {
  // Late-evening IST on Aug 31 is still August locally.
  const day = instantToLocalDate(new Date("2026-08-31T17:30:00Z"), "Asia/Kolkata"); // 23:00 IST
  const r = monthRangeContaining(day);
  assert.equal(r.label, "August 2026");
  assert.equal(r.days.length, 31);
});

test("B: August monthly daily-review denominator = 31 days", () => {
  const r = monthRangeContaining(ld("2026-08-15"));
  assert.equal(r.days.length, 31);
});

test("C: September monthly denominator = 30 days", () => {
  const r = monthRangeContaining(ld("2026-09-15"));
  assert.equal(r.days.length, 30);
});
