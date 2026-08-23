import type { Clock } from "../core/clock";
import { nowTimestamp } from "../core/clock";
import type { IdFactory } from "../core/id";
import type { Timestamp } from "../core/scalars";

/** Dependencies every mutating operation needs: id generation + a clock.
 *  Passing these in (rather than calling globals) keeps operations pure. */
export interface OpDeps {
  readonly ids: IdFactory;
  readonly clock: Clock;
}

export const newId = <T extends string>(deps: OpDeps): T => deps.ids() as T;
export const stamp = (deps: OpDeps): Timestamp => nowTimestamp(deps.clock);

/** Immutable array helpers. */
export const upsertById = <T extends { readonly id: string }>(
  items: readonly T[],
  item: T,
): readonly T[] => {
  const idx = items.findIndex((x) => x.id === item.id);
  if (idx === -1) return [...items, item];
  return items.map((x) => (x.id === item.id ? item : x));
};

export const removeById = <T extends { readonly id: string }>(
  items: readonly T[],
  id: string,
): readonly T[] => items.filter((x) => x.id !== id);

export const findById = <T extends { readonly id: string }>(
  items: readonly T[],
  id: string,
): T | undefined => items.find((x) => x.id === id);
