import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isLocalDateString,
  localDateOf,
  toLocalDate,
  addDays,
  diffDays,
  compareLocalDate,
  weekdayOf,
} from "./localDate";
import { startOfWeek } from "./week";
import { ld } from "../testing/util";

test("isLocalDateString accepts valid and rejects invalid", () => {
  assert.ok(isLocalDateString("2025-08-22"));
  assert.equal(isLocalDateString("2025-02-30"), false); // no Feb 30
  assert.equal(isLocalDateString("2025-13-01"), false); // no month 13
  assert.equal(isLocalDateString("2025-8-2"), false); // must be zero-padded
  assert.equal(isLocalDateString("garbage"), false);
});

test("toLocalDate returns null on invalid", () => {
  assert.equal(toLocalDate("2025-02-30"), null);
  assert.ok(toLocalDate("2025-08-22") !== null);
});

test("addDays crosses month and year boundaries", () => {
  assert.equal(addDays(ld("2025-12-31"), 1), "2026-01-01");
  assert.equal(addDays(ld("2025-03-01"), -1), "2025-02-28");
  assert.equal(addDays(ld("2024-02-28"), 1), "2024-02-29"); // leap year
});

test("diffDays and compareLocalDate", () => {
  assert.equal(diffDays(ld("2025-08-01"), ld("2025-08-22")), 21);
  assert.equal(diffDays(ld("2025-08-22"), ld("2025-08-01")), -21);
  assert.equal(compareLocalDate(ld("2025-08-01"), ld("2025-08-22")), -1);
  assert.equal(compareLocalDate(ld("2025-08-22"), ld("2025-08-22")), 0);
  assert.equal(compareLocalDate(ld("2025-08-23"), ld("2025-08-22")), 1);
});

test("weekdayOf and startOfWeek (Monday start)", () => {
  assert.equal(weekdayOf(ld("2025-08-22")), 5); // Friday
  assert.equal(startOfWeek(ld("2025-08-22"), 1), "2025-08-18"); // Monday
  assert.equal(startOfWeek(ld("2025-08-22"), 0), "2025-08-17"); // Sunday
});

test("localDateOf throws on impossible dates", () => {
  assert.throws(() => localDateOf(2025, 2, 30));
});
