import { test } from "node:test";
import assert from "node:assert/strict";
import { instantToLocalDate, todayLocalDate, instantToLocalTime, isValidTimeZone } from "./timezone";
import { fixedClock } from "../core/clock";

test("instant maps to the correct LOCAL day in Asia/Kolkata (not UTC)", () => {
  // 18:30Z is 00:00 next day in IST (+05:30)
  assert.equal(
    instantToLocalDate(new Date("2025-08-22T18:30:00Z"), "Asia/Kolkata"),
    "2025-08-23",
  );
  // 18:29Z is still 23:59 same day IST
  assert.equal(
    instantToLocalDate(new Date("2025-08-22T18:29:00Z"), "Asia/Kolkata"),
    "2025-08-22",
  );
});

test("timezone matters: same instant is a different day in Los Angeles", () => {
  assert.equal(
    instantToLocalDate(new Date("2025-08-22T02:00:00Z"), "America/Los_Angeles"),
    "2025-08-21",
  );
  assert.equal(
    instantToLocalDate(new Date("2025-08-22T02:00:00Z"), "Asia/Kolkata"),
    "2025-08-22",
  );
});

test("todayLocalDate uses the injected clock", () => {
  const clock = fixedClock("2025-08-22T18:30:00Z");
  assert.equal(todayLocalDate(clock, "Asia/Kolkata"), "2025-08-23");
  assert.equal(todayLocalDate(clock, "UTC"), "2025-08-22");
});

test("instantToLocalTime returns local wall clock", () => {
  const t = instantToLocalTime(new Date("2025-08-22T18:30:00Z"), "Asia/Kolkata");
  assert.equal(t.hour, 0);
  assert.equal(t.minute, 0);
});

test("isValidTimeZone accepts IANA zones and rejects junk", () => {
  assert.equal(isValidTimeZone("Asia/Kolkata"), true);
  assert.equal(isValidTimeZone("Europe/London"), true);
  assert.equal(isValidTimeZone("UTC"), true);
  assert.equal(isValidTimeZone("John Smith"), false);
  assert.equal(isValidTimeZone(""), false);
  assert.equal(isValidTimeZone("Not/AZone"), false);
});

test("instant conversions never throw on an invalid timezone (fall back to UTC)", () => {
  // The bug: a corrupt stored timezone made Intl throw and bricked rendering.
  const inst = new Date("2025-08-22T12:00:00Z");
  let threw = false;
  try {
    instantToLocalDate(inst, "John Smith");
    instantToLocalTime(inst, "totally invalid");
  } catch {
    threw = true;
  }
  assert.equal(threw, false);
  // Falls back to UTC → the calendar day for noon UTC is that same date.
  assert.equal(instantToLocalDate(inst, "John Smith"), instantToLocalDate(inst, "UTC"));
});
