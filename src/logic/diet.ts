/**
 * Pure diet analytics. Daily totals are straight sums over logged meal items
 * (items already store scaled macros), and progress is measured against the
 * user's targets in Settings. No calorie math is invented — logged kcal is used
 * as-is.
 */
import type { AppData } from "../domain/appData";
import type { Macros, MealEntry } from "../domain/diet";
import type { NutritionTargets } from "../domain/settings";
import type { LocalDate } from "../time/localDate";

export const ZERO_MACROS: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export const addMacros = (a: Macros, b: Macros): Macros => ({
  kcal: a.kcal + b.kcal,
  protein: a.protein + b.protein,
  carbs: a.carbs + b.carbs,
  fat: a.fat + b.fat,
});

export const mealMacros = (meal: MealEntry): Macros =>
  meal.items.reduce((acc, it) => addMacros(acc, it.macros), ZERO_MACROS);

/** All meals logged on a date. */
export const mealsForDate = (
  data: AppData,
  date: LocalDate,
): readonly MealEntry[] => data.meals.filter((m) => m.date === date);

/** Sum of all macros logged on a date. */
export const dayMacros = (data: AppData, date: LocalDate): Macros =>
  mealsForDate(data, date).reduce((acc, m) => addMacros(acc, mealMacros(m)), ZERO_MACROS);

/** Total water (ml) logged on a date. */
export const dayWaterMl = (data: AppData, date: LocalDate): number =>
  data.waterLog
    .filter((w) => w.date === date)
    .reduce((acc, w) => acc + w.amountMl, 0);

export interface Progress {
  readonly current: number;
  readonly target: number;
  readonly ratio: number; // 0..1 (capped at 1 for display), remainder derivable
}

const prog = (current: number, target: number): Progress => ({
  current,
  target,
  ratio: target <= 0 ? 0 : Math.min(1, current / target),
});

export interface NutritionProgress {
  readonly macros: Macros;
  readonly waterMl: number;
  readonly calories: Progress;
  readonly protein: Progress;
  readonly water: Progress;
}

export const nutritionProgress = (
  data: AppData,
  date: LocalDate,
  targets: NutritionTargets,
): NutritionProgress => {
  const macros = dayMacros(data, date);
  const waterMl = dayWaterMl(data, date);
  return {
    macros,
    waterMl,
    calories: prog(macros.kcal, targets.calories),
    protein: prog(macros.protein, targets.proteinGrams),
    water: prog(waterMl, targets.waterMl),
  };
};
