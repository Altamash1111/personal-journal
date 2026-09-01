import type { AppData } from "../domain/appData";
import type { Goal } from "../domain/goal";
import type { LocalDate } from "../time/localDate";
import { addDays, diffDays, compareLocalDate, parseLocalDate } from "../time/localDate";

/**
 * Goal intelligence: turns a measurable goal + its historical data into pace,
 * status and a projected completion date — but only when there is enough real
 * history to make the projection meaningful. Otherwise the status is "unknown"
 * and callers show a "Not enough data yet" state.
 *
 * Nothing here is stored; all values are derived on read.
 */

export type GoalStatusKind = "ahead" | "on_track" | "behind" | "complete" | "unknown";

export interface GoalIntel {
  readonly measurable: boolean;
  readonly current: number | null;
  readonly target: number | null;
  readonly start: number | null; // earliest known value in the series
  readonly unit: string | null;
  readonly progress: number; // 0..1
  readonly remaining: number | null; // target - current (in unit)
  readonly deadline: LocalDate | null;
  readonly daysRemaining: number | null; // until deadline
  readonly recentPacePerWeek: number | null; // observed, signed
  readonly requiredPacePerWeek: number | null; // needed to hit target by deadline
  readonly status: GoalStatusKind;
  readonly projectedDate: LocalDate | null; // when target is reached at recent pace
  readonly projectedVsDeadlineDays: number | null; // +ve = late, -ve = early
  readonly enoughData: boolean;
}

// ---- Generic linear trend over a dated numeric series (least-effort, robust) ----
export interface Trend {
  readonly points: readonly { readonly date: LocalDate; readonly value: number }[];
  readonly first: { readonly date: LocalDate; readonly value: number } | null;
  readonly last: { readonly date: LocalDate; readonly value: number } | null;
  readonly totalChange: number | null;
  readonly perWeek: number | null; // average change per 7 days across the span
  readonly spanDays: number | null;
  readonly enough: boolean; // >=2 points on distinct days spanning >=1 day
}

/** Chronological, de-duplicated-by-day (last value on a day wins). */
export const buildTrend = (
  series: readonly { readonly date: LocalDate; readonly value: number; readonly order?: number }[],
): Trend => {
  const byDay = new Map<LocalDate, { date: LocalDate; value: number }>();
  // series is expected in insertion order; later entries on a day overwrite earlier.
  for (const s of series) byDay.set(s.date, { date: s.date, value: s.value });
  const points = [...byDay.values()].sort((a, b) => (compareLocalDate(a.date, b.date) < 0 ? -1 : 1));
  if (points.length === 0) {
    return { points, first: null, last: null, totalChange: null, perWeek: null, spanDays: null, enough: false };
  }
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const spanDays = diffDays(first.date, last.date); // last - first
  const totalChange = last.value - first.value;
  const enough = points.length >= 2 && spanDays >= 1;
  const perWeek = enough ? (totalChange / spanDays) * 7 : null;
  return { points, first, last, totalChange, perWeek, spanDays, enough };
};

const nearestDateForValue = (
  from: LocalDate,
  currentValue: number,
  targetValue: number,
  perUnitPerWeek: number,
): LocalDate | null => {
  if (perUnitPerWeek === 0) return null;
  const remaining = targetValue - currentValue;
  // If pace is moving away from the target, no projection.
  if (Math.sign(remaining) !== Math.sign(perUnitPerWeek)) return null;
  const weeks = remaining / perUnitPerWeek;
  if (!Number.isFinite(weeks) || weeks < 0) return null;
  return addDays(from, Math.round(weeks * 7));
};

const statusFrom = (
  progress: number,
  recent: number | null,
  required: number | null,
): GoalStatusKind => {
  if (progress >= 1) return "complete";
  if (recent === null || required === null) return "unknown";
  // Compare signed pace against requirement. If required is ~0 (no deadline) fall back to unknown.
  if (required === 0) return "unknown";
  const ratio = recent / required;
  if (ratio >= 1.05) return "ahead";
  if (ratio >= 0.9) return "on_track";
  return "behind";
};

/**
 * Build intelligence for a single goal, optionally using an external trend
 * series (e.g. bodyweight history) when the goal maps to one. `series` should be
 * the observed values over time that move toward the goal's target.
 */
export const goalIntel = (
  goal: Goal,
  today: LocalDate,
  series?: readonly { readonly date: LocalDate; readonly value: number }[],
): GoalIntel => {
  const m = goal.metric;
  if (m === null) {
    return {
      measurable: false, current: null, target: null, start: null, unit: null,
      progress: goal.status === "completed" ? 1 : 0, remaining: null, deadline: goal.deadline,
      daysRemaining: goal.deadline === null ? null : diffDays(today, goal.deadline),
      recentPacePerWeek: null, requiredPacePerWeek: null,
      status: goal.status === "completed" ? "complete" : "unknown",
      projectedDate: null, projectedVsDeadlineDays: null, enoughData: false,
    };
  }

  const trend = series && series.length > 0 ? buildTrend(series) : null;
  const current = trend?.last?.value ?? m.current;
  const start = trend?.first?.value ?? m.current;
  const target = m.target;
  // Progress is current/target (clamped) — the intuitive, single convention used
  // across the whole app (bar, %, remaining, intelligence all agree). e.g. a
  // 45.5kg current toward a 56kg target reads 81%.
  const progressToward = target <= 0 ? 0 : Math.max(0, Math.min(1, current / target));

  const remaining = target - current;
  const daysRemaining = goal.deadline === null ? null : diffDays(today, goal.deadline);
  const recentPacePerWeek = trend?.enough ? trend.perWeek : null;
  const requiredPacePerWeek =
    goal.deadline !== null && daysRemaining !== null && daysRemaining > 0
      ? (remaining / daysRemaining) * 7
      : null;

  const projectedDate =
    recentPacePerWeek !== null && recentPacePerWeek !== 0 && trend?.last
      ? nearestDateForValue(trend.last.date, current, target, recentPacePerWeek)
      : null;
  const projectedVsDeadlineDays =
    projectedDate !== null && goal.deadline !== null ? diffDays(goal.deadline, projectedDate) : null;

  const status: GoalStatusKind =
    goal.status === "completed" || progressToward >= 1
      ? "complete"
      : statusFrom(progressToward, recentPacePerWeek, requiredPacePerWeek);

  return {
    measurable: true,
    current,
    target,
    start,
    unit: m.unit,
    progress: progressToward,
    remaining,
    deadline: goal.deadline,
    daysRemaining,
    recentPacePerWeek,
    requiredPacePerWeek,
    status,
    projectedDate,
    projectedVsDeadlineDays,
    enoughData: trend?.enough ?? false,
  };
};

// ---- Bodyweight: the single source of trend truth, feeding Goal Intelligence ----
export interface BodyweightHistory {
  readonly points: readonly { readonly date: LocalDate; readonly value: number }[];
  readonly latest: number | null;
  readonly latestDate: LocalDate | null;
  readonly start: number | null;
  readonly totalChange: number | null;
  readonly recentChange: number | null; // last minus the reading ~7 days before it
  readonly perWeek: number | null;
  readonly unit: string;
  readonly enough: boolean;
}

/** Ordered daily bodyweight series (chronological), plus summary stats. */
export const bodyweightHistory = (data: AppData): BodyweightHistory => {
  // Preserve insertion order so same-day "last wins" matches bodyWeightTrend semantics.
  const series = data.bodyWeights.map((w) => ({ date: w.date, value: w.weight }));
  const trend = buildTrend(series);
  const unit = data.bodyWeights[0]?.unit ?? "kg";
  let recentChange: number | null = null;
  if (trend.last) {
    const cutoff = addDays(trend.last.date, -7);
    // find the last point on/before cutoff
    const prior = [...trend.points].reverse().find((p) => compareLocalDate(p.date, cutoff) <= 0);
    if (prior) recentChange = trend.last.value - prior.value;
  }
  return {
    points: trend.points,
    latest: trend.last?.value ?? null,
    latestDate: trend.last?.date ?? null,
    start: trend.first?.value ?? null,
    totalChange: trend.totalChange,
    recentChange,
    perWeek: trend.perWeek,
    unit,
    enough: trend.enough,
  };
};

/** Series for a bodyweight-linked goal: the raw dated weight values. */
export const bodyweightSeries = (data: AppData): readonly { readonly date: LocalDate; readonly value: number }[] =>
  data.bodyWeights.map((w) => ({ date: w.date, value: w.weight }));

// ---- Reading pace / projection toward an N-book goal ----
export interface ReadingPace {
  readonly finished: number;
  readonly goal: number | null;
  readonly remaining: number | null;
  readonly perMonth: number | null; // recent pace
  readonly projectedYearEnd: number | null; // books likely finished by Dec 31 of `today`'s year
  readonly projectedDate: LocalDate | null; // when goal is reached at current pace
  readonly status: GoalStatusKind;
  readonly enough: boolean;
}

/** finishedDates: local dates a book was finished. `goal` from a reading goal if present. */
export const readingPace = (
  finishedDates: readonly LocalDate[],
  today: LocalDate,
  goal: number | null,
): ReadingPace => {
  const sorted = [...finishedDates].sort((a, b) => (compareLocalDate(a, b) < 0 ? -1 : 1));
  const finished = sorted.length;
  // Need at least 2 finished books spanning >=1 day to compute a pace.
  const enough = finished >= 2 && diffDays(sorted[0]!, sorted[finished - 1]!) >= 1;
  const spanDays = enough ? diffDays(sorted[0]!, sorted[finished - 1]!) : null;
  const perMonth = enough && spanDays ? (finished / spanDays) * 30 : null;

  const remaining = goal === null ? null : Math.max(0, goal - finished);
  const { year } = parseLocalDate(today);
  const yearEnd = `${year}-12-31` as LocalDate;
  const daysToYearEnd = Math.max(0, diffDays(today, yearEnd));
  const projectedYearEnd =
    perMonth !== null ? Math.round(finished + (perMonth / 30) * daysToYearEnd) : null;

  let projectedDate: LocalDate | null = null;
  let status: GoalStatusKind = "unknown";
  if (goal !== null) {
    if (finished >= goal) {
      status = "complete";
    } else if (perMonth !== null && perMonth > 0) {
      const booksLeft = goal - finished;
      const days = (booksLeft / perMonth) * 30;
      projectedDate = addDays(today, Math.round(days));
      // On track if projected to finish within the same calendar year.
      status = compareLocalDate(projectedDate, yearEnd) <= 0 ? "on_track" : "behind";
    }
  }

  return { finished, goal, remaining, perMonth, projectedYearEnd, projectedDate, status, enough };
};

const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const formatMonthDay = (d: LocalDate): string => {
  const { year, month, day } = parseLocalDate(d);
  return `${MONTHS_LONG[month - 1]!.slice(0, 3)} ${day}, ${year}`;
};

export const statusLabel = (s: GoalStatusKind): string =>
  s === "ahead" ? "Ahead" : s === "on_track" ? "On track" : s === "behind" ? "Behind" : s === "complete" ? "Complete" : "Not enough data";
