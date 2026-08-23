/**
 * Theme is a UI-only preference (never part of the domain store). This module is
 * the pure core: choice + system preference -> effective theme, and cycling.
 * Applying it to the document and persisting it are the DOM layer's job.
 */
export type ThemeChoice = "light" | "dark" | "system";
export type EffectiveTheme = "light" | "dark";

export const THEME_CHOICES: readonly ThemeChoice[] = ["dark", "light", "system"];

export const isThemeChoice = (v: unknown): v is ThemeChoice =>
  v === "light" || v === "dark" || v === "system";

export const resolveTheme = (
  choice: ThemeChoice,
  systemPrefersDark: boolean,
): EffectiveTheme => {
  if (choice === "system") return systemPrefersDark ? "dark" : "light";
  return choice;
};

/** Cycle order matches THEME_CHOICES: dark -> light -> system -> dark. */
export const nextTheme = (choice: ThemeChoice): ThemeChoice => {
  const i = THEME_CHOICES.indexOf(choice);
  return THEME_CHOICES[(i + 1) % THEME_CHOICES.length]!;
};

export const themeLabel = (choice: ThemeChoice): string => {
  if (choice === "dark") return "Dark";
  if (choice === "light") return "Light";
  return "System";
};
