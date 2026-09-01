import type { Settings } from "../domain/settings";
import type { TaskPriority } from "../domain/task";

/**
 * Centralized configuration. Single source of truth for constants used across
 * layers — nothing here is duplicated elsewhere (persistence imports the schema
 * version from here, not a second literal).
 */
export const APP_CONFIG = {
  appName: "Personal Life OS",
  /** localStorage key / logical store name. */
  storageKey: "personal-life-os",
  /** Bumped whenever the persisted AppData shape changes; drives migrations. */
  schemaVersion: 2,
  defaultTimeZone: "Asia/Kolkata",
} as const;

export const CURRENT_SCHEMA_VERSION = APP_CONFIG.schemaVersion;

export const DEFAULT_SETTINGS: Settings = {
  timeZone: APP_CONFIG.defaultTimeZone,
  weekStartsOn: 1, // Monday
  sleepTargetMinutes: 8 * 60,
  nutrition: {
    calories: 2200,
    proteinGrams: 130,
    waterMl: 3000,
  },
};

/** Numeric ordering for priorities (higher = more urgent), for sorting. */
export const PRIORITY_ORDER: Readonly<Record<TaskPriority, number>> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};
