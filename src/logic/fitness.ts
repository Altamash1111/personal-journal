/**
 * Pure fitness analytics derived from logged sessions and body metrics. Nothing
 * is stored that can be computed: personal records, volume, overload trend, and
 * weekly/monthly rollups are all derived here from the immutable session log.
 */
import type { AppData } from "../domain/appData";
import type {
  WorkoutSession,
  SessionExercise,
  SetEntry,
} from "../domain/fitness";
import type { ExerciseId } from "../domain/ids";
import type { LocalDate } from "../time/localDate";
import { diffDays } from "../time/localDate";

/** Estimated one-rep max (Epley). Returns 0 when reps/weight are missing. */
export const estimatedOneRepMax = (weight: number, reps: number): number => {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
};

const countedSets = (se: SessionExercise): readonly SetEntry[] =>
  se.sets.filter((s) => s.completed);

/** Total volume (reps × weight) of a session's completed sets. */
export const sessionVolume = (session: WorkoutSession): number => {
  let vol = 0;
  for (const se of session.exercises) {
    for (const s of countedSets(se)) {
      vol += (s.reps ?? 0) * (s.weight ?? 0);
    }
  }
  return vol;
};

export interface ExercisePR {
  readonly exerciseId: ExerciseId;
  readonly maxWeight: number;
  readonly maxReps: number;
  readonly bestOneRepMax: number;
  readonly onDate: LocalDate | null; // date of the best est-1RM set
}

/** Personal records for one exercise across all sessions (completed sets only). */
export const exercisePR = (
  data: AppData,
  exerciseId: ExerciseId,
): ExercisePR => {
  let maxWeight = 0;
  let maxReps = 0;
  let bestOneRepMax = 0;
  let onDate: LocalDate | null = null;
  for (const session of data.workoutSessions) {
    for (const se of session.exercises) {
      if (se.exerciseId !== exerciseId) continue;
      for (const s of countedSets(se)) {
        const w = s.weight ?? 0;
        const r = s.reps ?? 0;
        if (w > maxWeight) maxWeight = w;
        if (r > maxReps) maxReps = r;
        const e1rm = estimatedOneRepMax(w, r);
        if (e1rm > bestOneRepMax) {
          bestOneRepMax = e1rm;
          onDate = session.date;
        }
      }
    }
  }
  return { exerciseId, maxWeight, maxReps, bestOneRepMax, onDate };
};

/** PRs for every exercise that appears in the session log, best-first. */
export const allPRs = (data: AppData): readonly ExercisePR[] => {
  const ids = new Set<ExerciseId>();
  for (const session of data.workoutSessions) {
    for (const se of session.exercises) ids.add(se.exerciseId);
  }
  return [...ids]
    .map((id) => exercisePR(data, id))
    .sort((a, b) => b.bestOneRepMax - a.bestOneRepMax);
};

export type OverloadTrend = "up" | "down" | "flat" | "insufficient";

export interface OverloadResult {
  readonly trend: OverloadTrend;
  readonly latestBestE1RM: number;
  readonly previousBestE1RM: number;
  readonly deltaPercent: number;
}

const bestE1RMForExerciseInSession = (
  session: WorkoutSession,
  exerciseId: ExerciseId,
): number => {
  let best = 0;
  for (const se of session.exercises) {
    if (se.exerciseId !== exerciseId) continue;
    for (const s of countedSets(se)) {
      best = Math.max(best, estimatedOneRepMax(s.weight ?? 0, s.reps ?? 0));
    }
  }
  return best;
};

/**
 * Progressive overload for an exercise: compares the best estimated 1RM of the
 * two most recent sessions that included it. "insufficient" when it appears in
 * fewer than two sessions.
 */
export const progressiveOverload = (
  data: AppData,
  exerciseId: ExerciseId,
): OverloadResult => {
  const sessions = data.workoutSessions
    .filter((s) => s.exercises.some((se) => se.exerciseId === exerciseId))
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // newest first

  if (sessions.length < 2) {
    return {
      trend: "insufficient",
      latestBestE1RM: sessions[0]
        ? bestE1RMForExerciseInSession(sessions[0], exerciseId)
        : 0,
      previousBestE1RM: 0,
      deltaPercent: 0,
    };
  }
  const latest = bestE1RMForExerciseInSession(sessions[0]!, exerciseId);
  const previous = bestE1RMForExerciseInSession(sessions[1]!, exerciseId);
  const deltaPercent =
    previous > 0 ? ((latest - previous) / previous) * 100 : 0;
  const trend: OverloadTrend =
    latest > previous ? "up" : latest < previous ? "down" : "flat";
  return {
    trend,
    latestBestE1RM: latest,
    previousBestE1RM: previous,
    deltaPercent,
  };
};

export interface BodyWeightTrend {
  readonly latest: number | null;
  readonly latestDate: LocalDate | null;
  readonly previous: number | null;
  readonly delta: number | null; // latest - previous (in latest's unit)
  readonly unit: string | null;
}

/** Latest body weight + change vs the prior reading. */
export const bodyWeightTrend = (data: AppData): BodyWeightTrend => {
  const sorted = data.bodyWeights
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const latest = sorted[0];
  const previous = sorted[1];
  if (latest === undefined) {
    return { latest: null, latestDate: null, previous: null, delta: null, unit: null };
  }
  return {
    latest: latest.weight,
    latestDate: latest.date,
    previous: previous?.weight ?? null,
    delta: previous ? latest.weight - previous.weight : null,
    unit: latest.unit,
  };
};

/** Latest value per measurement site, newest reading wins. */
export const latestMeasurements = (
  data: AppData,
): readonly { readonly site: string; readonly value: number; readonly unit: string; readonly date: LocalDate }[] => {
  const bySite = new Map<
    string,
    { site: string; value: number; unit: string; date: LocalDate }
  >();
  for (const m of data.measurements) {
    const cur = bySite.get(m.site);
    if (cur === undefined || m.date > cur.date) {
      bySite.set(m.site, { site: m.site, value: m.value, unit: m.unit, date: m.date });
    }
  }
  return [...bySite.values()].sort((a, b) => a.site.localeCompare(b.site));
};

export interface PeriodSummary {
  readonly sessions: number;
  readonly volume: number;
  readonly sets: number;
}

/** Sessions within the last `days` up to and including `date`. */
const sessionsInWindow = (
  data: AppData,
  date: LocalDate,
  days: number,
): readonly WorkoutSession[] =>
  data.workoutSessions.filter((s) => {
    const d = diffDays(s.date, date); // date - s.date
    return d >= 0 && d < days;
  });

const summarize = (sessions: readonly WorkoutSession[]): PeriodSummary => {
  let volume = 0;
  let sets = 0;
  for (const s of sessions) {
    volume += sessionVolume(s);
    for (const se of s.exercises) sets += countedSets(se).length;
  }
  return { sessions: sessions.length, volume, sets };
};

export const weeklyProgress = (data: AppData, date: LocalDate): PeriodSummary =>
  summarize(sessionsInWindow(data, date, 7));

export const monthlyProgress = (data: AppData, date: LocalDate): PeriodSummary =>
  summarize(sessionsInWindow(data, date, 30));
