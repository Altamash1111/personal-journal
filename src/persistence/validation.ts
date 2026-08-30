import type { AppData } from "../domain/appData";
import type { Settings } from "../domain/settings";
import type { Weekday } from "../time/localDate";
import type { Result } from "../core/result";
import { ok, err } from "../core/result";
import { DEFAULT_SETTINGS } from "../config";
import { isValidTimeZone } from "../time/timezone";

const isObject = (u: unknown): u is Record<string, unknown> =>
  typeof u === "object" && u !== null && !Array.isArray(u);
const isString = (u: unknown): u is string => typeof u === "string";
const isNumber = (u: unknown): u is number =>
  typeof u === "number" && Number.isFinite(u);
const isArray = (u: unknown): u is unknown[] => Array.isArray(u);

/** Entities must at least be objects carrying a string id; malformed ones are
 *  dropped from the working set but remain in the raw backup and are reported. */
const isEntityLike = (u: unknown): u is { readonly id: string } =>
  isObject(u) && isString(u["id"]);

export interface EnvelopeShape {
  readonly schemaVersion: number;
  readonly savedAt: string;
  readonly data: unknown;
}

/** Validate the versioned wrapper. Legacy blobs (no schemaVersion) are detected
 *  upstream in serialization and given schemaVersion 0 before reaching here. */
export const validateEnvelopeShape = (
  u: unknown,
): Result<EnvelopeShape> => {
  if (!isObject(u)) return err("root is not an object");
  if (!isNumber(u["schemaVersion"])) {
    return err("missing or invalid schemaVersion");
  }
  const savedAt = isString(u["savedAt"]) ? u["savedAt"] : "";
  return ok({
    schemaVersion: u["schemaVersion"],
    savedAt,
    data: u["data"],
  });
};

const coerceSettings = (
  u: unknown,
  issues: string[],
): Settings => {
  if (!isObject(u)) {
    issues.push("settings missing/invalid; using defaults");
    return DEFAULT_SETTINGS;
  }
  const tz =
    isString(u["timeZone"]) && isValidTimeZone(u["timeZone"])
      ? u["timeZone"]
      : DEFAULT_SETTINGS.timeZone;
  const wRaw = u["weekStartsOn"];
  const weekStartsOn: Weekday =
    isNumber(wRaw) && wRaw >= 0 && wRaw <= 6
      ? (Math.trunc(wRaw) as Weekday)
      : DEFAULT_SETTINGS.weekStartsOn;
  const sleep = isNumber(u["sleepTargetMinutes"])
    ? u["sleepTargetMinutes"]
    : DEFAULT_SETTINGS.sleepTargetMinutes;
  const n = isObject(u["nutrition"]) ? u["nutrition"] : {};
  const nutrition = {
    calories: isNumber(n["calories"])
      ? n["calories"]
      : DEFAULT_SETTINGS.nutrition.calories,
    proteinGrams: isNumber(n["proteinGrams"])
      ? n["proteinGrams"]
      : DEFAULT_SETTINGS.nutrition.proteinGrams,
    waterMl: isNumber(n["waterMl"])
      ? n["waterMl"]
      : DEFAULT_SETTINGS.nutrition.waterMl,
  };
  return { timeZone: tz, weekStartsOn, sleepTargetMinutes: sleep, nutrition };
};

const coerceCollection = <T>(
  u: unknown,
  name: string,
  issues: string[],
): readonly T[] => {
  if (!isArray(u)) {
    issues.push(`${name} was not an array; recovered as empty (original in backup)`);
    return [];
  }
  const valid: T[] = [];
  let dropped = 0;
  for (const item of u) {
    if (isEntityLike(item)) valid.push(item as T);
    else dropped++;
  }
  if (dropped > 0) {
    issues.push(`${name}: dropped ${dropped} malformed item(s) (original in backup)`);
  }
  return valid;
};

/**
 * Coerce parsed (already-migrated, current-version) data into a structurally valid
 * AppData, collecting a human-readable issue for anything recovered. Field-level
 * validation is intentionally shallow in Phase 1; structural safety is guaranteed
 * and nothing is lost silently (raw bytes are always retained by the caller).
 */
export const validateAndCoerce = (
  data: unknown,
): { readonly data: AppData; readonly issues: readonly string[] } => {
  const issues: string[] = [];
  const src = isObject(data) ? data : {};
  if (!isObject(data)) issues.push("data root missing/invalid; rebuilt as empty");
  const coerced: AppData = {
    goals: coerceCollection(src["goals"], "goals", issues),
    tasks: coerceCollection(src["tasks"], "tasks", issues),
    habits: coerceCollection(src["habits"], "habits", issues),
    habitCompletions: coerceCollection(
      src["habitCompletions"],
      "habitCompletions",
      issues,
    ),
    routines: coerceCollection(src["routines"], "routines", issues),
    projects: coerceCollection(src["projects"], "projects", issues),
    journal: coerceCollection(src["journal"], "journal", issues),
    exercises: coerceCollection(src["exercises"], "exercises", issues),
    workoutPlans: coerceCollection(src["workoutPlans"], "workoutPlans", issues),
    workoutSessions: coerceCollection(
      src["workoutSessions"],
      "workoutSessions",
      issues,
    ),
    bodyWeights: coerceCollection(src["bodyWeights"], "bodyWeights", issues),
    measurements: coerceCollection(src["measurements"], "measurements", issues),
    foods: coerceCollection(src["foods"], "foods", issues),
    meals: coerceCollection(src["meals"], "meals", issues),
    waterLog: coerceCollection(src["waterLog"], "waterLog", issues),
    sleepLog: coerceCollection(src["sleepLog"], "sleepLog", issues),
    reading: coerceCollection(src["reading"], "reading", issues),
    learningLog: coerceCollection(src["learningLog"], "learningLog", issues),
    settings: coerceSettings(src["settings"], issues),
  };
  return { data: coerced, issues };
};
