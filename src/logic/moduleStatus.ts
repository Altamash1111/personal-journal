/**
 * A compact, read-only snapshot of every Phase 3 module for a given day. This is
 * what lets the Today dashboard show "your whole day in one place" without the
 * dashboard knowing any module's internal rules — it just reads this summary,
 * which itself delegates to each module's pure logic.
 */
import type { AppData } from "../domain/appData";
import type { Settings } from "../domain/settings";
import type { LocalDate } from "../time/localDate";
import type { Progress } from "./diet";
import { nutritionProgress } from "./diet";
import { weeklyProgress } from "./fitness";
import { sleepForDate, sleepProgress } from "./sleep";
import { groupByStatus, learningForDate } from "./reading";

export interface WorkoutStatus {
  readonly loggedToday: boolean;
  readonly sessionsThisWeek: number;
  readonly volumeThisWeek: number;
}

export interface NutritionStatus {
  readonly calories: Progress;
  readonly protein: Progress;
  readonly water: Progress;
}

export interface SleepStatus {
  readonly logged: boolean;
  readonly durationMinutes: number;
  readonly ratio: number;
}

export interface ReadingStatus {
  readonly currentlyReading: number;
  readonly notesToday: number;
}

export interface ModuleStatus {
  readonly workout: WorkoutStatus;
  readonly nutrition: NutritionStatus;
  readonly sleep: SleepStatus;
  readonly reading: ReadingStatus;
}

export const todayModuleStatus = (
  data: AppData,
  date: LocalDate,
  settings: Settings,
): ModuleStatus => {
  const week = weeklyProgress(data, date);
  const loggedToday = data.workoutSessions.some(
    (s) => s.date === date && s.completedAt !== null,
  );

  const n = nutritionProgress(data, date, settings.nutrition);

  const entry = sleepForDate(data, date);
  const sp = sleepProgress(entry, settings.sleepTargetMinutes);

  const groups = groupByStatus(data);

  return {
    workout: {
      loggedToday,
      sessionsThisWeek: week.sessions,
      volumeThisWeek: week.volume,
    },
    nutrition: { calories: n.calories, protein: n.protein, water: n.water },
    sleep: {
      logged: sp.logged,
      durationMinutes: sp.durationMinutes,
      ratio: sp.ratio,
    },
    reading: {
      currentlyReading: groups.current.length,
      notesToday: learningForDate(data, date).length,
    },
  };
};
