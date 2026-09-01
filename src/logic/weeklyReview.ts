import type { AppData } from "../domain/appData";
import type { LocalDate, Weekday } from "../time/localDate";
import { addDays, parseLocalDate, compareLocalDate } from "../time/localDate";
import { startOfWeek } from "../time/week";
import { isHabitDueOn, isHabitCompletedOn } from "./habits";
import { isCompleted } from "./tasks";
import { dayMacros, dayWaterMl } from "./diet";
import { sessionVolume } from "./fitness";

/**
 * Weekly Review analytics. Everything here is a PURE aggregation of already-stored
 * user data (habit completions, journal entries, tasks, sleep, sessions). No values
 * are invented; when there isn't enough data a caller can show an empty state.
 *
 * A "week" is the 7 local days starting on the user's configured weekStartsOn.
 */

export interface WeekRange {
  readonly start: LocalDate;
  readonly end: LocalDate; // inclusive (start + 6)
  readonly days: readonly LocalDate[]; // 7 days, start..end
}

export const weekRangeContaining = (day: LocalDate, weekStartsOn: Weekday): WeekRange => {
  const start = startOfWeek(day, weekStartsOn);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return { start, end: days[6]!, days };
};

/** Shift a week range by N weeks (negative = earlier). */
export const shiftWeek = (range: WeekRange, weeks: number): WeekRange => {
  const start = addDays(range.start, weeks * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return { start, end: days[6]!, days };
};

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export const shortDay = (d: LocalDate): string => WEEKDAY[weekdayIndex(d)]!;
const weekdayIndex = (d: LocalDate): number => {
  const { year, month, day } = parseLocalDate(d);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};
export const labelDay = (d: LocalDate): string => {
  const { month, day } = parseLocalDate(d);
  return `${MONTHS[month - 1]} ${day}`;
};
export const labelRange = (r: WeekRange): string => `${labelDay(r.start)} – ${labelDay(r.end)}`;

// ---------- Habit consistency ----------
export interface HabitConsistency {
  readonly habitId: string;
  readonly name: string;
  readonly completed: number;
  readonly expected: number;
  readonly rate: number; // 0..1; 0 when nothing expected
  readonly missedDates: readonly LocalDate[];
}

export const habitConsistency = (data: AppData, range: WeekRange): readonly HabitConsistency[] => {
  const active = data.habits.filter((hh) => hh.active && hh.archivedAt === null);
  return active
    .map((hh) => {
      let completed = 0;
      let expected = 0;
      const missedDates: LocalDate[] = [];
      for (const d of range.days) {
        if (!isHabitDueOn(hh, d)) continue;
        expected += 1;
        if (isHabitCompletedOn(hh, d, data.habitCompletions)) completed += 1;
        else missedDates.push(d);
      }
      return {
        habitId: hh.id,
        name: hh.name,
        completed,
        expected,
        rate: expected === 0 ? 0 : completed / expected,
        missedDates,
      };
    })
    .filter((h) => h.expected > 0)
    .sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name));
};

// ---------- Daily ratings ----------
export interface DailyRating {
  readonly date: LocalDate;
  readonly rating: number | null;
}
export interface RatingSummary {
  readonly perDay: readonly DailyRating[];
  readonly average: number | null; // over days that have a rating
  readonly count: number;
}

export const ratingSummary = (data: AppData, range: WeekRange): RatingSummary => {
  const byDate = new Map(data.journal.map((j) => [j.date, j.rating] as const));
  const perDay = range.days.map((d) => ({ date: d, rating: byDate.get(d) ?? null }));
  const rated = perDay.filter((p) => p.rating !== null) as { date: LocalDate; rating: number }[];
  const average = rated.length === 0 ? null : rated.reduce((a, p) => a + p.rating, 0) / rated.length;
  return { perDay, average, count: rated.length };
};

// ---------- "What I learned", organised by day ----------
export interface LearnedEntry {
  readonly date: LocalDate;
  readonly text: string;
}
export const learnedThisWeek = (data: AppData, range: WeekRange): readonly LearnedEntry[] =>
  data.journal
    .filter((j) => inRange(j.date, range) && j.learned !== null && j.learned.trim() !== "")
    .map((j) => ({ date: j.date, text: j.learned!.trim() }))
    .sort((a, b) => compareLocalDate(a.date, b.date));

// ---------- Recurring themes from review text (deterministic keyword match) ----------
export interface ThemeHit {
  readonly theme: string;
  readonly days: number; // distinct days it appeared
  readonly dates: readonly LocalDate[];
}

// Small, transparent keyword map. Not "AI" — just honest string matching.
const PROBLEM_THEMES: Record<string, readonly string[]> = {
  "Screen time / reels": ["reel", "reels", "instagram", "insta", "youtube", "scroll", "social media", "phone", "screen time"],
  Procrastination: ["procrastinat", "put off", "delayed", "postponed", "wasted time", "time waste"],
  "Learning skipped": ["didn't study", "didnt study", "no study", "skipped learning", "no learning", "didn't learn"],
  "Poor sleep": ["slept late", "no sleep", "poor sleep", "didn't sleep", "didnt sleep", "late night", "stayed up"],
  "Skipped workout": ["skipped workout", "no workout", "missed gym", "didn't train", "didnt train", "no training"],
  Distraction: ["distract", "unfocused", "lost focus", "couldn't focus"],
};
const POSITIVE_THEMES: Record<string, readonly string[]> = {
  "Completed workout": ["workout", "trained", "gym", "exercise", "pushups", "run", "sprint"],
  "Morning routine": ["morning routine", "routine", "skincare", "brushed"],
  "Hit diet target": ["ate well", "hit protein", "hit calories", "diet", "nutrition", "protein"],
  "Read consistently": ["read", "reading", "book", "pages"],
  "Focused work": ["focused", "deep work", "productive", "shipped", "finished", "completed"],
  "Good sleep": ["slept well", "good sleep", "rested", "8 hours", "early"],
};

const themeHits = (
  entries: readonly { date: LocalDate; text: string | null }[],
  themes: Record<string, readonly string[]>,
): readonly ThemeHit[] => {
  const acc = new Map<string, Set<LocalDate>>();
  for (const e of entries) {
    if (e.text === null) continue;
    const hay = e.text.toLowerCase();
    for (const [theme, needles] of Object.entries(themes)) {
      if (needles.some((n) => hay.includes(n))) {
        if (!acc.has(theme)) acc.set(theme, new Set());
        acc.get(theme)!.add(e.date);
      }
    }
  }
  return [...acc.entries()]
    .map(([theme, set]) => ({ theme, days: set.size, dates: [...set].sort(compareLocalDate) }))
    .sort((a, b) => b.days - a.days || a.theme.localeCompare(b.theme));
};

export const recurringProblems = (data: AppData, range: WeekRange): readonly ThemeHit[] =>
  themeHits(
    data.journal.filter((j) => inRange(j.date, range)).map((j) => ({ date: j.date, text: j.wentWrong })),
    PROBLEM_THEMES,
  );

export const recurringWins = (data: AppData, range: WeekRange): readonly ThemeHit[] =>
  themeHits(
    data.journal.filter((j) => inRange(j.date, range)).map((j) => ({ date: j.date, text: j.accomplished })),
    POSITIVE_THEMES,
  );

// ---------- Task analytics ----------
export interface TaskStats {
  readonly completed: number; // completed within the week (by completedAt local day)
  readonly created: number; // created within the week
  readonly pending: number; // still active as of end of week
  readonly overdue: number; // active with due < end-of-week
  readonly completionRate: number | null; // completed / (completed + pending); null if none
}

export const taskStats = (data: AppData, range: WeekRange, timeZone: string): TaskStats => {
  const completed = data.tasks.filter(
    (t) => t.completedAt !== null && inRange(instantDay(t.completedAt, timeZone), range),
  ).length;
  const created = data.tasks.filter((t) => inRange(instantDay(t.createdAt, timeZone), range)).length;
  const pending = data.tasks.filter((t) => !isCompleted(t)).length;
  const overdue = data.tasks.filter(
    (t) => !isCompleted(t) && t.due !== null && compareLocalDate(t.due, range.end) < 0,
  ).length;
  const denom = completed + pending;
  return { completed, created, pending, overdue, completionRate: denom === 0 ? null : completed / denom };
};

// ---------- helpers ----------
const inRange = (d: LocalDate, r: WeekRange): boolean =>
  compareLocalDate(d, r.start) >= 0 && compareLocalDate(d, r.end) <= 0;

// Convert a stored Timestamp (ISO instant) to a local calendar day. Kept local to
// avoid a hard dependency cycle; mirrors time/timezone but tolerant of bad input.
const instantDay = (ts: string, timeZone: string): LocalDate => {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(ts));
    const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "01";
    return `${g("year")}-${g("month")}-${g("day")}` as LocalDate;
  } catch {
    return (ts.slice(0, 10)) as LocalDate;
  }
};

// ---------- Whole-week rollup ----------
export interface WeeklyReview {
  readonly range: WeekRange;
  readonly habits: readonly HabitConsistency[];
  readonly habitRate: number | null; // overall completed/expected across habits
  readonly ratings: RatingSummary;
  readonly learned: readonly LearnedEntry[];
  readonly problems: readonly ThemeHit[];
  readonly wins: readonly ThemeHit[];
  readonly tasks: TaskStats;
  readonly sleep: SleepStats;
  readonly diet: DietStats;
  readonly fitness: FitnessStats;
  readonly reading: ReadingStats;
  readonly reviewsWritten: number; // journal entries in range
  readonly hasData: boolean;
}

export const buildWeeklyReview = (data: AppData, range: WeekRange, timeZone: string): WeeklyReview => {
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
  const reviewsWritten = data.journal.filter((j) => inRange(j.date, range)).length;
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
    hasData,
  };
};

// ---------- Sleep analytics (target = settings.sleepTargetMinutes) ----------
export interface SleepStats {
  readonly nights: number;
  readonly avgMinutes: number | null;
  readonly daysMetTarget: number;
  readonly bestMinutes: number | null;
  readonly worstMinutes: number | null;
  readonly targetMinutes: number;
}

export const sleepStats = (data: AppData, range: WeekRange, targetMinutes: number): SleepStats => {
  const nights = data.sleepLog.filter((s) => inRange(s.date, range));
  if (nights.length === 0) {
    return { nights: 0, avgMinutes: null, daysMetTarget: 0, bestMinutes: null, worstMinutes: null, targetMinutes };
  }
  const durations = nights.map((n) => n.durationMinutes);
  const total = durations.reduce((a, m) => a + m, 0);
  return {
    nights: nights.length,
    avgMinutes: Math.round(total / nights.length),
    daysMetTarget: durations.filter((m) => m >= targetMinutes).length,
    bestMinutes: Math.max(...durations),
    worstMinutes: Math.min(...durations),
    targetMinutes,
  };
};

// ---------- Diet analytics (targets are MINIMUMS: >= is success) ----------
export interface DietStats {
  readonly daysLogged: number;
  readonly daysCalorieMin: number; // days kcal >= target
  readonly daysProteinMin: number;
  readonly daysWaterMin: number;
  readonly avgCalories: number | null;
  readonly avgProtein: number | null;
  readonly avgWaterMl: number | null;
  readonly targets: { readonly calories: number; readonly protein: number; readonly waterMl: number };
}

export const dietStats = (
  data: AppData,
  range: WeekRange,
  targets: { readonly calories: number; readonly proteinGrams: number; readonly waterMl: number },
): DietStats => {
  const perDay = range.days.map((d) => {
    const m = dayMacros(data, d);
    const water = dayWaterMl(data, d);
    const logged = m.kcal > 0 || m.protein > 0 || water > 0;
    return { kcal: m.kcal, protein: m.protein, water, logged };
  });
  const logged = perDay.filter((p) => p.logged);
  const avg = (sel: (p: (typeof perDay)[number]) => number): number | null =>
    logged.length === 0 ? null : Math.round(logged.reduce((a, p) => a + sel(p), 0) / logged.length);
  return {
    daysLogged: logged.length,
    // "≥ target" is success — eating ABOVE a minimum is never a failure.
    daysCalorieMin: logged.filter((p) => p.kcal >= targets.calories).length,
    daysProteinMin: logged.filter((p) => p.protein >= targets.proteinGrams).length,
    daysWaterMin: logged.filter((p) => p.water >= targets.waterMl).length,
    avgCalories: avg((p) => p.kcal),
    avgProtein: avg((p) => p.protein),
    avgWaterMl: avg((p) => p.water),
    targets: { calories: targets.calories, protein: targets.proteinGrams, waterMl: targets.waterMl },
  };
};

// ---------- Fitness analytics ----------
export interface FitnessStats {
  readonly workoutsThisWeek: number;
  readonly workoutsPrevWeek: number;
  readonly totalVolume: number; // sum of completed-session volume this week
  readonly lastWorkoutDate: LocalDate | null;
}

export const fitnessStats = (data: AppData, range: WeekRange): FitnessStats => {
  const completed = data.workoutSessions.filter((s) => s.completedAt !== null);
  const thisWeek = completed.filter((s) => inRange(s.date, range));
  const prevRange = { start: addDays(range.start, -7), end: addDays(range.end, -7) };
  const prevWeek = completed.filter(
    (s) => compareLocalDate(s.date, prevRange.start) >= 0 && compareLocalDate(s.date, prevRange.end) <= 0,
  );
  const totalVolume = thisWeek.reduce((a, s) => a + sessionVolume(s), 0);
  const lastWorkoutDate =
    completed.length === 0
      ? null
      : completed.reduce((latest, s) => (compareLocalDate(s.date, latest) > 0 ? s.date : latest), completed[0]!.date);
  return {
    workoutsThisWeek: thisWeek.length,
    workoutsPrevWeek: prevWeek.length,
    totalVolume: Math.round(totalVolume),
    lastWorkoutDate,
  };
};

// ---------- Reading analytics ----------
export interface ReadingStats {
  readonly finishedThisWeek: number;
  readonly currentlyReading: number;
  readonly finishedTotal: number;
}

export const readingStats = (data: AppData, range: WeekRange): ReadingStats => ({
  finishedThisWeek: data.reading.filter(
    (r) => r.finishedAt !== null && inRange(r.finishedAt, range),
  ).length,
  currentlyReading: data.reading.filter((r) => r.status === "current").length,
  finishedTotal: data.reading.filter((r) => r.status === "finished").length,
});
