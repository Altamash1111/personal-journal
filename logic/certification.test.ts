import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAppData } from "../domain/appData";
import { DEFAULT_SETTINGS } from "../config";
import { ld, makeDeps } from "../testing/util";
import { createHabit, logHabitCompletion } from "../state/operations";
import type { HabitId } from "../domain/ids";
import { weekRangeContaining, buildWeeklyReview, shiftWeek } from "./weeklyReview";
import { monthRangeContaining, buildMonthlyReview } from "./monthlyReview";

// §3 — every boundary the certification demands.
test("CERT: Dec 31 2026 -> Jan 1 2027 crosses month AND year with no leakage", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const h = createHabit(deps, data, { name: "H", schedule: { kind: "daily" } });
  data = h.data;
  data = logHabitCompletion(deps, data, h.habit.id as HabitId, ld("2026-12-31")).data;
  data = logHabitCompletion(deps, data, h.habit.id as HabitId, ld("2027-01-01")).data;
  const dec = buildMonthlyReview(data, monthRangeContaining(ld("2026-12-31")), "Asia/Kolkata");
  const jan = buildMonthlyReview(data, monthRangeContaining(ld("2027-01-01")), "Asia/Kolkata");
  assert.equal(dec.range.label, "December 2026");
  assert.equal(jan.range.label, "January 2027");
  assert.equal(dec.habits.find((x) => x.name === "H")!.completed, 1);
  assert.equal(dec.habits.find((x) => x.name === "H")!.expected, 31);
  assert.equal(jan.habits.find((x) => x.name === "H")!.completed, 1);
  assert.equal(jan.habits.find((x) => x.name === "H")!.expected, 31);
});

test("CERT: February 2028 is a leap month (29 days); 2027 is 28", () => {
  assert.equal(monthRangeContaining(ld("2028-02-15")).days.length, 29);
  assert.equal(monthRangeContaining(ld("2027-02-15")).days.length, 28);
  assert.equal(monthRangeContaining(ld("2028-02-29")).label, "February 2028");
});

test("CERT: week comparison uses the genuine previous 7 days (Mon start)", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const h = createHabit(deps, data, { name: "H", schedule: { kind: "daily" } });
  data = h.data;
  // This week (Aug 31 - Sep 6) and last week (Aug 24 - Aug 30)
  data = logHabitCompletion(deps, data, h.habit.id as HabitId, ld("2026-09-01")).data; // this wk
  data = logHabitCompletion(deps, data, h.habit.id as HabitId, ld("2026-08-25")).data; // last wk
  const thisWk = weekRangeContaining(ld("2026-08-31"), 1);
  const lastWk = shiftWeek(thisWk, -1);
  assert.equal(thisWk.start, "2026-08-31");
  assert.equal(lastWk.start, "2026-08-24");
  assert.equal(lastWk.end, "2026-08-30");
  const cur = buildWeeklyReview(data, thisWk, "Asia/Kolkata");
  const prev = buildWeeklyReview(data, lastWk, "Asia/Kolkata");
  assert.equal(cur.habits.find((x) => x.name === "H")!.completed, 1); // only Sep 1
  assert.equal(prev.habits.find((x) => x.name === "H")!.completed, 1); // only Aug 25
});

test("CERT: future-dated data is not counted in the current period", () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const h = createHabit(deps, data, { name: "H", schedule: { kind: "daily" } });
  data = h.data;
  // Log a completion far in the future — must NOT appear in this week/month.
  data = logHabitCompletion(deps, data, h.habit.id as HabitId, ld("2027-06-15")).data;
  const wk = buildWeeklyReview(data, weekRangeContaining(ld("2026-08-31"), 1), "Asia/Kolkata");
  const mo = buildMonthlyReview(data, monthRangeContaining(ld("2026-08-31")), "Asia/Kolkata");
  assert.equal(wk.habits.find((x) => x.name === "H")!.completed, 0);
  assert.equal(mo.habits.find((x) => x.name === "H")!.completed, 0);
});

test("CERT: empty period reports hasData=false (no fabricated scores)", () => {
  const data = emptyAppData(DEFAULT_SETTINGS);
  const wk = buildWeeklyReview(data, weekRangeContaining(ld("2026-08-31"), 1), "Asia/Kolkata");
  const mo = buildMonthlyReview(data, monthRangeContaining(ld("2026-08-31")), "Asia/Kolkata");
  assert.equal(wk.hasData, false);
  assert.equal(mo.hasData, false);
  assert.equal(wk.habitRate, null);
  assert.equal(mo.habitRate, null);
});

test("CERT: Sunday->Monday transition (week starts Monday) groups correctly", () => {
  // 2026-09-06 is a Sunday; 2026-09-07 is a Monday (new week).
  const sun = weekRangeContaining(ld("2026-09-06"), 1);
  const mon = weekRangeContaining(ld("2026-09-07"), 1);
  assert.equal(sun.start, "2026-08-31");
  assert.equal(sun.end, "2026-09-06");
  assert.equal(mon.start, "2026-09-07");
  assert.notEqual(sun.start, mon.start);
});
