import type { LocalDate } from "../time/localDate";
import { localDateOf, diffDays, compareLocalDate, parseLocalDate } from "../time/localDate";

/**
 * Winter Arc — a fixed motivational period. The dates are constants; the current
 * day is always passed in (computed in the user's timezone by the caller), so no
 * countdown value is ever stored. All maths is on calendar days, not hours.
 *
 * Sep 1 2026 = Day 1 … Dec 31 2026 = Day 122 (inclusive, 122 days).
 */
export const WINTER_ARC_START: LocalDate = localDateOf(2026, 9, 1);
export const WINTER_ARC_END: LocalDate = localDateOf(2026, 12, 31);
export const WINTER_ARC_TOTAL_DAYS = 122;

export type WinterArcPhase = "upcoming" | "active" | "final" | "complete";

export interface WinterArcState {
  readonly phase: WinterArcPhase;
  /** Whole calendar days from `today` until the start (>0 only while upcoming). */
  readonly daysUntilStart: number;
  /** 1-based day within the arc (1..122); null when not active/final. */
  readonly dayNumber: number | null;
  /** Total days in the arc (122). */
  readonly totalDays: number;
  /** Calendar days remaining including today (122..1 during the arc); null otherwise. */
  readonly daysLeft: number | null;
  /** Elapsed fraction 0..1 for the progress bar (0 before, 1 on the final day). */
  readonly progress: number;
  readonly start: LocalDate;
  readonly end: LocalDate;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "September 1, 2026" — for the upcoming state's target line. */
export const formatLongDate = (d: LocalDate): string => {
  const { year, month, day } = parseLocalDate(d);
  const long = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${long[month - 1]} ${day}, ${year}`;
};

/** "Sep 1" — compact range label. */
export const formatShortDate = (d: LocalDate): string => {
  const { month, day } = parseLocalDate(d);
  return `${MONTHS[month - 1]} ${day}`;
};

/**
 * Derive the full Winter Arc state for a given "today" (already a local calendar
 * day in the user's timezone). Purely functional; safe to call on every render.
 */
export const winterArcState = (today: LocalDate): WinterArcState => {
  const start = WINTER_ARC_START;
  const end = WINTER_ARC_END;
  const totalDays = WINTER_ARC_TOTAL_DAYS;

  const beforeStart = compareLocalDate(today, start) < 0;
  const afterEnd = compareLocalDate(today, end) > 0;

  if (beforeStart) {
    return {
      phase: "upcoming",
      daysUntilStart: diffDays(today, start), // start - today, whole days
      dayNumber: null,
      totalDays,
      daysLeft: null,
      progress: 0,
      start,
      end,
    };
  }

  if (afterEnd) {
    return {
      phase: "complete",
      daysUntilStart: 0,
      dayNumber: null,
      totalDays,
      daysLeft: null,
      progress: 1,
      start,
      end,
    };
  }

  // Active window (start..end inclusive).
  const dayNumber = diffDays(start, today) + 1; // 1 on the start date
  const daysLeft = diffDays(today, end) + 1; // includes today; 1 on the final day
  const isFinal = compareLocalDate(today, end) === 0;
  // Elapsed fraction: day 1 -> 1/122, day 122 -> 122/122 = 1. Never exceeds 1.
  const progress = Math.min(1, Math.max(0, dayNumber / totalDays));

  return {
    phase: isFinal ? "final" : "active",
    daysUntilStart: 0,
    dayNumber,
    totalDays,
    daysLeft,
    progress,
    start,
    end,
  };
};
