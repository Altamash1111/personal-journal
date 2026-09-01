import type { AppData } from "../../domain/appData";
import type { LocalDate, Weekday } from "../../time/localDate";
import {
  weekRangeContaining,
  shiftWeek,
  buildWeeklyReview,
  labelRange,
  type WeeklyReview,
  type WeekRange,
} from "../../logic/weeklyReview";
import { buildScorecard, attentionItems, type Scorecard, type AttentionItem } from "../../logic/scorecard";

export interface WeekComparison {
  readonly habitRate: { readonly cur: number | null; readonly prev: number | null };
  readonly tasksCompleted: { readonly cur: number; readonly prev: number };
  readonly avgRating: { readonly cur: number | null; readonly prev: number | null };
}

export interface InsightsView {
  readonly rangeLabel: string;
  readonly isCurrentWeek: boolean;
  readonly canGoNext: boolean; // false when the selected week is the current one
  readonly review: WeeklyReview;
  readonly comparison: WeekComparison;
  readonly scorecard: Scorecard;
  readonly attention: readonly AttentionItem[];
}

/**
 * Build the Insights view for a week `offset` weeks from the one containing
 * `today` (0 = this week, -1 = last week). Also computes the previous week for
 * the "this week vs last week" comparison.
 */
export const buildInsightsView = (
  data: AppData,
  today: LocalDate,
  weekStartsOn: Weekday,
  offset: number,
  timeZone: string,
): InsightsView => {
  const thisWeek = weekRangeContaining(today, weekStartsOn);
  const selected: WeekRange = shiftWeek(thisWeek, offset);
  const previous: WeekRange = shiftWeek(selected, -1);

  const review = buildWeeklyReview(data, selected, timeZone);
  const prevReview = buildWeeklyReview(data, previous, timeZone);

  return {
    rangeLabel: labelRange(selected),
    isCurrentWeek: offset === 0,
    canGoNext: offset < 0,
    review,
    scorecard: buildScorecard(review),
    attention: attentionItems(data, review, today),
    comparison: {
      habitRate: { cur: review.habitRate, prev: prevReview.habitRate },
      tasksCompleted: { cur: review.tasks.completed, prev: prevReview.tasks.completed },
      avgRating: { cur: review.ratings.average, prev: prevReview.ratings.average },
    },
  };
};
