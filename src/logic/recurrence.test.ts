import { test } from "node:test";
import assert from "node:assert/strict";
import type { RecurrenceRule } from "../domain/recurrence";
import { occursOn, nextOccurrence } from "./recurrence";
import { ld } from "../testing/util";

test("daily occurs every day; next is the following day", () => {
  const r: RecurrenceRule = { kind: "daily" };
  assert.ok(occursOn(r, ld("2025-08-22")));
  assert.equal(nextOccurrence(r, ld("2025-08-22")), "2025-08-23");
});

test("everyNDays respects anchor and interval", () => {
  const r: RecurrenceRule = { kind: "everyNDays", n: 3, anchor: ld("2025-08-01") };
  assert.ok(occursOn(r, ld("2025-08-01")));
  assert.ok(occursOn(r, ld("2025-08-04")));
  assert.equal(occursOn(r, ld("2025-08-05")), false);
  assert.equal(occursOn(r, ld("2025-07-31")), false); // before anchor
});

test("weekdays matches selected days only", () => {
  const r: RecurrenceRule = { kind: "weekdays", days: [1, 3, 5] }; // Mon/Wed/Fri
  assert.ok(occursOn(r, ld("2025-08-22"))); // Fri
  assert.equal(occursOn(r, ld("2025-08-23")), false); // Sat
});

test("weekly with everyNWeeks parity", () => {
  const r: RecurrenceRule = {
    kind: "weekly",
    days: [5],
    everyNWeeks: 2,
    anchor: ld("2025-08-22"),
  };
  assert.ok(occursOn(r, ld("2025-08-22"))); // week 0 Friday
  assert.equal(occursOn(r, ld("2025-08-29")), false); // week 1 Friday
  assert.ok(occursOn(r, ld("2025-09-05"))); // week 2 Friday
  assert.equal(nextOccurrence(r, ld("2025-08-22")), "2025-09-05");
});

test("monthlyDay matches day of month", () => {
  const r: RecurrenceRule = { kind: "monthlyDay", day: 1 };
  assert.ok(occursOn(r, ld("2025-09-01")));
  assert.equal(occursOn(r, ld("2025-09-02")), false);
});

test("once matches only its date", () => {
  const r: RecurrenceRule = { kind: "once", date: ld("2025-08-25") };
  assert.ok(occursOn(r, ld("2025-08-25")));
  assert.equal(occursOn(r, ld("2025-08-26")), false);
  assert.equal(nextOccurrence(r, ld("2025-08-20")), "2025-08-25");
  assert.equal(nextOccurrence(r, ld("2025-08-25")), null); // not strictly after
});
