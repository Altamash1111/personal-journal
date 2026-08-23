/**
 * Renders the Today dashboard content region from a TodayView. No business logic
 * here — just projection + data-action hooks consumed by delegation in main.ts.
 */
import type { TodayView, TaskCardVM, HabitRowVM, RoutineGroupVM, GoalVM } from "../model/viewModel";
import type { ModuleStatus } from "../../logic/moduleStatus";
import { formatDuration } from "../../logic/sleep";
import { h } from "./h";

const pct = (frac: number): number => Math.round(Math.max(0, Math.min(1, frac)) * 100);

const priorityLabel: Readonly<Record<string, string>> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "",
};

const dueLabel = (t: TaskCardVM): string => {
  if (t.overdue) return "Overdue";
  if (t.due !== null) return "Today";
  return "";
};

const ring = (percent: number): HTMLElement => {
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - percent / 100);
  const el = h("div", { class: "ring" });
  el.innerHTML =
    `<svg viewBox="0 0 120 120" role="img" aria-label="${percent} percent of today complete">` +
    `<circle class="ring-track" cx="60" cy="60" r="${r}" fill="none" stroke-width="8"/>` +
    `<circle class="ring-value" cx="60" cy="60" r="${r}" fill="none" stroke-width="8" ` +
    `stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" ` +
    `stroke-linecap="round" transform="rotate(-90 60 60)"/>` +
    `</svg><div class="ring-label"><span class="ring-pct">${percent}<i>%</i></span>` +
    `<span class="ring-sub">today</span></div>`;
  return el;
};

const card = (
  title: string,
  body: HTMLElement,
  opts?: { readonly count?: string | undefined; readonly cls?: string | undefined },
): HTMLElement =>
  h(
    "section",
    { class: `card ${opts?.cls ?? ""}`.trim() },
    h(
      "header",
      { class: "card-head" },
      h("h2", null, title),
      opts?.count !== undefined ? h("span", { class: "card-count" }, opts.count) : null,
    ),
    body,
  );

const emptyLine = (text: string): HTMLElement =>
  h("p", { class: "empty-line" }, text);

const taskRow = (t: TaskCardVM): HTMLElement => {
  const meta: HTMLElement[] = [];
  const dl = dueLabel(t);
  if (dl) meta.push(h("span", { class: `pill ${t.overdue ? "pill-warn" : ""}`.trim() }, dl));
  if (t.priority !== "none")
    meta.push(h("span", { class: `pill prio-${t.priority}` }, priorityLabel[t.priority] ?? ""));
  if (t.category) meta.push(h("span", { class: "pill pill-soft" }, t.category));

  return h(
    "div",
    { class: `row ${t.done ? "is-done" : ""}`.trim() },
    h("button", {
      class: "check",
      "data-action": "toggle-task",
      "data-id": t.id,
      "aria-pressed": t.done ? "true" : "false",
      "aria-label": t.done ? `Mark ${t.title} not done` : `Mark ${t.title} done`,
    }),
    h(
      "div",
      { class: "row-main" },
      h("span", { class: "row-title" }, t.title),
      meta.length > 0 ? h("div", { class: "row-meta" }, ...meta) : null,
    ),
  );
};

const habitRow = (hb: HabitRowVM): HTMLElement => {
  const bar = h(
    "div",
    { class: "hbar" },
    h("i", { style: `width:${pct(hb.ratio)}%` }),
  );
  const right = hb.measurable
    ? h(
        "div",
        { class: "habit-measure" },
        h("span", { class: "habit-count mono" }, `${hb.current}/${hb.target ?? 0}`),
        h(
          "button",
          {
            class: "step-btn",
            "data-action": "toggle-habit",
            "data-id": hb.id,
            "aria-label": hb.done ? `Reset ${hb.name}` : `Add one to ${hb.name}`,
          },
          hb.done ? "✓" : "+1",
        ),
      )
    : h("button", {
        class: "check",
        "data-action": "toggle-habit",
        "data-id": hb.id,
        "aria-pressed": hb.done ? "true" : "false",
        "aria-label": hb.done ? `Mark ${hb.name} not done` : `Mark ${hb.name} done`,
      });

  const streak =
    hb.streak > 0
      ? h("span", { class: "streak mono", title: `${hb.streak}-day streak` }, `${hb.streak}🔥`)
      : null;

  return h(
    "div",
    { class: `row habit ${hb.done ? "is-done" : ""}`.trim() },
    hb.measurable ? null : right,
    h(
      "div",
      { class: "row-main" },
      h(
        "div",
        { class: "row-title-line" },
        h("span", { class: "row-title" }, hb.name),
        streak,
      ),
      hb.measurable ? bar : (hb.category ? h("div", { class: "row-meta" }, h("span", { class: "pill pill-soft" }, hb.category)) : null),
    ),
    hb.measurable ? right : null,
  );
};

const routineGroup = (g: RoutineGroupVM): HTMLElement =>
  h(
    "div",
    { class: "routine-group" },
    h("div", { class: "routine-bucket" }, g.bucket),
    ...g.routines.map((r) =>
      h(
        "div",
        { class: "routine" },
        h(
          "div",
          { class: "routine-head" },
          h("span", { class: "routine-name" }, r.name),
          h("span", { class: "routine-frac mono" }, `${r.done}/${r.total}`),
        ),
        h(
          "div",
          { class: "hbar" },
          h("i", { style: `width:${pct(r.ratio)}%` }),
        ),
        h(
          "div",
          { class: "routine-steps" },
          ...r.steps.map((s) =>
            h(
              "button",
              {
                class: `chip ${s.done ? "is-done" : ""}`.trim(),
                "data-action": "toggle-step",
                "data-habit": s.habitId,
                "aria-pressed": s.done ? "true" : "false",
              },
              h("span", { class: "chip-check" }, s.done ? "✓" : ""),
              s.name,
            ),
          ),
        ),
      ),
    ),
  );

const goalRow = (g: GoalVM): HTMLElement =>
  h(
    "button",
    { class: "goal goal-link", "data-action": "open-goal", "data-id": g.id },
    h(
      "div",
      { class: "goal-head" },
      h("span", { class: "goal-horizon" }, g.horizon),
      h("span", { class: "goal-pct mono" }, `${g.percent}%`),
    ),
    h("div", { class: "goal-name" }, g.name),
    h("div", { class: "gbar" }, h("i", { style: `width:${g.percent}%` })),
  );

const emptyDashboard = (): HTMLElement =>
  h(
    "div",
    { class: "empty-hero" },
    h("div", { class: "empty-mark" }, "◍"),
    h("h2", null, "A quiet, clean day"),
    h("p", null, "Add your first task or habit to start tracking today. Everything stays on this device."),
    h(
      "div",
      { class: "empty-actions" },
      h("button", { class: "btn btn-primary", "data-action": "focus-quickadd" }, "Add something"),
      h("button", { class: "btn btn-ghost", "data-action": "seed-example" }, "Load an example day"),
    ),
  );

const hero = (vm: TodayView, clockText: string): HTMLElement => {
  const s = vm.summary;
  return h(
    "section",
    { class: "hero" },
    h(
      "div",
      { class: "hero-left" },
      h("div", { class: "greeting" }, vm.greeting),
      h("h1", { class: "date" }, formatDate(vm.date)),
      h("div", { class: "clock mono", id: "clock" }, clockText),
    ),
    h(
      "div",
      { class: "hero-right" },
      ring(pct(s.overall)),
      h(
        "div",
        { class: "hero-stats" },
        h("div", { class: "stat" }, h("span", { class: "stat-num mono" }, `${s.habits.done}/${s.habits.due}`), h("span", { class: "stat-lbl" }, "habits")),
        h("div", { class: "stat" }, h("span", { class: "stat-num mono" }, `${s.tasks.done}/${s.tasks.due}`), h("span", { class: "stat-lbl" }, "tasks")),
      ),
    ),
  );
};

const formatDate = (date: string): string => {
  const parts = date.split("-").map((n) => Number(n));
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const dt = new Date(Date.UTC(y, m - 1, d));
  const weekday = dt.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const month = dt.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  return `${weekday}, ${month} ${d}`;
};

const statChip = (
  label: string,
  value: string,
  route: string,
  frac: number | null,
): HTMLElement =>
  h(
    "button",
    { class: "mod-chip", "data-action": "nav", "data-route": route },
    h("span", { class: "mod-chip-label" }, label),
    h("span", { class: "mod-chip-value" }, value),
    frac === null
      ? null
      : h(
          "span",
          { class: "mod-bar" },
          h("span", {
            class: "mod-bar-fill",
            style: `width:${pct(frac)}%`,
          }),
        ),
  );

const moduleStatusCard = (m: ModuleStatus): HTMLElement => {
  const cals = m.nutrition.calories;
  const prot = m.nutrition.protein;
  const water = m.nutrition.water;
  const body = h(
    "div",
    { class: "mod-chips" },
    statChip(
      "Workout",
      m.workout.loggedToday
        ? "Logged ✓"
        : m.workout.sessionsThisWeek > 0
          ? `${m.workout.sessionsThisWeek} this week`
          : "Not yet",
      "fitness",
      m.workout.loggedToday ? 1 : 0,
    ),
    statChip(
      "Calories",
      `${Math.round(cals.current)} / ${cals.target}`,
      "diet",
      cals.ratio,
    ),
    statChip(
      "Protein",
      `${Math.round(prot.current)} / ${prot.target} g`,
      "diet",
      prot.ratio,
    ),
    statChip(
      "Water",
      `${(water.current / 1000).toFixed(1)} / ${(water.target / 1000).toFixed(1)} L`,
      "diet",
      water.ratio,
    ),
    statChip(
      "Sleep",
      m.sleep.logged ? formatDuration(m.sleep.durationMinutes) : "Not logged",
      "sleep",
      m.sleep.logged ? m.sleep.ratio : 0,
    ),
    statChip(
      "Reading",
      m.reading.currentlyReading > 0
        ? `${m.reading.currentlyReading} in progress`
        : "Nothing current",
      "reading",
      null,
    ),
  );
  return card("Across your day", body, { cls: "card-modules" });
};

export const renderDashboard = (vm: TodayView, clockText: string): HTMLElement => {
  const frag = h("div", { class: "dash" });
  frag.appendChild(hero(vm, clockText));

  if (vm.isEmpty) {
    frag.appendChild(emptyDashboard());
    return frag;
  }

  const grid = h("div", { class: "grid" });

  grid.appendChild(moduleStatusCard(vm.modules));

  grid.appendChild(
    card(
      "Priorities",
      vm.priorities.length > 0
        ? h("div", { class: "rows" }, ...vm.priorities.map(taskRow))
        : emptyLine("No priorities flagged. High and urgent tasks show up here."),
      { cls: "card-priorities" },
    ),
  );

  grid.appendChild(
    card(
      "Today's tasks",
      vm.tasks.length > 0
        ? h("div", { class: "rows" }, ...vm.tasks.map(taskRow))
        : emptyLine("Nothing due today. Enjoy the space, or add a task above."),
      { count: vm.tasks.length > 0 ? String(vm.tasks.length) : undefined },
    ),
  );

  grid.appendChild(
    card(
      "Habits",
      vm.habits.length > 0
        ? h("div", { class: "rows" }, ...vm.habits.map(habitRow))
        : emptyLine("No habits scheduled for today."),
      { count: vm.habits.length > 0 ? `${vm.summary.habits.done}/${vm.summary.habits.due}` : undefined },
    ),
  );

  grid.appendChild(
    card(
      "Routines",
      vm.routineGroups.length > 0
        ? h("div", { class: "routines" }, ...vm.routineGroups.map(routineGroup))
        : emptyLine("No routines yet. Group habits into a Morning, Day, or Night flow."),
    ),
  );

  grid.appendChild(
    card(
      "Goals",
      vm.goals.length > 0
        ? h("div", { class: "goals" }, ...vm.goals.map(goalRow))
        : emptyLine("No goals yet. Set a direction and watch progress add up."),
    ),
  );

  frag.appendChild(grid);
  return frag;
};
