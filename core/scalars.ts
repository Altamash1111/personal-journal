import type { Brand } from "./brand";

/** An exact instant in time, serialized as an ISO-8601 UTC string
 *  (e.g. \"2025-08-22T18:30:00.000Z\"). Use for created/updated/completed moments. */
export type Timestamp = Brand<string, "Timestamp">;

/** Construct a Timestamp from a Date (assumed already correct instant). */
export const timestampOf = (d: Date): Timestamp => d.toISOString() as Timestamp;
