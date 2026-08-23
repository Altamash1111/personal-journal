/**
 * Quick Add turns a short typed line + a chosen kind into a structured intent.
 * Deliberately NOT natural-language parsing (Phase 1 rule: no AI/NLP): the kind
 * is chosen explicitly in the UI, and we support only two tiny, predictable
 * conveniences on tasks — a leading "!" for high priority and "!!" for urgent.
 * Everything here is pure and returns null for empty input.
 */
import type { LocalDate } from "../../time/localDate";
import type { CreateTaskInput, CreateHabitInput } from "../../state/operations";

export type QuickAddKind = "task" | "habit";

export type QuickAddIntent =
  | { readonly kind: "task"; readonly input: CreateTaskInput }
  | { readonly kind: "habit"; readonly input: CreateHabitInput };

const stripPriority = (
  text: string,
): { readonly title: string; readonly priority: "urgent" | "high" | null } => {
  if (text.startsWith("!!")) {
    return { title: text.slice(2).trim(), priority: "urgent" };
  }
  if (text.startsWith("!")) {
    return { title: text.slice(1).trim(), priority: "high" };
  }
  return { title: text.trim(), priority: null };
};

export const parseQuickAdd = (
  kind: QuickAddKind,
  raw: string,
  today: LocalDate,
): QuickAddIntent | null => {
  const text = raw.trim();
  if (text.length === 0) return null;

  if (kind === "habit") {
    return {
      kind: "habit",
      input: { name: text, schedule: { kind: "daily" } },
    };
  }

  const { title, priority } = stripPriority(text);
  if (title.length === 0) return null;
  const input: CreateTaskInput =
    priority === null
      ? { title, due: today }
      : { title, due: today, priority };
  return { kind: "task", input };
};
