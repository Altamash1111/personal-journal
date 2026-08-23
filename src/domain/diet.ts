import type { Timestamp } from "../core/scalars";
import type { LocalDate } from "../time/localDate";
import type { FoodId, MealId, MealItemId, WaterEntryId } from "./ids";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export const MEAL_TYPES: readonly MealType[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
];

/** Macronutrient bundle. `kcal` is stored explicitly (not derived) so logged
 *  foods keep whatever calorie figure the label/source stated. */
export interface Macros {
  readonly kcal: number;
  readonly protein: number; // grams
  readonly carbs: number; // grams
  readonly fat: number; // grams
}

/** A reusable food definition (the catalog); macros are per one serving. */
export interface FoodItem {
  readonly id: FoodId;
  readonly name: string;
  readonly serving: string | null; // e.g. "1 cup", "100 g"
  readonly per: Macros;
  readonly archived: boolean;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

/** A line item inside a meal. `macros` is the TOTAL for `quantity` servings
 *  (already scaled), so daily sums are a straight add across items. */
export interface MealItem {
  readonly id: MealItemId;
  readonly foodId: FoodId | null; // null = ad-hoc item not in the catalog
  readonly name: string;
  readonly quantity: number;
  readonly macros: Macros;
}

export interface MealEntry {
  readonly id: MealId;
  readonly date: LocalDate;
  readonly type: MealType;
  readonly items: readonly MealItem[];
  readonly note: string | null;
  readonly loggedAt: Timestamp;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

/** A dated water log entry (in millilitres). */
export interface WaterEntry {
  readonly id: WaterEntryId;
  readonly date: LocalDate;
  readonly amountMl: number;
  readonly loggedAt: Timestamp;
}
