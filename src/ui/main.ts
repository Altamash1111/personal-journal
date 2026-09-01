/**
 * Browser entry point. Builds the persistent app shell (sidebar nav + topbar with
 * Quick Add), routes between the Today dashboard and the five Phase 3 module
 * pages, wires all interaction via a single delegated click handler (plus a
 * generic form-submit convention for module forms), keeps a live clock, and
 * connects to the Phase 1 Store through the AppController. Only the content
 * region re-renders on state change; the shell persists.
 */
import { APP_CONFIG } from "../config";
import { systemClock } from "../core/clock";
import { uuidFactory } from "../core/id";
import { Store } from "../persistence/store";
import { LocalStorageAdapter } from "../persistence/adapter";
import { AppController } from "./app/controller";
import { renderDashboard } from "./dom/render";
import {
  renderFitness,
  renderDiet,
  renderSleep,
  renderRoutines,
  renderReading,
} from "./dom/modules";
import {
  renderGoals,
  renderTasks,
  renderProjects,
  renderJournal,
  renderSettings,
} from "./dom/plan";
import { renderInsights } from "./dom/insights";
import { renderMonthly } from "./dom/monthly";
import type { TaskBucket } from "./model/plan";
import { h, mount } from "./dom/h";
import { parseQuickAdd } from "./model/quickAdd";
import type { QuickAddKind } from "./model/quickAdd";
import type {
  TaskId,
  HabitId,
  RoutineId,
  ExerciseId,
  WorkoutSessionId,
  SessionExerciseId,
  SetEntryId,
  MealId,
  ReadingItemId,
  GoalId,
  MilestoneId,
  SubtaskId,
  ProjectId,
  JournalEntryId,
} from "../domain/ids";
import type { LoadUnit } from "../domain/fitness";
import type { MealType } from "../domain/diet";
import type { ReadingKind, ReadingStatus, ProgressUnit } from "../domain/reading";
import type { Daypart } from "../domain/common";
import type { TaskPriority } from "../domain/task";
import type { GoalStatus } from "../domain/goal";
import type { ProjectStatus } from "../domain/project";
import type { LocalDate, Weekday } from "../time/localDate";
import {
  resolveTheme,
  nextTheme,
  isThemeChoice,
  themeLabel,
} from "./model/theme";
import type { ThemeChoice } from "./model/theme";

const THEME_KEY = "plo.theme";

type Route =
  | "today"
  | "fitness"
  | "diet"
  | "sleep"
  | "routines"
  | "reading"
  | "goals"
  | "tasks"
  | "projects"
  | "journal"
  | "insights"
  | "monthly"
  | "settings";
const ROUTES: readonly Route[] = [
  "today",
  "fitness",
  "diet",
  "sleep",
  "routines",
  "reading",
  "goals",
  "tasks",
  "projects",
  "journal",
  "insights",
  "monthly",
  "settings",
];
const isRoute = (s: string | null): s is Route =>
  s !== null && (ROUTES as readonly string[]).includes(s);

const formatClock = (now: Date, timeZone: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);

const systemPrefersDark = (): boolean =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

const loadThemeChoice = (): ThemeChoice => {
  const raw = localStorage.getItem(THEME_KEY);
  return isThemeChoice(raw) ? raw : "dark";
};

interface NavGroup {
  readonly heading: string | null;
  readonly items: readonly { readonly route: Route; readonly label: string }[];
}
const navGroups: readonly NavGroup[] = [
  {
    heading: "Plan",
    items: [
      { route: "today", label: "Today" },
      { route: "goals", label: "Goals" },
      { route: "tasks", label: "Tasks" },
      { route: "projects", label: "Projects" },
    ],
  },
  {
    heading: "Review",
    items: [
      { route: "journal", label: "Daily review" },
      { route: "insights", label: "Weekly review" },
      { route: "monthly", label: "Monthly review" },
    ],
  },
  {
    heading: "Track",
    items: [
      { route: "fitness", label: "Fitness" },
      { route: "diet", label: "Diet" },
      { route: "sleep", label: "Sleep" },
      { route: "routines", label: "Routines" },
      { route: "reading", label: "Reading" },
    ],
  },
  {
    heading: null,
    items: [{ route: "settings", label: "Settings & data" }],
  },
];

/** Read all data-field inputs/selects within a form container. */
const readFields = (formEl: Element): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const el of formEl.querySelectorAll<HTMLElement>("[data-field]")) {
    const key = el.getAttribute("data-field");
    if (key === null) continue;
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLSelectElement ||
      el instanceof HTMLTextAreaElement
    ) {
      out[key] = el.value;
    }
  }
  return out;
};

const numOrNull = (s: string | undefined): number | null => {
  if (s === undefined || s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const strOrNull = (s: string | undefined): string | null => {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
};

/** Trigger a client-side download of the given JSON string (offline backup). */
const downloadJson = (json: string): void => {
  const blob = new Blob([json], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = "personal-life-os-backup.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
};

const start = (): void => {
  const root = document.getElementById("app");
  if (root === null) return;
  // The shell layout CSS is keyed on `.app` (grid columns, and the
  // `.app.sidebar-open` mobile drawer). The host element only carries id="app",
  // so add the class here or none of those rules match and the sidebar renders
  // full-width, stacked over the content.
  root.classList.add("app");

  const controller = new AppController({
    store: new Store(new LocalStorageAdapter(APP_CONFIG.storageKey), {
      clock: systemClock,
    }),
    ops: { ids: uuidFactory, clock: systemClock },
  });

  let themeChoice = loadThemeChoice();
  let quickKind: QuickAddKind = "task";
  let route: Route = "today";
  let taskFilter: TaskBucket = "today";
  const expandedGoals = new Set<string>();
  let flashGoalId: string | null = null;
  let scrollGoalId: string | null = null;
  let resetArmed = false;
  let insightsOffset = 0; // 0 = this week, -1 = last week, etc.
  let monthlyOffset = 0; // 0 = this month, -1 = last month, etc.

  const applyTheme = (): void => {
    const effective = resolveTheme(themeChoice, systemPrefersDark());
    document.documentElement.setAttribute("data-theme", effective);
    const btn = root.querySelector<HTMLElement>("[data-role=theme-label]");
    if (btn) btn.textContent = themeLabel(themeChoice);
  };

  // ---- Shell (built once) ----
  const brand = h(
    "div",
    { class: "brand" },
    h("span", { class: "brand-dot" }),
    h("span", { class: "brand-name" }, "Life OS"),
  );

  const nav = h(
    "nav",
    { class: "nav" },
    ...navGroups.map((group) =>
      h(
        "div",
        { class: "nav-group" },
        group.heading !== null ? h("div", { class: "nav-heading" }, group.heading) : null,
        ...group.items.map((item) =>
          h(
            "a",
            {
              class: `nav-item ${item.route === route ? "is-active" : ""}`.trim(),
              "data-action": "nav",
              "data-route": item.route,
              ...(item.route === route ? { "aria-current": "page" } : {}),
            },
            h("span", { class: "nav-label" }, item.label),
          ),
        ),
      ),
    ),
  );

  const themeBtn = h(
    "button",
    { class: "theme-btn", "data-action": "cycle-theme", title: "Change theme" },
    h("span", { class: "theme-glyph" }, "◐"),
    h("span", { "data-role": "theme-label" }, themeLabel(themeChoice)),
  );

  const sidebar = h(
    "aside",
    { class: "sidebar" },
    brand,
    nav,
    h("div", { class: "sidebar-foot" }, themeBtn),
  );

  const kindBtn = (kind: QuickAddKind, label: string): HTMLElement =>
    h(
      "button",
      {
        class: `seg ${quickKind === kind ? "is-active" : ""}`.trim(),
        "data-action": "qa-kind",
        "data-kind": kind,
        "aria-pressed": quickKind === kind ? "true" : "false",
      },
      label,
    );

  const segmented = h("div", { class: "segmented" }, kindBtn("task", "Task"), kindBtn("habit", "Habit"));

  const qaInput = h("input", {
    class: "qa-input",
    id: "qa-input",
    type: "text",
    placeholder: "Add a task…  (tip: ! high, !! urgent)",
    autocomplete: "off",
    "aria-label": "Quick add",
  }) as HTMLInputElement;

  const qaAdd = h("button", { class: "btn btn-primary qa-add", "data-action": "qa-submit" }, "Add");

  const quickAdd = h("div", { class: "quickadd" }, segmented, qaInput, qaAdd);

  const menuBtn = h(
    "button",
    { class: "menu-btn", "data-action": "toggle-sidebar", "aria-label": "Menu" },
    "☰",
  );

  const topbar = h("header", { class: "topbar" }, menuBtn, quickAdd);
  const contentHost = h("main", { class: "content" });
  const mainCol = h("div", { class: "maincol" }, topbar, contentHost);
  const scrim = h("div", { class: "scrim", "data-action": "toggle-sidebar" });

  mount(root, sidebar, mainCol, scrim);
  applyTheme();

  const refreshNav = (): void => {
    for (const a of nav.querySelectorAll<HTMLElement>(".nav-item")) {
      const active = a.getAttribute("data-route") === route;
      a.classList.toggle("is-active", active);
      if (active) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
  };

  const refreshSegmented = (): void => {
    for (const btn of segmented.querySelectorAll<HTMLElement>(".seg")) {
      const active = btn.getAttribute("data-kind") === quickKind;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    }
    qaInput.placeholder =
      quickKind === "task"
        ? "Add a task…  (tip: ! high, !! urgent)"
        : "Add a daily habit…";
  };

  const renderRoute = (): HTMLElement => {
    switch (route) {
      case "fitness":
        return renderFitness(controller.fitnessView());
      case "diet":
        return renderDiet(controller.dietView());
      case "sleep":
        return renderSleep(controller.sleepView());
      case "routines":
        return renderRoutines(controller.routinesView());
      case "reading":
        return renderReading(controller.readingView());
      case "goals":
        return renderGoals(controller.goalsView(), expandedGoals);
      case "tasks":
        return renderTasks(controller.tasksView(), taskFilter);
      case "projects":
        return renderProjects(controller.projectsView());
      case "journal":
        return renderJournal(controller.journalView());
      case "insights":
        return renderInsights(controller.insightsView(insightsOffset));
      case "monthly":
        return renderMonthly(controller.monthlyView(monthlyOffset));
      case "settings":
        return renderSettings(controller.settingsView(), resetArmed);
      case "today":
      default:
        return renderDashboard(
          controller.view(),
          formatClock(systemClock.now(), controller.timeZone()),
        );
    }
  };

  const rerender = (): void => {
    mount(contentHost, renderRoute());
    // Post-render goal affordances: scroll a freshly-opened goal into view, and
    // briefly flash a goal that was just edited so the save is unmistakable.
    if (scrollGoalId !== null) {
      const el = contentHost.querySelector(`[data-goal-card="${scrollGoalId}"]`);
      if (el instanceof HTMLElement) el.scrollIntoView({ behavior: "smooth", block: "center" });
      scrollGoalId = null;
    }
    if (flashGoalId !== null) {
      const el = contentHost.querySelector(`[data-goal-card="${flashGoalId}"]`);
      if (el instanceof HTMLElement) {
        el.classList.add("just-saved");
        window.setTimeout(() => el.classList.remove("just-saved"), 900);
      }
      flashGoalId = null;
    }
  };

  const submitQuickAdd = (): void => {
    const intent = parseQuickAdd(quickKind, qaInput.value, controller.today());
    if (intent === null) return;
    qaInput.value = "";
    if (intent.kind === "task") void controller.addTask(intent.input);
    else void controller.addHabit(intent.input);
  };

  // ---- Module form dispatch ----
  const handleForm = (name: string, f: Record<string, string>, formEl: Element): void => {
    const idAttr = (k: string): string => formEl.getAttribute(k) ?? "";
    switch (name) {
      // Fitness
      case "log-bodyweight": {
        const w = numOrNull(f["weight"]);
        // Guard against nonsensical values corrupting the trend/goal analytics.
        if (w !== null && w > 0) void controller.logBodyWeight(w, (f["unit"] as LoadUnit) || "kg");
        break;
      }
      case "log-measurement": {
        const site = strOrNull(f["site"]);
        const value = numOrNull(f["value"]);
        if (site !== null && value !== null && value > 0) void controller.logMeasurement(site, value, (f["unit"] ?? "cm") || "cm");
        break;
      }
      case "add-exercise": {
        const nm = strOrNull(f["name"]);
        if (nm !== null)
          void controller.addExercise({
            name: nm,
            kind: (f["kind"] as "strength" | "cardio" | "mobility" | "other") || "strength",
            loadUnit: f["loadUnit"] === "bodyweight" ? null : ((f["loadUnit"] as LoadUnit) || "kg"),
          });
        break;
      }
      case "start-workout":
        void controller.startWorkout({ date: controller.today(), name: strOrNull(f["name"]) });
        break;
      case "add-session-exercise": {
        const ex = strOrNull(f["exerciseId"]);
        if (ex !== null)
          void controller.addExerciseToSession(idAttr("data-session") as WorkoutSessionId, ex as ExerciseId);
        break;
      }
      case "add-set":
        void controller.addSetToSession(
          idAttr("data-session") as WorkoutSessionId,
          idAttr("data-se") as SessionExerciseId,
          numOrNull(f["reps"]),
          numOrNull(f["weight"]),
        );
        break;
      // Diet
      case "log-meal": {
        const nm = strOrNull(f["name"]);
        if (nm !== null)
          void controller.logMeal({
            type: (f["type"] as MealType) || "snack",
            name: nm,
            macros: {
              kcal: numOrNull(f["kcal"]) ?? 0,
              protein: numOrNull(f["protein"]) ?? 0,
              carbs: numOrNull(f["carbs"]) ?? 0,
              fat: numOrNull(f["fat"]) ?? 0,
            },
          });
        break;
      }
      case "set-nutrition-targets":
        void controller.setNutritionTargets({
          calories: numOrNull(f["calories"]) ?? 2200,
          proteinGrams: numOrNull(f["proteinGrams"]) ?? 130,
          waterMl: numOrNull(f["waterMl"]) ?? 3000,
        });
        break;
      // Sleep
      case "log-sleep": {
        const hours = numOrNull(f["hours"]) ?? 0;
        const minutes = numOrNull(f["minutes"]) ?? 0;
        let duration = hours * 60 + minutes;
        const bedtime = strOrNull(f["bedtime"]);
        const wakeTime = strOrNull(f["wakeTime"]);
        if (duration === 0 && bedtime !== null && wakeTime !== null) {
          const [bh, bm] = bedtime.split(":").map(Number);
          const [wh, wm] = wakeTime.split(":").map(Number);
          let mins = (wh! * 60 + wm!) - (bh! * 60 + bm!);
          if (mins <= 0) mins += 24 * 60; // crossed midnight
          duration = mins;
        }
        if (duration > 0)
          void controller.logSleep({
            durationMinutes: duration,
            bedtime,
            wakeTime,
            quality: numOrNull(f["quality"]),
          });
        break;
      }
      case "set-sleep-target": {
        const hrs = numOrNull(f["hours"]);
        if (hrs !== null) void controller.setSleepTarget(Math.round(hrs * 60));
        break;
      }
      // Routines & hygiene
      case "add-habit": {
        const nm = strOrNull(f["name"]);
        if (nm !== null) {
          const amount = numOrNull(f["amount"]);
          void controller.addHabitAdmin({
            name: nm,
            schedule: { kind: "daily" },
            daypart: (f["daypart"] as Daypart) || "anytime",
            target: amount !== null ? { amount, unit: strOrNull(f["unit"]) } : null,
          });
        }
        break;
      }
      case "add-routine": {
        const nm = strOrNull(f["name"]);
        if (nm !== null)
          void controller.createRoutineWith({
            name: nm,
            schedule: { kind: "daily" },
            daypart: (f["daypart"] as Daypart) || null,
            steps: [],
          });
        break;
      }
      case "add-routine-step": {
        const habitId = strOrNull(f["habitId"]);
        if (habitId !== null)
          void controller.addStepToRoutine(idAttr("data-routine") as RoutineId, habitId as HabitId);
        break;
      }
      // Reading & learning
      case "add-reading": {
        const title = strOrNull(f["title"]);
        if (title !== null)
          void controller.addReadingItem({
            kind: (f["kind"] as ReadingKind) || "book",
            title,
            author: strOrNull(f["author"]),
            total: numOrNull(f["total"]),
            unit: (f["unit"] as ProgressUnit) || "pages",
          });
        break;
      }
      case "set-progress": {
        const cur = numOrNull(f["current"]);
        if (cur !== null) void controller.setReadingProgress(idAttr("data-id") as ReadingItemId, cur);
        break;
      }
      case "add-note": {
        const text = strOrNull(f["text"]);
        if (text !== null) void controller.addReadingNote(idAttr("data-id") as ReadingItemId, text);
        break;
      }
      case "add-learning": {
        const text = strOrNull(f["text"]);
        if (text !== null) void controller.addLearning({ text, topic: strOrNull(f["topic"]) });
        break;
      }
      // Goals
      case "add-goal": {
        const name = strOrNull(f["name"]);
        if (name !== null) {
          const target = numOrNull(f["target"]);
          void controller.createGoalFull({
            name,
            horizon: (f["horizon"] as "vision" | "year" | "quarter" | "month" | "week") || "year",
            parentId: (strOrNull(f["parentId"]) as GoalId | null) ?? null,
            metric:
              target !== null
                ? { target, current: 0, unit: strOrNull(f["unit"]) }
                : null,
          });
        }
        break;
      }
      case "goal-metric": {
        const cur = numOrNull(f["current"]);
        if (cur !== null) {
          const gid = idAttr("data-id");
          flashGoalId = gid;
          expandedGoals.add(gid);
          void controller.setGoalMetricCurrent(gid as GoalId, cur);
        }
        break;
      }
      case "add-milestone": {
        const title = strOrNull(f["title"]);
        if (title !== null) {
          const gid = idAttr("data-id");
          flashGoalId = gid;
          expandedGoals.add(gid);
          void controller.addMilestoneTo(gid as GoalId, title);
        }
        break;
      }
      // Tasks
      case "add-task-full": {
        const title = strOrNull(f["title"]);
        if (title !== null)
          void controller.addTask({
            title,
            priority: (f["priority"] as TaskPriority) || "none",
            due: (strOrNull(f["due"]) as LocalDate | null) ?? null,
            goalId: (strOrNull(f["goalId"]) as GoalId | null) ?? null,
            projectId: (strOrNull(f["projectId"]) as ProjectId | null) ?? null,
          });
        break;
      }
      case "add-subtask": {
        const title = strOrNull(f["title"]);
        if (title !== null) void controller.addSubtaskTo(idAttr("data-id") as TaskId, title);
        break;
      }
      case "task-priority":
        void controller.editTask(idAttr("data-id") as TaskId, {
          priority: (f["priority"] as TaskPriority) || "none",
        });
        break;
      case "task-due":
        void controller.editTask(idAttr("data-id") as TaskId, {
          due: (strOrNull(f["due"]) as LocalDate | null) ?? null,
        });
        break;
      case "task-goal":
        void controller.editTask(idAttr("data-id") as TaskId, {
          goalId: (strOrNull(f["goalId"]) as GoalId | null) ?? null,
        });
        break;
      case "task-project":
        void controller.editTask(idAttr("data-id") as TaskId, {
          projectId: (strOrNull(f["projectId"]) as ProjectId | null) ?? null,
        });
        break;
      // Projects
      case "add-project": {
        const name = strOrNull(f["name"]);
        if (name !== null)
          void controller.createProjectFull({
            name,
            description: strOrNull(f["description"]),
            status: (f["status"] as ProjectStatus) || "active",
          });
        break;
      }
      case "project-status":
        void controller.editProject(idAttr("data-id") as ProjectId, {
          status: (f["status"] as ProjectStatus) || "active",
        });
        break;
      // Journal
      case "save-journal": {
        const wasUpdate = formEl.getAttribute("data-mode") === "update";
        void controller
          .saveJournalToday({
            accomplished: strOrNull(f["accomplished"]),
            wentWrong: strOrNull(f["wentWrong"]),
            learned: strOrNull(f["learned"]),
            topPriorityTomorrow: strOrNull(f["topPriorityTomorrow"]),
            rating: numOrNull(f["rating"]),
          })
          .then(() => {
            // The commit re-renders the page, so query the live status element.
            const statusEl = document.querySelector<HTMLElement>('[data-role="journal-status"]');
            if (statusEl) {
              statusEl.textContent = wasUpdate ? "Review updated ✓" : "Review saved ✓";
              statusEl.classList.add("is-shown");
              window.setTimeout(() => {
                statusEl.classList.remove("is-shown");
              }, 2200);
            }
          });
        break;
      }
      // Settings
      case "set-timezone": {
        const tz = strOrNull(f["timeZone"]);
        if (tz !== null) {
          void controller.setTimeZone(tz).then((res) => {
            const statusEl = document.querySelector<HTMLElement>('[data-role="tz-status"]');
            if (statusEl) {
              statusEl.textContent = res.ok
                ? "Time zone saved ✓"
                : "Not a valid IANA time zone (e.g. Asia/Kolkata, Europe/London).";
              statusEl.classList.toggle("is-error", !res.ok);
              statusEl.classList.add("is-shown");
              if (res.ok) window.setTimeout(() => statusEl.classList.remove("is-shown"), 2200);
            }
          });
        }
        break;
      }
      case "set-weekstart": {
        const w = numOrNull(f["weekStartsOn"]);
        if (w !== null) void controller.setWeekStart(w as Weekday);
        break;
      }
      case "import-data": {
        const raw = f["raw"] ?? "";
        void controller.importData(raw).then((res) => {
          // The commit re-renders the Settings page, so query the live element.
          const statusEl = document.querySelector<HTMLElement>('[data-role="import-status"]');
          if (statusEl) {
            statusEl.textContent = res.ok
              ? "Imported successfully." + (res.issues && res.issues.length > 0 ? ` (${res.issues.length} recovered issue(s))` : "")
              : "Import failed: " + (res.error ?? "unknown error");
          }
        });
        break;
      }
      default:
        break;
    }
  };

  const submitClosestForm = (fromEl: Element): void => {
    const formEl = fromEl.closest<HTMLElement>("[data-form]");
    if (formEl === null) return;
    const name = formEl.getAttribute("data-form");
    if (name === null) return;
    handleForm(name, readFields(formEl), formEl);
  };

  // ---- Delegated interaction ----
  root.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    const actionEl = target.closest<HTMLElement>("[data-action]");
    if (actionEl === null) return;
    const action = actionEl.getAttribute("data-action");
    const id = actionEl.getAttribute("data-id");

    switch (action) {
      case "nav": {
        const r = actionEl.getAttribute("data-route");
        if (isRoute(r)) {
          route = r;
          refreshNav();
          rerender();
          root.classList.remove("sidebar-open");
        }
        break;
      }
      case "form-submit":
        submitClosestForm(actionEl);
        break;
      case "open-goal": {
        // From the Today Goals card: jump to Goals and open that goal.
        const gid = actionEl.getAttribute("data-id");
        if (gid) {
          route = "goals";
          expandedGoals.add(gid);
          scrollGoalId = gid;
          refreshNav();
          rerender();
          root.classList.remove("sidebar-open");
        }
        break;
      }
      case "toggle-goal": {
        const gid = actionEl.getAttribute("data-id");
        if (gid) {
          if (expandedGoals.has(gid)) expandedGoals.delete(gid);
          else expandedGoals.add(gid);
          rerender();
        }
        break;
      }
      case "set-goal-status": {
        const gid = actionEl.getAttribute("data-id");
        const status = actionEl.getAttribute("data-status");
        if (gid && status) {
          flashGoalId = gid;
          expandedGoals.add(gid);
          void controller.setGoalStatus(gid as GoalId, status as GoalStatus);
        }
        break;
      }
      case "qa-kind": {
        const k = actionEl.getAttribute("data-kind");
        if (k === "task" || k === "habit") {
          quickKind = k;
          refreshSegmented();
          qaInput.focus();
        }
        break;
      }
      case "qa-submit":
        submitQuickAdd();
        break;
      case "toggle-task":
        if (id) void controller.toggleTask(id as TaskId);
        break;
      case "toggle-habit":
        if (id) void controller.toggleHabit(id as HabitId);
        break;
      case "toggle-step": {
        const hid = actionEl.getAttribute("data-habit");
        if (hid) void controller.toggleRoutineStep(hid as HabitId);
        break;
      }
      case "log-water": {
        const amt = numOrNull(actionEl.getAttribute("data-amount") ?? undefined);
        if (amt !== null) void controller.logWater(amt);
        break;
      }
      case "finish-workout":
        if (id) void controller.finishWorkout(id as WorkoutSessionId);
        break;
      case "delete-workout":
        if (id) void controller.deleteWorkout(id as WorkoutSessionId);
        break;
      case "delete-set": {
        const sess = actionEl.getAttribute("data-session");
        const se = actionEl.getAttribute("data-se");
        const set = actionEl.getAttribute("data-set");
        if (sess && se && set)
          void controller.removeSetFromSession(sess as WorkoutSessionId, se as SessionExerciseId, set as SetEntryId);
        break;
      }
      case "delete-meal":
        if (id) void controller.deleteMeal(id as MealId);
        break;
      case "toggle-habit-active":
        if (id) void controller.toggleHabitActive(id as HabitId);
        break;
      case "delete-habit":
        if (id) void controller.deleteHabit(id as HabitId);
        break;
      case "delete-routine":
        if (id) void controller.deleteRoutine(id as RoutineId);
        break;
      case "reading-status": {
        const status = actionEl.getAttribute("data-status");
        if (id && status) void controller.setReadingStatus(id as ReadingItemId, status as ReadingStatus);
        break;
      }
      case "delete-reading":
        if (id) void controller.deleteReadingItem(id as ReadingItemId);
        break;
      // ---- Phase 4: plan/reflect ----
      case "task-filter": {
        const fkey = actionEl.getAttribute("data-filter");
        if (fkey) {
          taskFilter = fkey as TaskBucket;
          rerender();
        }
        break;
      }
      case "delete-goal":
        if (id) {
          expandedGoals.delete(id);
          void controller.deleteGoal(id as GoalId);
        }
        break;
      case "toggle-milestone": {
        const ms = actionEl.getAttribute("data-ms");
        if (id && ms) {
          flashGoalId = id;
          expandedGoals.add(id);
          void controller.toggleMilestone(id as GoalId, ms as MilestoneId);
        }
        break;
      }
      case "delete-milestone": {
        const ms = actionEl.getAttribute("data-ms");
        if (id && ms) {
          expandedGoals.add(id);
          void controller.deleteMilestone(id as GoalId, ms as MilestoneId);
        }
        break;
      }
      case "toggle-subtask": {
        const sub = actionEl.getAttribute("data-sub");
        if (id && sub) void controller.toggleSubtask(id as TaskId, sub as SubtaskId);
        break;
      }
      case "delete-subtask": {
        const sub = actionEl.getAttribute("data-sub");
        if (id && sub) void controller.deleteSubtask(id as TaskId, sub as SubtaskId);
        break;
      }
      case "delete-task":
        if (id) void controller.deleteTask(id as TaskId);
        break;
      case "delete-project":
        if (id) void controller.deleteProject(id as ProjectId);
        break;
      case "delete-journal":
        if (id) void controller.deleteJournalEntry(id as JournalEntryId);
        break;
      case "export-data":
        downloadJson(controller.exportData());
        break;
      case "insights-prev":
        insightsOffset -= 1;
        rerender();
        break;
      case "insights-next":
        if (insightsOffset < 0) insightsOffset += 1;
        rerender();
        break;
      case "insights-today":
        insightsOffset = 0;
        rerender();
        break;
      case "monthly-prev":
        monthlyOffset -= 1;
        rerender();
        break;
      case "monthly-next":
        if (monthlyOffset < 0) monthlyOffset += 1;
        rerender();
        break;
      case "monthly-today":
        monthlyOffset = 0;
        rerender();
        break;
      case "reset-data":
        // Two-step in-app confirmation (no fragile native confirm() that some
        // browsers block or dismiss). First click arms; second click confirms.
        resetArmed = true;
        rerender();
        break;
      case "reset-data-confirm":
        resetArmed = false;
        void controller.resetData().then(() => {
          const el = document.querySelector<HTMLElement>('[data-role="reset-status"]');
          if (el) {
            el.textContent = "All data cleared ✓";
            el.classList.add("is-shown");
            window.setTimeout(() => el.classList.remove("is-shown"), 2600);
          }
        });
        break;
      case "reset-data-cancel":
        resetArmed = false;
        rerender();
        break;
      case "focus-quickadd":
        qaInput.focus();
        break;
      case "seed-example":
        void controller.seedExample();
        break;
      case "cycle-theme":
        themeChoice = nextTheme(themeChoice);
        localStorage.setItem(THEME_KEY, themeChoice);
        applyTheme();
        break;
      case "toggle-sidebar":
        root.classList.toggle("sidebar-open");
        break;
      default:
        break;
    }
  });

  // Enter submits the quick-add or the module form the caret is in.
  root.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter") return;
    const target = ev.target;
    if (!(target instanceof Element)) return;
    if (target === qaInput) {
      ev.preventDefault();
      submitQuickAdd();
      return;
    }
    const formEl = target.closest("[data-form]");
    if (formEl !== null && !(target instanceof HTMLTextAreaElement)) {
      ev.preventDefault();
      submitClosestForm(target);
    }
  });

  // React to system theme changes when in "system" mode.
  if (typeof window.matchMedia === "function") {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (themeChoice === "system") applyTheme();
    });
  }

  // Live clock: update only the clock node, once per second (Today page only).
  window.setInterval(() => {
    const clockEl = document.getElementById("clock");
    if (clockEl) clockEl.textContent = formatClock(systemClock.now(), controller.timeZone());
  }, 1000);

  controller.subscribe(rerender);
  void controller.init().then(rerender);
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
