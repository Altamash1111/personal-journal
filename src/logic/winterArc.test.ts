import { test } from "node:test";
import assert from "node:assert/strict";
import { ld } from "../testing/util";
import { winterArcState, WINTER_ARC_TOTAL_DAYS } from "./winterArc";

test("Test A — Aug 30 2026: upcoming, starts in 2 days", () => {
  const w = winterArcState(ld("2026-08-30"));
  assert.equal(w.phase, "upcoming");
  assert.equal(w.daysUntilStart, 2);
  assert.equal(w.dayNumber, null);
  assert.equal(w.daysLeft, null);
  assert.equal(w.progress, 0);
});

test("Test B — Aug 31 2026: starts tomorrow", () => {
  const w = winterArcState(ld("2026-08-31"));
  assert.equal(w.phase, "upcoming");
  assert.equal(w.daysUntilStart, 1);
});

test("Test C — Sep 1 2026: Day 1 / 122, 122 days left, active", () => {
  const w = winterArcState(ld("2026-09-01"));
  assert.equal(w.phase, "active");
  assert.equal(w.dayNumber, 1);
  assert.equal(w.totalDays, 122);
  assert.equal(w.daysLeft, 122);
  // Day 1 is the beginning, not 100%.
  assert.ok(w.progress > 0 && w.progress < 0.02, `progress=${w.progress}`);
});

test("Test D — Oct 15 2026: correct day number and progress", () => {
  const w = winterArcState(ld("2026-10-15"));
  // Sep has 30 days: Sep 1 = day 1 ... Sep 30 = day 30; Oct 15 = day 45.
  assert.equal(w.phase, "active");
  assert.equal(w.dayNumber, 45);
  assert.equal(w.daysLeft, WINTER_ARC_TOTAL_DAYS - 45 + 1); // 78
  assert.equal(Math.round(w.progress * 100), Math.round((45 / 122) * 100));
});

test("Test E — Dec 30 2026: still active (not final)", () => {
  const w = winterArcState(ld("2026-12-30"));
  assert.equal(w.phase, "active");
  assert.equal(w.dayNumber, 121);
  assert.equal(w.daysLeft, 2);
});

test("Test F — Dec 31 2026: final day, Day 122 / 122", () => {
  const w = winterArcState(ld("2026-12-31"));
  assert.equal(w.phase, "final");
  assert.equal(w.dayNumber, 122);
  assert.equal(w.daysLeft, 1);
  assert.equal(w.progress, 1); // final day fills the bar, never exceeds 1
});

test("Test G — Jan 1 2027: complete", () => {
  const w = winterArcState(ld("2027-01-01"));
  assert.equal(w.phase, "complete");
  assert.equal(w.dayNumber, null);
  assert.equal(w.daysLeft, null);
  assert.equal(w.progress, 1);
});

test("progress never exceeds 1 or goes negative across the whole arc", () => {
  for (const d of ["2026-08-01", "2026-09-01", "2026-11-11", "2026-12-31", "2027-06-01"]) {
    const w = winterArcState(ld(d));
    assert.ok(w.progress >= 0 && w.progress <= 1, `${d} -> ${w.progress}`);
  }
});

test("day numbers span exactly 1..122 with no gaps at the boundaries", () => {
  assert.equal(winterArcState(ld("2026-09-01")).dayNumber, 1);
  assert.equal(winterArcState(ld("2026-12-31")).dayNumber, 122);
  // one day before start is upcoming, one day after end is complete
  assert.equal(winterArcState(ld("2026-08-31")).dayNumber, null);
  assert.equal(winterArcState(ld("2027-01-01")).dayNumber, null);
});
