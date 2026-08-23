/**
 * Pure view models for the Phase 3 module pages. Like the Today view model, these
 * are deterministic projections that delegate every calculation to Phase 1/Phase 3
 * logic — the DOM layer renders them and nothing more.
 */
import type { AppData } from "../../domain/appData";
import type { Settings } from "../../domain/settings";
import type { LocalDate } from "../../time/localDate";
import type { Daypart } from "../../domain/common";
import type { MealType } from "../../domain/diet";
import type { ReadingKind, ReadingStatus, ProgressUnit } from "../../domain/reading";
import type { BodyWeightTrend, PeriodSummary } from "../../logic/fitness";
import type { NutritionProgress } from "../../logic/diet";
import type { SleepProgress } from "../../logic/sleep";

import {
  allPRs,
  bodyWeightTrend,
  latestMeasurements,
  sessionVolume,
  weeklyProgress,
  monthlyProgress,
} from "../../logic/fitness";
import { nutritionProgress, mealMacros } from "../../logic/diet";
import {
  lastNights,
  sleepForDate,
  sleepProgress,
  averageDurationMinutes,
  consistencyScore,
} from "../../logic/sleep";
import { groupByStatus, readingProgress, learningForDate } from "../../logic/reading";

// ---------------- Fitness ----------------

export interface SetVM {
  readonly id: string;
  readonly reps: number | null;
  readonly weight: number | null;
  readonly completed: boolean;
}
export interface SessionExerciseVM {
  readonly id: string;
  readonly exerciseId: string;
  readonly name: string;
  readonly sets: readonly SetVM[];
}
export interface SessionVM {
  readonly id: string;
  readonly date: LocalDate;
  readonly name: string | null;
  readonly volume: number;
  readonly completed: boolean;
  readonly exercises: readonly SessionExerciseVM[];
}
export interface PRVM {
  readonly exerciseId: string;
  readonly name: string;
  readonly maxWeight: number;
  readonly bestOneRepMax: number;
  readonly unit: string;
}
export interface ExerciseOptionVM {
  readonly id: string;
  readonly name: string;
  readonly loadUnit: string | null;
}
export interface FitnessView {
  readonly today: LocalDate;
  readonly bodyWeight: BodyWeightTrend;
  readonly weekly: PeriodSummary;
  readonly monthly: PeriodSummary;
  readonly prs: readonly PRVM[];
  readonly exercises: readonly ExerciseOptionVM[];
  readonly sessions: readonly SessionVM[];
  readonly measurements: readonly {
    readonly site: string;
    readonly value: number;
    readonly unit: string;
    readonly date: LocalDate;
  }[];
  readonly isEmpty: boolean;
}

export const buildFitnessView = (data: AppData, today: LocalDate): FitnessView => {
  const nameOf = new Map(data.exercises.map((e) => [e.id, e.name] as const));
  const unitOf = new Map(data.exercises.map((e) => [e.id, e.loadUnit] as const));

  const sessions: SessionVM[] = data.workoutSessions
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((s) => ({
      id: s.id,
      date: s.date,
      name: s.name,
      volume: sessionVolume(s),
      completed: s.completedAt !== null,
      exercises: s.exercises.map((se) => ({
        id: se.id,
        exerciseId: se.exerciseId,
        name: nameOf.get(se.exerciseId) ?? "Exercise",
        sets: se.sets.map((x) => ({
          id: x.id,
          reps: x.reps,
          weight: x.weight,
          completed: x.completed,
        })),
      })),
    }));

  const prs: PRVM[] = allPRs(data)
    .filter((p) => p.bestOneRepMax > 0)
    .map((p) => ({
      exerciseId: p.exerciseId,
      name: nameOf.get(p.exerciseId) ?? "Exercise",
      maxWeight: p.maxWeight,
      bestOneRepMax: Math.round(p.bestOneRepMax * 10) / 10,
      unit: unitOf.get(p.exerciseId) ?? "kg",
    }));

  return {
    today,
    bodyWeight: bodyWeightTrend(data),
    weekly: weeklyProgress(data, today),
    monthly: monthlyProgress(data, today),
    prs,
    exercises: data.exercises
      .filter((e) => !e.archived)
      .map((e) => ({ id: e.id, name: e.name, loadUnit: e.loadUnit })),
    sessions,
    measurements: latestMeasurements(data),
    isEmpty:
      data.workoutSessions.length === 0 &&
      data.bodyWeights.length === 0 &&
      data.measurements.length === 0,
  };
};

// ---------------- Diet ----------------

export interface MealVM {
  readonly id: string;
  readonly type: MealType;
  readonly name: string;
  readonly kcal: number;
  readonly protein: number;
}
export interface DietView {
  readonly today: LocalDate;
  readonly progress: NutritionProgress;
  readonly targets: Settings["nutrition"];
  readonly meals: readonly MealVM[];
  readonly isEmpty: boolean;
}

export const buildDietView = (
  data: AppData,
  today: LocalDate,
  settings: Settings,
): DietView => {
  const meals: MealVM[] = data.meals
    .filter((m) => m.date === today)
    .slice()
    .sort((a, b) => (a.loggedAt < b.loggedAt ? 1 : -1))
    .map((m) => {
      const macros = mealMacros(m);
      const first = m.items[0];
      return {
        id: m.id,
        type: m.type,
        name: first?.name ?? "Meal",
        kcal: macros.kcal,
        protein: macros.protein,
      };
    });
  return {
    today,
    progress: nutritionProgress(data, today, settings.nutrition),
    targets: settings.nutrition,
    meals,
    isEmpty: meals.length === 0 && data.waterLog.every((w) => w.date !== today),
  };
};

// ---------------- Sleep ----------------

export interface NightVM {
  readonly date: LocalDate;
  readonly durationMinutes: number;
  readonly quality: number | null;
}
export interface SleepView {
  readonly today: LocalDate;
  readonly targetMinutes: number;
  readonly progress: SleepProgress;
  readonly nights: readonly NightVM[];
  readonly averageMinutes: number;
  readonly consistency: number | null;
  readonly isEmpty: boolean;
}

export const buildSleepView = (
  data: AppData,
  today: LocalDate,
  settings: Settings,
): SleepView => {
  const recent = lastNights(data, today, 7);
  return {
    today,
    targetMinutes: settings.sleepTargetMinutes,
    progress: sleepProgress(sleepForDate(data, today), settings.sleepTargetMinutes),
    nights: recent.map((n) => ({
      date: n.date,
      durationMinutes: n.durationMinutes,
      quality: n.quality,
    })),
    averageMinutes: averageDurationMinutes(recent),
    consistency: consistencyScore(recent),
    isEmpty: data.sleepLog.length === 0,
  };
};

// ---------------- Routines & hygiene (user-configurable habits) ----------------

export interface HabitAdminVM {
  readonly id: string;
  readonly name: string;
  readonly daypart: Daypart;
  readonly active: boolean;
  readonly measurable: boolean;
  readonly target: number | null;
  readonly unit: string | null;
  readonly category: string | null;
}
export interface RoutineAdminVM {
  readonly id: string;
  readonly name: string;
  readonly daypart: Daypart | null;
  readonly steps: readonly { readonly habitId: string; readonly name: string }[];
}
export interface RoutinesView {
  readonly habits: readonly HabitAdminVM[];
  readonly routines: readonly RoutineAdminVM[];
  readonly isEmpty: boolean;
}

export const buildRoutinesView = (data: AppData): RoutinesView => {
  const nameOf = new Map(data.habits.map((hh) => [hh.id, hh.name] as const));
  return {
    habits: data.habits
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((hh) => ({
        id: hh.id,
        name: hh.name,
        daypart: hh.daypart,
        active: hh.active,
        measurable: hh.target !== null,
        target: hh.target?.amount ?? null,
        unit: hh.target?.unit ?? null,
        category: hh.category,
      })),
    routines: data.routines.map((r) => ({
      id: r.id,
      name: r.name,
      daypart: r.daypart,
      steps: [...r.steps]
        .sort((a, b) => a.order - b.order)
        .flatMap((s) => {
          const name = nameOf.get(s.habitId);
          return name === undefined ? [] : [{ habitId: s.habitId, name }];
        }),
    })),
    isEmpty: data.habits.length === 0 && data.routines.length === 0,
  };
};

// ---------------- Reading & learning ----------------

export interface ReadingItemVM {
  readonly id: string;
  readonly kind: ReadingKind;
  readonly title: string;
  readonly author: string | null;
  readonly status: ReadingStatus;
  readonly unit: ProgressUnit;
  readonly current: number;
  readonly total: number | null;
  readonly percent: number;
  readonly notesCount: number;
}
export interface ReadingView {
  readonly today: LocalDate;
  readonly current: readonly ReadingItemVM[];
  readonly upcoming: readonly ReadingItemVM[];
  readonly finished: readonly ReadingItemVM[];
  readonly learningToday: readonly {
    readonly id: string;
    readonly topic: string | null;
    readonly text: string;
  }[];
  readonly isEmpty: boolean;
}

const toItemVM = (r: {
  id: string;
  kind: ReadingKind;
  title: string;
  author: string | null;
  status: ReadingStatus;
  unit: ProgressUnit;
  current: number;
  total: number | null;
  notes: readonly unknown[];
}): ReadingItemVM => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  author: r.author,
  status: r.status,
  unit: r.unit,
  current: r.current,
  total: r.total,
  percent: Math.round(
    readingProgress({
      ...r,
      // readingProgress only reads status/unit/total/current
    } as Parameters<typeof readingProgress>[0]) * 100,
  ),
  notesCount: r.notes.length,
});

export const buildReadingView = (data: AppData, today: LocalDate): ReadingView => {
  const groups = groupByStatus(data);
  return {
    today,
    current: groups.current.map(toItemVM),
    upcoming: groups.upcoming.map(toItemVM),
    finished: groups.finished.map(toItemVM),
    learningToday: learningForDate(data, today).map((e) => ({
      id: e.id,
      topic: e.topic,
      text: e.text,
    })),
    isEmpty: data.reading.length === 0 && data.learningLog.length === 0,
  };
};
