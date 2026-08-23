import type { LocalDate } from "../time/localDate";
import { toLocalDate } from "../time/localDate";
import { fixedClock } from "../core/clock";
import { sequentialFactory } from "../core/id";
import type { OpDeps } from "../state/helpers";

/** Build a LocalDate in tests, throwing on typos. */
export const ld = (s: string): LocalDate => {
  const v = toLocalDate(s);
  if (v === null) throw new Error(`bad test date: ${s}`);
  return v;
};

/** Deterministic operation deps (sequential ids + frozen clock). */
export const makeDeps = (iso = "2025-08-22T06:00:00.000Z"): OpDeps => ({
  ids: sequentialFactory("x"),
  clock: fixedClock(iso),
});
