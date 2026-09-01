import type { AppData } from "../../domain/appData";
import type { LocalDate, Weekday } from "../../time/localDate";
import {
  monthRangeContaining,
  shiftMonth,
  buildMonthlyReview,
  type MonthlyReview,
  type MonthRange,
} from "../../logic/monthlyReview";
import { buildScorecard, attentionItems, type Scorecard, type AttentionItem } from "../../logic/scorecard";
import { bodyweightHistory, type BodyweightHistory } from "../../logic/goalIntelligence";
// The scorecard/attention take a WeeklyReview shape; MonthlyReview is structurally
// compatible for the fields they read, so we reuse them over the month.
import type { WeeklyReview } from "../../logic/weeklyReview";

export interface MonthComparison {
  readonly habitRate: { readonly cur: number | null; readonly prev: number | null };
  readonly tasksCompleted: { readonly cur: number; readonly prev: number };
  readonly avgRating: { readonly cur: number | null; readonly prev: number | null };
  readonly workouts: { readonly cur: number; readonly prev: number };
  readonly avgSleep: { readonly cur: number | null; readonly prev: number | null };
}

export interface MonthlyInsightsView {
  readonly label: string;
  readonly isCurrentMonth: boolean;
  readonly canGoNext: boolean;
  readonly review: MonthlyReview;
  readonly comparison: MonthComparison;
  readonly scorecard: Scorecard;
  readonly attention: readonly AttentionItem[];
  readonly bodyweight: BodyweightHistory;
}

export const buildMonthlyInsightsView = (
  data: AppData,
  today: LocalDate,
  _weekStartsOn: Weekday,
  offset: number,
  timeZone: string,
): MonthlyInsightsView => {
  const thisMonth = monthRangeContaining(today);
  const selected: MonthRange = shiftMonth(thisMonth, offset);
  const previous: MonthRange = shiftMonth(selected, -1);

  const review = buildMonthlyReview(data, selected, timeZone);
  const prev = buildMonthlyReview(data, previous, timeZone);
  const period = { days: review.daysInMonth, noun: "month" };

  return {
    label: selected.label,
    isCurrentMonth: offset === 0,
    canGoNext: offset < 0,
    review,
    scorecard: buildScorecard(review as unknown as WeeklyReview, period),
    attention: attentionItems(data, review as unknown as WeeklyReview, today, period),
    bodyweight: bodyweightHistory(data),
    comparison: {
      habitRate: { cur: review.habitRate, prev: prev.habitRate },
      tasksCompleted: { cur: review.tasks.completed, prev: prev.tasks.completed },
      avgRating: { cur: review.ratings.average, prev: prev.ratings.average },
      workouts: { cur: review.fitness.workoutsThisWeek, prev: prev.fitness.workoutsThisWeek },
      avgSleep: { cur: review.sleep.avgMinutes, prev: prev.sleep.avgMinutes },
    },
  };
};
