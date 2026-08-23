/**
 * Personal Life OS — core (Phase 1).
 * Framework-agnostic, UI-free public API: domain types, pure logic, state
 * operations, versioned local persistence, and configuration.
 */

// Config
export { APP_CONFIG, CURRENT_SCHEMA_VERSION, DEFAULT_SETTINGS, PRIORITY_ORDER } from "./config";

// Core primitives
export type { Brand } from "./core/brand";
export type { Result } from "./core/result";
export { ok, err, isOk } from "./core/result";
export type { Timestamp } from "./core/scalars";
export { timestampOf } from "./core/scalars";
export type { Clock } from "./core/clock";
export { systemClock, fixedClock, nowTimestamp } from "./core/clock";
export type { IdFactory } from "./core/id";
export { uuidFactory, sequentialFactory } from "./core/id";

// Time
export type { LocalDate, Weekday, DateParts } from "./time";
export {
  isLocalDateString,
  parseLocalDate,
  localDateOf,
  toLocalDate,
  addDays,
  diffDays,
  compareLocalDate,
  weekdayOf,
  minLocalDate,
  maxLocalDate,
  instantToLocalDate,
  todayLocalDate,
  instantToLocalTime,
  startOfWeek,
  weekKey,
} from "./time";

// Domain
export * from "./domain";

// Logic
export * from "./logic";

// State operations
export * from "./state";

// Persistence
export * from "./persistence";
