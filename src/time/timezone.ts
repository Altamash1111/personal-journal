import type { Clock } from "../core/clock";
import type { LocalDate } from "./localDate";
import { localDateOf } from "./localDate";

/**
 * True if `tz` is an IANA zone the platform's Intl database accepts. Used to
 * validate user input and to guard every Intl call below so a bad value can
 * never throw at render time.
 */
export const isValidTimeZone = (tz: string): boolean => {
  if (typeof tz !== "string" || tz.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** A guaranteed-valid zone: the requested one if usable, else UTC. */
const safeZone = (tz: string): string => (isValidTimeZone(tz) ? tz : "UTC");

/**
 * Convert an exact instant to the calendar day it falls on IN A GIVEN TIMEZONE.
 * Uses the platform Intl database (built into Node + browsers), so no UTC-offset
 * guessing and correct across DST. This is the single bridge from instants to
 * days. An invalid timezone falls back to UTC rather than throwing, so a corrupt
 * stored setting can never break rendering.
 */
export const instantToLocalDate = (instant: Date, timeZone: string): LocalDate => {
  // en-CA yields ISO-like \"YYYY-MM-DD\"
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (t: string): number =>
    Number(parts.find((p) => p.type === t)?.value ?? "NaN");
  return localDateOf(get("year"), get("month"), get("day"));
};

/** The user’s \"today\" in their timezone, from an injectable clock. */
export const todayLocalDate = (clock: Clock, timeZone: string): LocalDate =>
  instantToLocalDate(clock.now(), timeZone);

/** Local wall-clock hour/minute for an instant in a timezone (for daypart logic later). */
export const instantToLocalTime = (
  instant: Date,
  timeZone: string,
): { readonly hour: number; readonly minute: number } => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: safeZone(timeZone),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (t: string): number =>
    Number(parts.find((p) => p.type === t)?.value ?? "NaN");
  return { hour: get("hour") % 24, minute: get("minute") };
};
