import type { Timestamp } from "./scalars";
import { timestampOf } from "./scalars";

/** Injectable source of \"now\". Keeps all time-dependent logic pure + testable:
 *  no module ever calls `new Date()` directly except systemClock. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** A clock frozen at a fixed instant, for deterministic tests. */
export const fixedClock = (iso: string): Clock => {
  const d = new Date(iso);
  return { now: () => new Date(d.getTime()) };
};

export const nowTimestamp = (clock: Clock): Timestamp => timestampOf(clock.now());
