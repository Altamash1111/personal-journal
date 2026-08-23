/** Nominal typing helper. `Brand<string, \"GoalId\">` is assignment-incompatible
 *  with a raw string or another brand, catching id/date mix-ups at compile time. */
declare const __brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [__brand]: B };
