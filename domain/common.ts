/** Part of the day a habit/routine belongs to. \"anytime\" = not time-bound. */
export type Daypart = "morning" | "afternoon" | "evening" | "night" | "anytime";

export const DAYPARTS: readonly Daypart[] = [
  "morning",
  "afternoon",
  "evening",
  "night",
  "anytime",
];
