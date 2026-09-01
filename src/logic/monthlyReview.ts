import type { AppData } from "../domain/appData";
import type { LocalDate } from "../time/localDate";
import { localDateOf, parseLocalDate, addDays } from "../time/localDate";
import {
  habitConsistency,
  ratingSummary,
  learnedThisWeek,
  recurringProblems,
  recurringWins,
  taskStats,
  sleepStats,
  dietStats,
  fitnessStats,
  readingStats,
  type WeekRange,
  type HabitConsistency,
  type RatingSummary,
  type LearnedEntry,
  type ThemeHit,
  type TaskStats,
  type SleepStats,
  type DietStats,
  type FitnessStats,
  type ReadingStats,
} from "./weeklyReview";

/**
 * Monthly Review reuses the exact weekly aggregation functions (which all accept
 * a { start, end, days } range) over a whole-month range. No logic is duplicated;
 * only the range differs, so weekly and monthly numbers are computed identically.
 */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

export interface MonthRange extends WeekRange {
  readonly year: number;
  readonly month: number; // 1-12
  readonly label: string; // "September 2026"
}

export const monthRangeContaining = (day: LocalDate): MonthRange => {
  const { year, month } = parseLocalDate(day);
  const start = localDateOf(year, month, 1);
  const dim = daysInMonth(year, month);
  const end = localDateOf(year, month, dim);
  const days = Array.from({ length: dim }, (_, i) => addDays(start, i));
  return { start, end, days, year, month, label: `${MONTHS[month - 1]} ${year}` };
};

export const shiftMonth = (range: MonthRange, months: number): MonthRange => {
  // Normalise to a year/month then rebuild.
  const zeroBased = range.month - 1 + months;
  const year = range.year + Math.floor(zeroBased / 12);
  const month = ((zeroBased % 12) + 12) % 12; // 0-11
  return monthRangeContaining(localDateOf(year, month + 1, 1));
};

export interface MonthlyReview {
  readonly range: MonthRange;
  readonly habits: readonly HabitConsistency[];
  readonly habitRate: number | null;
  readonly ratings: RatingSummary;
  readonly learned: readonly LearnedEntry[];
  readonly problems: readonly ThemeHit[];
  readonly wins: readonly ThemeHit[];
  readonly tasks: TaskStats;
  readonly sleep: SleepStats;
  readonly diet: DietStats;
  readonly fitness: FitnessStats;
  readonly reading: ReadingStats;
  readonly reviewsWritten: number;
  readonly daysInMonth: number;
  readonly hasData: boolean;
}

export const buildMonthlyReview = (data: AppData, range: MonthRange, timeZone: string): MonthlyReview => {
  const habits = habitConsistency(data, range);
  const totalExpected = habits.reduce((a, h) => a + h.expected, 0);
  const totalCompleted = habits.reduce((a, h) => a + h.completed, 0);
  const ratings = ratingSummary(data, range);
  const tasks = taskStats(data, range, timeZone);
  const sleep = sleepStats(data, range, data.settings.sleepTargetMinutes);
  const diet = dietStats(data, range, {
    calories: data.settings.nutrition.calories,
    proteinGrams: data.settings.nutrition.proteinGrams,
    waterMl: data.settings.nutrition.waterMl,
  });
  const fitness = fitnessStats(data, range);
  const reading = readingStats(data, range);
  const inRange = (d: LocalDate): boolean => d >= range.start && d <= range.end;
  const reviewsWritten = data.journal.filter((j) => inRange(j.date)).length;
  const hasData =
    habits.length > 0 ||
    ratings.count > 0 ||
    reviewsWritten > 0 ||
    tasks.completed > 0 ||
    tasks.created > 0 ||
    sleep.nights > 0 ||
    diet.daysLogged > 0 ||
    fitness.workoutsThisWeek > 0 ||
    reading.finishedThisWeek > 0;
  return {
    range,
    habits,
    habitRate: totalExpected === 0 ? null : totalCompleted / totalExpected,
    ratings,
    learned: learnedThisWeek(data, range),
    problems: recurringProblems(data, range),
    wins: recurringWins(data, range),
    tasks,
    sleep,
    diet,
    fitness,
    reading,
    reviewsWritten,
    daysInMonth: range.days.length,
    hasData,
  };
};
