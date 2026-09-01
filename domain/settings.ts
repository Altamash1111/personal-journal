import type { Weekday } from "../time/localDate";

/** Daily nutrition targets used by the Diet module's progress. */
export interface NutritionTargets {
  readonly calories: number; // kcal/day
  readonly proteinGrams: number; // g/day
  readonly waterMl: number; // ml/day
}

/** User-configurable, persisted with the data. Timezone drives all day-based logic. */
export interface Settings {
  readonly timeZone: string; // IANA, e.g. "Asia/Kolkata"
  readonly weekStartsOn: Weekday; // 0 Sun .. 6 Sat
  readonly sleepTargetMinutes: number;
  readonly nutrition: NutritionTargets;
}
