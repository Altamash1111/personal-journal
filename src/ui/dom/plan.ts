/**
 * DOM renderers for the Phase 4 plan/reflect pages. Same conventions as the
 * module pages: project a view model into elements, tag interactive nodes with
 * data-action / data-field / data-* hooks, no logic. Shared primitives come from
 * ./ui so forms and cards are consistent across the whole app.
 */
import { h } from "./h";
import {
  card,
  emptyLine,
  pageHead,
  bar,
  stat,
  field,
  textareaField,
  selectField,
  form,
  titleCase,
  pct,
} from "./ui";
import {
  GOAL_HORIZONS,
  GOAL_STATUSES,
  PROJECT_STATUSES,
} from "../model/plan";
import type {
  GoalsView,
  TasksView,
  TaskBucket,
  ProjectsView,
  JournalView,
  SettingsView,
} from "../model/plan";

const horizonOptions = GOAL_HORIZONS.map((x) => ({ value: x, label: titleCase(x) }));
const statusOptions = GOAL_STATUSES.map((x) => ({ value: x, label: titleCase(x) }));
const projectStatusOptions = PROJECT_STATUSES.map((x) => ({ value: x, label: titleCase(x) }));
const priorityOptions = ["none", "low", "medium", "high", "urgent"].map((x) => ({
  value: x,
  label: titleCase(x),
}));

// ============================ Goals ============================

export const renderGoals = (
  v: GoalsView,
  expanded: ReadonlySet<string>,
): HTMLElement => {
  const root = h("div", { class: "dash module" });
  root.appendChild(pageHead("Goals", "Vision → year → quarter → month → week, with milestones."));
  const grid = h("div", { class: "grid" });

  const goalCard = (g: GoalsView["goals"][number]): HTMLElement => {
    const isOpen = expanded.has(g.id);
    const doneCount = g.milestones.filter((m) => m.done).length;
    const total = g.milestones.length;
    const nextMilestone = g.milestones.find((m) => !m.done) ?? null;

    // Compact summary — always visible, and the whole header toggles open/closed.
    const summary = h(
      "button",
      {
        class: "goal-summary",
        "data-action": "toggle-goal",
        "data-id": g.id,
        "aria-expanded": isOpen ? "true" : "false",
      },
      h(
        "div",
        { class: "goal-summary-top" },
        h("span", { class: "chevron" }, isOpen ? "▾" : "▸"),
        h("span", { class: "pill" }, g.horizon),
        h("span", { class: "goal-title" }, g.name),
        g.status !== "active" ? h("span", { class: `pill status-${g.status}` }, titleCase(g.status)) : null,
        h("span", { class: "goal-summary-pct mono" }, `${pct(g.progress)}%`),
      ),
      bar(g.progress),
      h(
        "div",
        { class: "goal-summary-meta" },
        g.metricLabel !== null ? h("span", { class: "mono" }, g.metricLabel) : null,
        total > 0 ? h("span", { class: "mono muted-inline" }, `${doneCount} / ${total} milestones`) : null,
        nextMilestone !== null ? h("span", { class: "next-ms" }, `Next: ${nextMilestone.title}`) : null,
      ),
    );

    if (!isOpen) {
      return h("div", { class: "goal-node", "data-goal-card": g.id }, summary);
    }

    // --- Expanded: milestones front-and-centre, then light inline controls ---
    const milestoneSection = h(
      "div",
      { class: "goal-section" },
      h(
        "div",
        { class: "goal-section-head" },
        h("span", { class: "goal-section-title" }, "Milestones"),
        total > 0 ? h("span", { class: "mono muted-inline" }, `${doneCount} / ${total}`) : null,
      ),
      total > 0
        ? h(
            "div",
            { class: "milestones" },
            ...g.milestones.map((m) =>
              h(
                "div",
                { class: `ms-row ${!m.done && m.id === nextMilestone?.id ? "is-next" : ""}`.trim() },
                h("button", {
                  class: "check",
                  "data-action": "toggle-milestone",
                  "data-id": g.id,
                  "data-ms": m.id,
                  "aria-pressed": m.done ? "true" : "false",
                  title: m.done ? "Mark not done" : "Mark done",
                }),
                h("span", { class: `ms-title ${m.done ? "is-done" : ""}`.trim() }, m.title),
                h("button", { class: "icon-btn", "data-action": "delete-milestone", "data-id": g.id, "data-ms": m.id, title: "Remove milestone" }, "✕"),
              ),
            ),
          )
        : emptyLine("No milestones yet — break this goal into concrete steps."),
      form("add-milestone", [field("Add a milestone", "title", { placeholder: "A concrete step…" })], "Add", { "data-id": g.id }),
    );

    const progressSection = g.hasMetric
      ? h(
          "div",
          { class: "goal-section" },
          h("div", { class: "goal-section-head" }, h("span", { class: "goal-section-title" }, "Progress")),
          // Pre-filled with the real current value so clicking Save always applies
          // the shown number (fixes the empty-placeholder silent no-op).
          form(
            "goal-metric",
            [field("Current value", "current", { type: "number", value: String(g.metricCurrent ?? 0) })],
            "Save progress",
            { "data-id": g.id },
          ),
        )
      : null;

    // Status as one-click pills (no separate form / Save step).
    const statusSection = h(
      "div",
      { class: "goal-section" },
      h("div", { class: "goal-section-head" }, h("span", { class: "goal-section-title" }, "Status")),
      h(
        "div",
        { class: "status-pills" },
        ...statusOptions.map((o) =>
          h(
            "button",
            {
              class: `status-pill ${o.value === g.status ? "is-active" : ""}`.trim(),
              "data-action": "set-goal-status",
              "data-id": g.id,
              "data-status": o.value,
            },
            o.label,
          ),
        ),
      ),
    );

    const details = h(
      "div",
      { class: "goal-details" },
      milestoneSection,
      progressSection,
      statusSection,
      h("div", { class: "goal-danger" },
        h("button", { class: "icon-btn danger-link", "data-action": "delete-goal", "data-id": g.id }, "Delete goal"),
      ),
    );

    return h("div", { class: "goal-node is-open", "data-goal-card": g.id }, summary, details);
  };

  grid.appendChild(
    card(
      "Your goals",
      v.goals.length > 0
        ? h("div", { class: "rows goal-tree" }, ...v.goals.map(goalCard))
        : emptyLine("No goals yet. Add a vision or a yearly goal to steer everything else."),
      { count: v.goals.length > 0 ? String(v.goals.length) : undefined, cls: "card-wide" },
    ),
  );

  const parentOpts = [{ value: "", label: "— none (top level) —" }, ...v.parentOptions.map((p) => ({ value: p.id, label: p.name }))];
  grid.appendChild(
    card(
      "Add a goal",
      form(
        "add-goal",
        [
          field("Name", "name", { placeholder: "Read 24 books" }),
          selectField("Horizon", "horizon", horizonOptions, "year"),
          selectField("Parent", "parentId", parentOpts),
          field("Metric target", "target", { type: "number", min: "0", placeholder: "24 (optional)" }),
          field("Unit", "unit", { placeholder: "books (optional)" }),
        ],
        "Create goal",
      ),
      { cls: "card-wide" },
    ),
  );

  root.appendChild(grid);
  return root;
};

// ============================ Tasks ============================

export const renderTasks = (v: TasksView, active: TaskBucket): HTMLElement => {
  const root = h("div", { class: "dash module" });
  root.appendChild(pageHead("Tasks", "Everything on your plate — filter, prioritise, break down."));

  const tabs: readonly { readonly key: TaskBucket; readonly label: string }[] = [
    { key: "today", label: "Today" },
    { key: "upcoming", label: "Upcoming" },
    { key: "overdue", label: "Overdue" },
    { key: "noDate", label: "No date" },
    { key: "completed", label: "Done" },
  ];
  const tabRow = h(
    "div",
    { class: "tabs" },
    ...tabs.map((t) =>
      h(
        "button",
        {
          class: `tab ${t.key === active ? "is-active" : ""}`.trim(),
          "data-action": "task-filter",
          "data-filter": t.key,
        },
        `${t.label} ${v.counts[t.key] > 0 ? `(${v.counts[t.key]})` : ""}`.trim(),
      ),
    ),
  );

  const goalOpts = [{ value: "", label: "— no goal —" }, ...v.goalOptions.map((g) => ({ value: g.id, label: g.name }))];
  const projOpts = [{ value: "", label: "— no project —" }, ...v.projectOptions.map((p) => ({ value: p.id, label: p.name }))];

  const taskRow = (t: TasksView["buckets"][TaskBucket][number]): HTMLElement =>
    h(
      "div",
      { class: "task-block" },
      h(
        "div",
        { class: "task-line" },
        h("button", {
          class: "check",
          "data-action": "toggle-task",
          "data-id": t.id,
          "aria-pressed": t.completed ? "true" : "false",
        }),
        h("span", { class: `row-title ${t.completed ? "is-done" : ""}`.trim() }, t.title),
        t.priority !== "none" ? h("span", { class: `pill pill-${t.priority}` }, titleCase(t.priority)) : null,
        t.overdue ? h("span", { class: "pill pill-urgent" }, "Overdue") : null,
        t.due !== null ? h("span", { class: "row-meta mono" }, t.due) : null,
        t.recurring ? h("span", { class: "pill" }, "↻") : null,
        t.goalName !== null ? h("span", { class: "pill" }, "◎ " + t.goalName) : null,
        t.projectName !== null ? h("span", { class: "pill" }, "▤ " + t.projectName) : null,
        h("span", { class: "task-actions" },
          h("button", { class: "btn btn-ghost btn-sm", "data-action": "delete-task", "data-id": t.id }, "✕"),
        ),
      ),
      t.subtasks.length > 0
        ? h(
            "div",
            { class: "subtasks" },
            ...t.subtasks.map((s) =>
              h(
                "div",
                { class: "ms-row" },
                h("button", {
                  class: "check check-sm",
                  "data-action": "toggle-subtask",
                  "data-id": t.id,
                  "data-sub": s.id,
                  "aria-pressed": s.done ? "true" : "false",
                }),
                h("span", { class: `ms-title ${s.done ? "is-done" : ""}`.trim() }, s.title),
                h("button", { class: "btn btn-ghost btn-sm", "data-action": "delete-subtask", "data-id": t.id, "data-sub": s.id }, "✕"),
              ),
            ),
          )
        : null,
      h(
        "div",
        { class: "task-controls" },
        form("add-subtask", [field("Subtask", "title", { placeholder: "Break it down…" })], "Add", { "data-id": t.id }),
        form("task-priority", [selectField("Priority", "priority", priorityOptions, t.priority)], "Set", { "data-id": t.id }),
        form("task-due", [field("Due", "due", { type: "date" })], "Set due", { "data-id": t.id }),
        form("task-goal", [selectField("Goal", "goalId", goalOpts, "")], "Link", { "data-id": t.id }),
        form("task-project", [selectField("Project", "projectId", projOpts, "")], "Link", { "data-id": t.id }),
      ),
    );

  const rows = v.buckets[active];
  const grid = h("div", { class: "grid" });
  const tasksBody = h(
    "div",
    {},
    tabRow,
    rows.length > 0
      ? h("div", { class: "rows" }, ...rows.map(taskRow))
      : emptyLine(`Nothing in "${active}".`),
  );
  grid.appendChild(card("Tasks", tasksBody, { cls: "card-wide" }));

  // add-task form
  const addCard = card(
    "Add a task",
    form(
      "add-task-full",
      [
        field("Title", "title", { placeholder: "What needs doing?" }),
        selectField("Priority", "priority", priorityOptions, "none"),
        field("Due", "due", { type: "date" }),
        selectField("Goal", "goalId", goalOpts, ""),
        selectField("Project", "projectId", projOpts, ""),
      ],
      "Add task",
    ),
    { cls: "card-wide" },
  );
  grid.appendChild(addCard);
  root.appendChild(grid);
  return root;
};

// ============================ Projects ============================

export const renderProjects = (v: ProjectsView): HTMLElement => {
  const root = h("div", { class: "dash module" });
  root.appendChild(pageHead("Projects", "Group related tasks and track their progress."));
  const grid = h("div", { class: "grid" });

  const projCard = (p: ProjectsView["projects"][number]): HTMLElement =>
    h(
      "div",
      { class: "project-block" },
      h(
        "div",
        { class: "session-head" },
        h("span", { class: "row-title" }, p.name),
        h("span", { class: "pill" }, titleCase(p.status)),
        h("span", { class: "row-meta mono" }, `${p.doneCount}/${p.taskCount} done`),
        h("span", { class: "session-actions" },
          h("button", { class: "btn btn-ghost btn-sm", "data-action": "delete-project", "data-id": p.id }, "✕"),
        ),
      ),
      p.description !== null ? h("p", { class: "muted" }, p.description) : null,
      p.taskCount > 0 ? bar(p.taskCount === 0 ? 0 : p.doneCount / p.taskCount) : null,
      p.tasks.length > 0
        ? h(
            "div",
            { class: "rows" },
            ...p.tasks.map((t) =>
              h(
                "div",
                { class: "row" },
                h("button", { class: "check check-sm", "data-action": "toggle-task", "data-id": t.id, "aria-pressed": t.done ? "true" : "false" }),
                h("span", { class: `row-title ${t.done ? "is-done" : ""}`.trim() }, t.title),
                t.priority !== "none" ? h("span", { class: `pill pill-${t.priority}` }, titleCase(t.priority)) : null,
              ),
            ),
          )
        : emptyLine("No tasks linked yet — link tasks from the Tasks page."),
      form("project-status", [selectField("Status", "status", projectStatusOptions, p.status)], "Set status", { "data-id": p.id }),
    );

  grid.appendChild(
    card(
      "Your projects",
      v.projects.length > 0
        ? h("div", { class: "rows" }, ...v.projects.map(projCard))
        : emptyLine("No projects yet."),
      { count: v.projects.length > 0 ? String(v.projects.length) : undefined, cls: "card-wide" },
    ),
  );

  grid.appendChild(
    card(
      "Add a project",
      form(
        "add-project",
        [
          field("Name", "name", { placeholder: "Website redesign" }),
          field("Description", "description", { placeholder: "Optional" }),
          selectField("Status", "status", projectStatusOptions, "active"),
        ],
        "Create project",
      ),
    ),
  );

  root.appendChild(grid);
  return root;
};

// ============================ Journal ============================

export const renderJournal = (v: JournalView): HTMLElement => {
  const root = h("div", { class: "dash module" });
  root.appendChild(pageHead("Daily review", "A short end-of-day reflection — one entry per day."));
  const grid = h("div", { class: "grid" });

  const e = v.todayEntry;
  const ratingOptions = [
    { value: "", label: "—" },
    ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) })),
  ];
  grid.appendChild(
    card(
      `Today — ${v.today}`,
      form(
        "save-journal",
        [
          textareaField("What went well", "accomplished", e?.accomplished ?? null, "Wins, progress, gratitude…"),
          textareaField("What didn't", "wentWrong", e?.wentWrong ?? null, "Friction, mistakes, blockers…"),
          textareaField("What I learned", "learned", e?.learned ?? null, "An insight to keep…"),
          textareaField("Top priority tomorrow", "topPriorityTomorrow", e?.topPriorityTomorrow ?? null, "The one thing…"),
          selectField("Day rating", "rating", ratingOptions, e?.rating != null ? String(e.rating) : ""),
        ],
        e ? "Update review" : "Save review",
      ),
      { cls: "card-wide" },
    ),
  );

  const dayCard = (d: JournalView["history"][number]): HTMLElement =>
    h(
      "div",
      { class: "journal-day" },
      h(
        "div",
        { class: "session-head" },
        h("span", { class: "row-title mono" }, d.date),
        d.rating !== null ? h("span", { class: "pill" }, `★ ${d.rating}/5`) : null,
        h("span", { class: "session-actions" },
          h("button", { class: "btn btn-ghost btn-sm", "data-action": "delete-journal", "data-id": d.id }, "✕"),
        ),
      ),
      d.accomplished ? h("p", { class: "jr-line" }, h("b", null, "Well: "), d.accomplished) : null,
      d.wentWrong ? h("p", { class: "jr-line" }, h("b", null, "Not: "), d.wentWrong) : null,
      d.learned ? h("p", { class: "jr-line" }, h("b", null, "Learned: "), d.learned) : null,
      d.topPriorityTomorrow ? h("p", { class: "jr-line" }, h("b", null, "Next: "), d.topPriorityTomorrow) : null,
    );

  grid.appendChild(
    card(
      "Past reviews",
      v.history.length > 0
        ? h("div", { class: "rows" }, ...v.history.map(dayCard))
        : emptyLine("Your past daily reviews will appear here."),
      { count: v.history.length > 0 ? String(v.history.length) : undefined, cls: "card-wide" },
    ),
  );

  root.appendChild(grid);
  return root;
};

// ============================ Settings & Data ============================

export const renderSettings = (v: SettingsView): HTMLElement => {
  const root = h("div", { class: "dash module" });
  root.appendChild(pageHead("Settings & data", "Preferences, targets, and local-first backup."));
  const grid = h("div", { class: "grid" });

  const weekdayOptions = [
    { value: "0", label: "Sunday" },
    { value: "1", label: "Monday" },
    { value: "6", label: "Saturday" },
  ];

  grid.appendChild(
    card(
      "Preferences",
      h(
        "div",
        {},
        form("set-timezone", [field("Time zone (IANA)", "timeZone", { value: v.timeZone, placeholder: "Asia/Kolkata" })], "Save time zone"),
        form("set-weekstart", [selectField("Week starts on", "weekStartsOn", weekdayOptions, String(v.weekStartsOn))], "Save"),
      ),
    ),
  );

  grid.appendChild(
    card(
      "Targets",
      h(
        "div",
        {},
        form(
          "set-nutrition-targets",
          [
            field("Calories", "calories", { type: "number", min: "0", value: String(v.nutrition.calories) }),
            field("Protein (g)", "proteinGrams", { type: "number", min: "0", value: String(v.nutrition.proteinGrams) }),
            field("Water (ml)", "waterMl", { type: "number", min: "0", value: String(v.nutrition.waterMl) }),
          ],
          "Save nutrition",
        ),
        form("set-sleep-target", [field("Sleep target (hours)", "hours", { type: "number", step: "0.5", min: "0", value: String(v.sleepTargetMinutes / 60) })], "Save sleep"),
      ),
    ),
  );

  grid.appendChild(
    card(
      "Your data",
      h(
        "div",
        {},
        h("div", { class: "stat-row tight" }, ...v.counts.map((c) => stat(c.label, String(c.count)))),
        h(
          "div",
          { class: "btn-row", style: "margin-top:16px" },
          h("button", { class: "btn btn-primary", "data-action": "export-data" }, "Export JSON"),
          h("button", { class: "btn btn-ghost", "data-action": "reset-data" }, "Clear all data"),
        ),
        h("p", { class: "muted" }, "Export downloads a full backup. Import replaces current data from a backup file's contents."),
        h(
          "div",
          { class: "form", "data-form": "import-data" },
          h("div", { class: "form-row" },
            h("label", { class: "fld fld-wide" },
              h("span", { class: "fld-label" }, "Paste backup JSON"),
              h("textarea", { class: "fld-input", "data-field": "raw", rows: "4", placeholder: '{ "schemaVersion": 2, ... }' }),
            ),
          ),
          h("div", { class: "form-actions" },
            h("button", { class: "btn btn-primary", "data-action": "form-submit" }, "Import & replace"),
          ),
          h("p", { class: "muted", "data-role": "import-status" }, ""),
        ),
      ),
      { cls: "card-wide" },
    ),
  );

  root.appendChild(grid);
  return root;
};
