import type { Result } from "../core/result";
import { ok, err } from "../core/result";
import { CURRENT_SCHEMA_VERSION } from "../config";

/** A single forward migration step. `migrate` transforms the raw `data` blob. */
export interface Migration {
  readonly from: number;
  readonly to: number;
  migrate(data: unknown): unknown;
}

const asObject = (u: unknown): Record<string, unknown> =>
  typeof u === "object" && u !== null && !Array.isArray(u)
    ? (u as Record<string, unknown>)
    : {};
const asArray = (u: unknown): unknown[] => (Array.isArray(u) ? u : []);

/**
 * v0 (legacy, pre-versioning) -> v1.
 *
 * The old blob (hypothetical earlier build) stored:
 *   - habits with a string `frequency` (\"daily\" | \"weekly\") instead of a rule
 *   - a `habitLog` map { habitId: string[] of \"YYYY-MM-DD\" } instead of dated
 *     completion EVENTS
 * This migration upgrades habits to the recurrence-rule + completion-event model,
 * proving the versioned-migration path end to end.
 */
const legacyV0toV1 = (data: unknown): unknown => {
  const root = asObject(data);
  const now = "1970-01-01T00:00:00.000Z"; // deterministic placeholder for migrated rows

  const habitsIn = asArray(root["habits"]);
  const habits = habitsIn.map((h) => {
    const o = asObject(h);
    const freq = o["frequency"];
    const schedule =
      freq === "weekly"
        ? { kind: "weekly", days: [1], everyNWeeks: 1, anchor: "1970-01-01" }
        : { kind: "daily" };
    return {
      id: typeof o["id"] === "string" ? o["id"] : "",
      name: typeof o["name"] === "string" ? o["name"] : "Untitled habit",
      category: null,
      schedule,
      daypart: "anytime",
      active: true,
      target: null,
      reminder: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
  });

  // habitLog map -> flat completion events
  const log = asObject(root["habitLog"]);
  const habitCompletions: unknown[] = [];
  for (const [habitId, datesUnknown] of Object.entries(log)) {
    for (const date of asArray(datesUnknown)) {
      if (typeof date !== "string") continue;
      habitCompletions.push({
        id: `mig-${habitId}-${date}`,
        habitId,
        date,
        amount: null,
        completedAt: now,
        note: null,
      });
    }
  }

  return {
    goals: asArray(root["goals"]),
    tasks: asArray(root["tasks"]),
    habits,
    habitCompletions,
    routines: asArray(root["routines"]),
    projects: asArray(root["projects"]),
    journal: asArray(root["journal"]),
    settings: asObject(root["settings"]),
  };
};

/**
 * v1 -> v2: Phase 3 introduces the Fitness, Diet, Sleep, and Reading modules.
 * The migration is purely additive — it preserves every existing collection and
 * initialises the new ones as empty arrays, and backfills default nutrition
 * targets into settings if absent. No existing data is touched or lost.
 */
const v1toV2 = (data: unknown): unknown => {
  const root = asObject(data);
  const settings = asObject(root["settings"]);
  const nutrition = asObject(settings["nutrition"]);
  const hasNutrition =
    typeof nutrition["calories"] === "number" &&
    typeof nutrition["proteinGrams"] === "number" &&
    typeof nutrition["waterMl"] === "number";
  return {
    ...root,
    exercises: asArray(root["exercises"]),
    workoutPlans: asArray(root["workoutPlans"]),
    workoutSessions: asArray(root["workoutSessions"]),
    bodyWeights: asArray(root["bodyWeights"]),
    measurements: asArray(root["measurements"]),
    foods: asArray(root["foods"]),
    meals: asArray(root["meals"]),
    waterLog: asArray(root["waterLog"]),
    sleepLog: asArray(root["sleepLog"]),
    reading: asArray(root["reading"]),
    learningLog: asArray(root["learningLog"]),
    settings: {
      ...settings,
      nutrition: hasNutrition
        ? nutrition
        : { calories: 2200, proteinGrams: 130, waterMl: 3000 },
    },
  };
};

export const MIGRATIONS: readonly Migration[] = [
  { from: 0, to: 1, migrate: legacyV0toV1 },
  { from: 1, to: 2, migrate: v1toV2 },
];

/**
 * Apply migrations to move `data` from `fromVersion` up to `toVersion`.
 * Refuses to load data from a NEWER schema than this build understands, rather
 * than risk corrupting it.
 */
export const runMigrations = (
  data: unknown,
  fromVersion: number,
  toVersion: number = CURRENT_SCHEMA_VERSION,
): Result<unknown> => {
  if (fromVersion > toVersion) {
    return err(
      `data schema v${fromVersion} is newer than supported v${toVersion}`,
    );
  }
  let current = data;
  let version = fromVersion;
  while (version < toVersion) {
    const step = MIGRATIONS.find((m) => m.from === version);
    if (step === undefined) {
      return err(`no migration path from schema v${version}`);
    }
    current = step.migrate(current);
    version = step.to;
  }
  return ok(current);
};
