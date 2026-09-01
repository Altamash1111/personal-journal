import type { AppData } from "../domain/appData";
import type { LocalDate } from "../time/localDate";
import { compareLocalDate, diffDays } from "../time/localDate";
import type { WeeklyReview } from "./weeklyReview";

/**
 * Transparent weekly scorecard + attention detector. Every score carries the
 * numbers it was computed from ("5/6 minimums met") so nothing is a mystery
 * black-box number. All inputs come from the already-computed WeeklyReview.
 */

export interface ScoreArea {
  readonly key: string;
  readonly label: string;
  readonly score: number | null; // 0..1, or null when there's no data to score
  readonly detail: string; // human-readable formula, e.g. "5/6 minimums met"
}

export interface Scorecard {
  readonly areas: readonly ScoreArea[];
  readonly overall: number | null; // mean of scored areas
  readonly strongest: ScoreArea | null;
  readonly weakest: ScoreArea | null;
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

export interface PeriodInfo {
  readonly days: number; // number of days in the period (7 weekly, 28-31 monthly)
  readonly noun: string; // "week" | "month"
}
const WEEK_PERIOD: PeriodInfo = { days: 7, noun: "week" };

export const buildScorecard = (review: WeeklyReview, period: PeriodInfo = WEEK_PERIOD): Scorecard => {
  const areas: ScoreArea[] = [];

  // Habits — overall completed/expected.
  if (review.habitRate !== null) {
    const done = review.habits.reduce((a, h) => a + h.completed, 0);
    const exp = review.habits.reduce((a, h) => a + h.expected, 0);
    areas.push({ key: "habits", label: "Habits", score: review.habitRate, detail: `${done}/${exp} scheduled completed` });
  } else {
    areas.push({ key: "habits", label: "Habits", score: null, detail: "No active habits" });
  }

  // Tasks — completed / (completed + pending).
  areas.push({
    key: "tasks",
    label: "Tasks",
    score: review.tasks.completionRate,
    detail:
      review.tasks.completionRate === null
        ? "No tasks tracked"
        : `${review.tasks.completed} done · ${review.tasks.pending} pending`,
  });

  // Fitness — scored against a simple 4-workout/week reference, capped at 1.
  const fitnessRef = 4;
  const fitnessNoData = review.fitness.workoutsThisWeek === 0 && review.fitness.lastWorkoutDate === null;
  areas.push({
    key: "fitness",
    label: "Fitness",
    score: fitnessNoData ? null : clamp01(review.fitness.workoutsThisWeek / fitnessRef),
    detail: fitnessNoData
      ? "No workouts tracked"
      : `${review.fitness.workoutsThisWeek} workout${review.fitness.workoutsThisWeek === 1 ? "" : "s"} (goal ${fitnessRef}/wk)`,
  });

  // Diet — average of the three minimum-hit ratios across logged days.
  if (review.diet.daysLogged > 0) {
    const d = review.diet;
    const parts = [d.daysCalorieMin, d.daysProteinMin, d.daysWaterMin];
    const score = parts.reduce((a, n) => a + n / d.daysLogged, 0) / 3;
    areas.push({
      key: "diet",
      label: "Diet",
      score: clamp01(score),
      detail: `cals ${d.daysCalorieMin}/${d.daysLogged} · protein ${d.daysProteinMin}/${d.daysLogged} · water ${d.daysWaterMin}/${d.daysLogged} (minimums)`,
    });
  } else {
    areas.push({ key: "diet", label: "Diet", score: null, detail: "No days logged" });
  }

  // Sleep — nights meeting target / nights logged.
  if (review.sleep.nights > 0) {
    areas.push({
      key: "sleep",
      label: "Sleep",
      score: clamp01(review.sleep.daysMetTarget / review.sleep.nights),
      detail: `${review.sleep.daysMetTarget}/${review.sleep.nights} nights met target`,
    });
  } else {
    areas.push({ key: "sleep", label: "Sleep", score: null, detail: "No sleep logged" });
  }

  // Learning — a habit named like "learn" if present, else null.
  const learn = review.habits.find((h) => /learn|study/i.test(h.name));
  areas.push({
    key: "learning",
    label: "Learning",
    score: learn ? learn.rate : null,
    detail: learn ? `${learn.completed}/${learn.expected} days` : "No learning habit",
  });

  // Daily review — days a review was written / days in the period.
  areas.push({
    key: "review",
    label: "Daily review",
    score: clamp01(review.reviewsWritten / period.days),
    detail: `${review.reviewsWritten}/${period.days} days written`,
  });

  const scored = areas.filter((a) => a.score !== null) as (ScoreArea & { score: number })[];
  const overall = scored.length === 0 ? null : scored.reduce((a, s) => a + s.score, 0) / scored.length;
  const sortedByScore = [...scored].sort((a, b) => b.score - a.score);
  return {
    areas,
    overall,
    strongest: sortedByScore[0] ?? null,
    weakest: sortedByScore.length > 0 ? sortedByScore[sortedByScore.length - 1]! : null,
  };
};

export const overallLabel = (overall: number | null): string => {
  if (overall === null) return "Not enough data";
  if (overall >= 0.8) return "Strong week";
  if (overall >= 0.6) return "Solid week";
  if (overall >= 0.4) return "Mixed week";
  return "Needs improvement";
};

// ---------------- Attention needed ----------------
export type AttentionSeverity = "warn" | "info";
export interface AttentionItem {
  readonly key: string;
  readonly severity: AttentionSeverity;
  readonly message: string; // states WHY, with the numbers behind it
}

/**
 * Surface only meaningful, data-backed issues from the selected week. Thresholds
 * are deliberately conservative so a single bad day never triggers a warning.
 */
export const attentionItems = (
  data: AppData,
  review: WeeklyReview,
  today: LocalDate,
  period: PeriodInfo = WEEK_PERIOD,
): readonly AttentionItem[] => {
  const items: AttentionItem[] = [];

  // Habit missed on a majority of its scheduled days this period.
  for (const h of review.habits) {
    if (h.expected >= 3 && h.completed / h.expected < 0.5) {
      items.push({
        key: `habit-${h.habitId}`,
        severity: "warn",
        message: `${h.name} completed only ${h.completed}/${h.expected} scheduled days this ${period.noun}.`,
      });
    }
  }

  // Diet minimums repeatedly missed (need >=3 logged days to judge).
  const d = review.diet;
  if (d.daysLogged >= 3) {
    const missCal = d.daysLogged - d.daysCalorieMin;
    const missPro = d.daysLogged - d.daysProteinMin;
    const missWat = d.daysLogged - d.daysWaterMin;
    if (missPro > d.daysLogged / 2)
      items.push({ key: "diet-protein", severity: "warn", message: `Protein minimum missed ${missPro} of ${d.daysLogged} logged days.` });
    if (missCal > d.daysLogged / 2)
      items.push({ key: "diet-cal", severity: "warn", message: `Calorie minimum missed ${missCal} of ${d.daysLogged} logged days.` });
    if (missWat > d.daysLogged / 2)
      items.push({ key: "diet-water", severity: "info", message: `Water minimum missed ${missWat} of ${d.daysLogged} logged days.` });
  }

  // Sleep consistently below target (need >=4 nights).
  if (review.sleep.nights >= 4) {
    const below = review.sleep.nights - review.sleep.daysMetTarget;
    if (below > review.sleep.nights / 2)
      items.push({ key: "sleep", severity: "warn", message: `Sleep below target on ${below} of ${review.sleep.nights} nights.` });
  }

  // No workout logged in a while (based on last completed session).
  if (review.fitness.lastWorkoutDate !== null) {
    const gap = diffDays(review.fitness.lastWorkoutDate, today);
    if (gap >= 8) items.push({ key: "fitness-gap", severity: "warn", message: `No workout logged in ${gap} days.` });
  }

  // Body weight not logged recently.
  const latestWeight = data.bodyWeights
    .map((w) => w.date)
    .sort((a, b) => (compareLocalDate(a, b) > 0 ? -1 : 1))[0];
  if (latestWeight !== undefined) {
    const gap = diffDays(latestWeight, today);
    if (gap >= 10) items.push({ key: "weight-gap", severity: "info", message: `Weight hasn't been logged in ${gap} days.` });
  }

  // Daily reviews missed for much of the period.
  if (review.reviewsWritten <= Math.max(3, Math.floor(period.days / 2))) {
    items.push({
      key: "review-gap",
      severity: "info",
      message: `Only ${review.reviewsWritten}/${period.days} daily reviews written this ${period.noun}.`,
    });
  }

  // Recurring problems mentioned across multiple days.
  for (const p of review.problems) {
    if (p.days >= 3) {
      items.push({ key: `theme-${p.theme}`, severity: "warn", message: `${p.theme} came up on ${p.days} days this ${period.noun}.` });
    }
  }

  // Overdue tasks piling up.
  if (review.tasks.overdue >= 3) {
    items.push({ key: "tasks-overdue", severity: "warn", message: `${review.tasks.overdue} tasks are overdue.` });
  }

  return items;
};
