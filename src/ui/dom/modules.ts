/**
 * DOM renderers for the Phase 3 module pages. Logic-free, like the Today render:
 * they project a module view model into elements and tag interactive nodes with
 * data-action / data-field / data-* attributes. All behaviour is wired by event
 * delegation in main.ts. Forms follow one convention: a container carrying
 * data-form="<name>" (plus any data-* ids it needs) wraps inputs marked
 * data-field="<key>" and a button with data-action="form-submit".
 */
import { h } from "./h";
import { formatDuration } from "../../logic/sleep";
import { MEAL_TYPES } from "../../domain/diet";
import { DAYPARTS } from "../../domain/common";
import { READING_STATUSES } from "../../domain/reading";
import type {
  FitnessView,
  DietView,
  SleepView,
  RoutinesView,
  ReadingView,
} from "../model/modules";

import {
  pct,
  card,
  emptyLine,
  pageHead,
  bar,
  stat,
  field,
  selectField,
  form,
  titleCase,
} from "./ui";
const mealOptions = MEAL_TYPES.map((t) => ({ value: t, label: titleCase(t) }));
const daypartOptions = DAYPARTS.map((d) => ({ value: d, label: titleCase(d) }));

// ============================ Fitness ============================

export const renderFitness = (v: FitnessView): HTMLElement => {
  const root = h("div", { class: "dash module" });
  root.appendChild(pageHead("Fitness", "Workouts, progressive overload, body metrics."));

  const grid = h("div", { class: "grid" });

  // Body weight + weekly rollup
  const bw = v.bodyWeight;
  const overview = h(
    "div",
    { class: "stat-row" },
    stat("This week", `${v.weekly.sessions} sessions`),
    stat("Volume (7d)", `${Math.round(v.weekly.volume)}`),
    stat("Volume (30d)", `${Math.round(v.monthly.volume)}`),
    stat(
      "Body weight",
      bw.latest !== null ? `${bw.latest} ${bw.unit ?? ""}`.trim() : "—",
    ),
  );
  const bwNote =
    bw.delta !== null
      ? h(
          "p",
          { class: "muted" },
          `${bw.delta > 0 ? "▲" : bw.delta < 0 ? "▼" : "•"} ${Math.abs(bw.delta).toFixed(1)} ${bw.unit ?? ""} since last reading`,
        )
      : null;
  grid.appendChild(
    card("Overview", h("div", {}, overview, bwNote), { cls: "card-wide" }),
  );

  // Log body weight + measurement
  grid.appendChild(
    card(
      "Log body metrics",
      h(
        "div",
        {},
        form(
          "log-bodyweight",
          [
            field("Weight", "weight", { type: "number", step: "0.1", placeholder: "Enter weight" }),
            selectField("Unit", "unit", [
              { value: "kg", label: "kg" },
              { value: "lb", label: "lb" },
            ]),
          ],
          "Log weight",
        ),
        form(
          "log-measurement",
          [
            field("Site", "site", { placeholder: "e.g. waist" }),
            field("Value", "value", { type: "number", step: "0.1", placeholder: "Enter measurement" }),
            field("Unit", "unit", { placeholder: "cm", value: "cm" }),
          ],
          "Log measurement",
        ),
        v.measurements.length > 0
          ? h(
              "div",
              { class: "chips" },
              ...v.measurements.map((m) =>
                h("span", { class: "chip" }, `${m.site}: ${m.value} ${m.unit}`),
              ),
            )
          : null,
      ),
    ),
  );

  // Exercises catalog + start workout
  grid.appendChild(
    card(
      "Exercises & workouts",
      h(
        "div",
        {},
        form(
          "add-exercise",
          [
            field("New exercise", "name", { placeholder: "e.g. Dumbbell row" }),
            selectField("Type", "kind", [
              { value: "strength", label: "Strength" },
              { value: "cardio", label: "Cardio" },
              { value: "mobility", label: "Mobility" },
              { value: "other", label: "Other" },
            ]),
            selectField("Load", "loadUnit", [
              { value: "bodyweight", label: "Bodyweight" },
              { value: "kg", label: "Weight (kg)" },
              { value: "lb", label: "Weight (lb)" },
            ]),
          ],
          "Add to catalog",
        ),
        form("start-workout", [field("Workout name", "name", { placeholder: "e.g. Upper Body" })], "Start workout"),
        v.exercises.length > 0
          ? h(
              "p",
              { class: "muted" },
              `Catalog: ${v.exercises.map((e) => e.name).join(", ")}`,
            )
          : emptyLine("Add an exercise to the catalog, then start a workout to log sets."),
      ),
    ),
  );

  // Personal records
  grid.appendChild(
    card(
      "Personal records",
      v.prs.length > 0
        ? h(
            "div",
            { class: "rows" },
            ...v.prs.map((p) =>
              h(
                "div",
                { class: "row pr-row" },
                h("span", { class: "row-title" }, p.name),
                h(
                  "span",
                  { class: "row-meta mono" },
                  `best ${p.maxWeight}${p.unit} · e1RM ${p.bestOneRepMax}${p.unit}`,
                ),
              ),
            ),
          )
        : emptyLine("Log some sets and your PRs (estimated 1RM) will appear here."),
    ),
  );

  // Session history
  const sessionsBody =
    v.sessions.length > 0
      ? h("div", { class: "rows" }, ...v.sessions.map(renderSession))
      : emptyLine("No workouts logged yet.");
  grid.appendChild(
    card("Workout history", sessionsBody, {
      count: v.sessions.length > 0 ? String(v.sessions.length) : undefined,
      cls: "card-wide",
    }),
  );

  root.appendChild(grid);

  // stash the catalog for add-session-exercise selects (rendered per session)
  return root;

  function renderSession(s: FitnessView["sessions"][number]): HTMLElement {
    const exOptions = v.exercises.map((e) => ({ value: e.id, label: e.name }));

    // Format one logged set as a readable line: "12 reps" or "12 × 60 kg".
    const setLabel = (
      x: FitnessView["sessions"][number]["exercises"][number]["sets"][number],
      unit: string | null,
      bodyweight: boolean,
    ): string => {
      const reps = x.reps ?? 0;
      if (x.weight !== null && x.weight > 0) return `${reps} reps · ${x.weight} ${unit ?? "kg"}`;
      if (bodyweight) return `${reps} reps · Bodyweight`;
      return `${reps} reps`;
    };

    const exerciseBlock = (se: FitnessView["sessions"][number]["exercises"][number]): HTMLElement => {
      const setRows =
        se.sets.length > 0
          ? h(
              "div",
              { class: "set-list" },
              ...se.sets.map((x, i) =>
                h(
                  "div",
                  { class: "set-row" },
                  h("span", { class: "set-n" }, `Set ${i + 1}`),
                  h("span", { class: "set-val mono" }, setLabel(x, se.loadUnit, se.bodyweight)),
                  !s.completed
                    ? h("button", { class: "icon-btn", "data-action": "delete-set", "data-session": s.id, "data-se": se.id, "data-set": x.id, title: "Remove set" }, "✕")
                    : null,
                ),
              ),
            )
          : h("p", { class: "empty-line" }, "No sets yet.");

      // Active session: show the add-set control (bodyweight = reps only).
      const addSet = s.completed
        ? null
        : se.bodyweight
          ? form(
              "add-set",
              [field("Reps", "reps", { type: "number", min: "0", placeholder: "e.g. 12" })],
              "Add set",
              { "data-session": s.id, "data-se": se.id },
            )
          : form(
              "add-set",
              [
                field("Reps", "reps", { type: "number", min: "0", placeholder: "e.g. 12" }),
                field(`Weight (${se.loadUnit ?? "kg"})`, "weight", { type: "number", step: "0.5", min: "0", placeholder: "optional" }),
              ],
              "Add set",
              { "data-session": s.id, "data-se": se.id },
            );

      return h(
        "div",
        { class: "se-block" },
        h(
          "div",
          { class: "se-head" },
          h("span", { class: "row-title" }, se.name),
          h("span", { class: "se-tag" }, se.bodyweight ? "Bodyweight" : (se.loadUnit ?? "kg")),
          h("span", { class: "se-count mono" }, `${se.sets.length} ${se.sets.length === 1 ? "set" : "sets"}`),
        ),
        setRows,
        addSet,
      );
    };

    // Finished workout → clean read-only summary.
    if (s.completed) {
      return h(
        "div",
        { class: "session is-complete" },
        h(
          "div",
          { class: "session-head" },
          h("span", { class: "row-title" }, s.name ?? "Workout"),
          h("span", { class: "pill pill-good" }, "Completed"),
          h("span", { class: "session-actions" },
            h("button", { class: "icon-btn", "data-action": "delete-workout", "data-id": s.id, title: "Delete workout" }, "✕"),
          ),
        ),
        h("p", { class: "session-summary mono" }, `${s.date} · ${s.exercises.length} exercises · ${s.setCount} sets`),
        ...s.exercises.map(exerciseBlock),
      );
    }

    // Active workout → the logger.
    return h(
      "div",
      { class: "session is-active" },
      h(
        "div",
        { class: "session-head" },
        h("span", { class: "row-title" }, s.name ?? "Workout"),
        h("span", { class: "pill" }, "In progress"),
        h("span", { class: "session-actions" },
          h("button", { class: "icon-btn", "data-action": "delete-workout", "data-id": s.id, title: "Discard workout" }, "✕"),
        ),
      ),
      h("p", { class: "session-summary mono" }, `${s.date} · ${s.exercises.length} exercises · ${s.setCount} sets`),
      ...s.exercises.map(exerciseBlock),
      // Quiet "add exercise" — a subtle control, not a prominent card.
      exOptions.length > 0
        ? h(
            "details",
            { class: "add-ex" },
            h("summary", null, "+ Add exercise"),
            form(
              "add-session-exercise",
              [selectField("Exercise", "exerciseId", exOptions)],
              "Add to workout",
              { "data-session": s.id },
            ),
          )
        : emptyLine("Add an exercise to the catalog below to log sets here."),
      // The clear final action.
      h("div", { class: "finish-row" },
        h("button", { class: "btn btn-primary btn-finish", "data-action": "finish-workout", "data-id": s.id }, "Finish workout"),
      ),
    );
  }
};

// ============================ Diet ============================

export const renderDiet = (v: DietView): HTMLElement => {
  const root = h("div", { class: "dash module" });
  root.appendChild(pageHead("Diet", "Meals, macros, water — measured against your targets."));

  const grid = h("div", { class: "grid" });
  const p = v.progress;

  const progressRow = (
    label: string,
    current: number,
    target: number,
    unit: string,
    frac: number,
  ): HTMLElement =>
    h(
      "div",
      { class: "prog" },
      h(
        "div",
        { class: "prog-head" },
        h("span", null, label),
        h("span", { class: "mono" }, `${Math.round(current)} / ${target} ${unit}`),
      ),
      bar(frac),
    );

  grid.appendChild(
    card(
      "Today's nutrition",
      h(
        "div",
        {},
        progressRow("Calories", p.calories.current, p.calories.target, "kcal", p.calories.ratio),
        progressRow("Protein", p.protein.current, p.protein.target, "g", p.protein.ratio),
        progressRow("Water", p.waterMl, p.water.target, "ml", p.water.ratio),
        h(
          "div",
          { class: "stat-row tight" },
          stat("Carbs", `${Math.round(p.macros.carbs)} g`),
          stat("Fat", `${Math.round(p.macros.fat)} g`),
        ),
      ),
      { cls: "card-wide" },
    ),
  );

  grid.appendChild(
    card(
      "Water",
      h(
        "div",
        {},
        h(
          "div",
          { class: "btn-row" },
          h("button", { class: "btn btn-ghost", "data-action": "log-water", "data-amount": "250" }, "+250 ml"),
          h("button", { class: "btn btn-ghost", "data-action": "log-water", "data-amount": "500" }, "+500 ml"),
          h("button", { class: "btn btn-ghost", "data-action": "log-water", "data-amount": "1000" }, "+1 L"),
        ),
      ),
    ),
  );

  grid.appendChild(
    card(
      "Log a meal",
      form(
        "log-meal",
        [
          selectField("Meal", "type", mealOptions),
          field("Food", "name", { placeholder: "Chicken rice bowl" }),
          field("kcal", "kcal", { type: "number", min: "0", placeholder: "640" }),
          field("Protein", "protein", { type: "number", min: "0", placeholder: "52" }),
          field("Carbs", "carbs", { type: "number", min: "0", placeholder: "68" }),
          field("Fat", "fat", { type: "number", min: "0", placeholder: "16" }),
        ],
        "Log meal",
      ),
    ),
  );

  const mealsBody =
    v.meals.length > 0
      ? h(
          "div",
          { class: "rows" },
          ...v.meals.map((m) =>
            h(
              "div",
              { class: "row" },
              h("span", { class: "pill" }, m.type),
              h("span", { class: "row-title" }, m.name),
              h("span", { class: "row-meta mono" }, `${Math.round(m.kcal)} kcal · ${Math.round(m.protein)}g P`),
              h(
                "button",
                { class: "btn btn-ghost btn-sm", "data-action": "delete-meal", "data-id": m.id },
                "✕",
              ),
            ),
          ),
        )
      : emptyLine("No meals logged today.");
  grid.appendChild(card("Today's meals", mealsBody, { cls: "card-wide" }));

  grid.appendChild(
    card(
      "Targets",
      form(
        "set-nutrition-targets",
        [
          field("Calories", "calories", { type: "number", min: "0", value: String(v.targets.calories) }),
          field("Protein (g)", "proteinGrams", { type: "number", min: "0", value: String(v.targets.proteinGrams) }),
          field("Water (ml)", "waterMl", { type: "number", min: "0", value: String(v.targets.waterMl) }),
        ],
        "Save targets",
      ),
    ),
  );

  root.appendChild(grid);
  return root;
};

// ============================ Sleep ============================

export const renderSleep = (v: SleepView): HTMLElement => {
  const root = h("div", { class: "dash module" });
  root.appendChild(pageHead("Sleep", "Duration, target, and how steady your nights are."));

  const grid = h("div", { class: "grid" });

  grid.appendChild(
    card(
      "Last night",
      h(
        "div",
        {},
        h(
          "div",
          { class: "prog" },
          h(
            "div",
            { class: "prog-head" },
            h("span", null, v.progress.logged ? "Slept" : "Not logged"),
            h(
              "span",
              { class: "mono" },
              `${formatDuration(v.progress.durationMinutes)} / ${formatDuration(v.targetMinutes)}`,
            ),
          ),
          bar(v.progress.ratio),
        ),
        h(
          "div",
          { class: "stat-row tight" },
          stat("7-night avg", formatDuration(v.averageMinutes)),
          stat(
            "Consistency",
            v.consistency === null ? "—" : `${pct(v.consistency)}%`,
          ),
        ),
      ),
      { cls: "card-wide" },
    ),
  );

  grid.appendChild(
    card(
      "Log sleep",
      form(
        "log-sleep",
        [
          field("Hours", "hours", { type: "number", min: "0", placeholder: "7" }),
          field("Minutes", "minutes", { type: "number", min: "0", placeholder: "30" }),
          field("Bedtime", "bedtime", { type: "time" }),
          field("Wake", "wakeTime", { type: "time" }),
          selectField("Quality", "quality", [
            { value: "", label: "—" },
            { value: "1", label: "1" },
            { value: "2", label: "2" },
            { value: "3", label: "3" },
            { value: "4", label: "4" },
            { value: "5", label: "5" },
          ]),
        ],
        "Log sleep",
      ),
    ),
  );

  const nightsBody =
    v.nights.length > 0
      ? h(
          "div",
          { class: "rows" },
          ...v.nights.map((n) =>
            h(
              "div",
              { class: "row" },
              h("span", { class: "row-title mono" }, n.date),
              h("span", { class: "row-meta mono" }, formatDuration(n.durationMinutes)),
              n.quality !== null ? h("span", { class: "pill" }, `Q${n.quality}`) : null,
            ),
          ),
        )
      : emptyLine("No nights logged yet.");
  grid.appendChild(card("Recent nights", nightsBody));

  grid.appendChild(
    card(
      "Target",
      form(
        "set-sleep-target",
        [field("Target hours", "hours", { type: "number", step: "0.5", min: "0", value: String(v.targetMinutes / 60) })],
        "Save target",
      ),
    ),
  );

  root.appendChild(grid);
  return root;
};

// ==================== Routines & hygiene ====================

export const renderRoutines = (v: RoutinesView): HTMLElement => {
  const root = h("div", { class: "dash module" });
  root.appendChild(
    pageHead(
      "Routines & hygiene",
      "Your own small habits (brushing, skincare, anything) grouped into routines.",
    ),
  );

  const grid = h("div", { class: "grid" });

  // Habits admin
  const habitRows =
    v.habits.length > 0
      ? h(
          "div",
          { class: "rows" },
          ...v.habits.map((hh) =>
            h(
              "div",
              { class: `row ${hh.active ? "" : "is-dim"}`.trim() },
              h("span", { class: "row-title" }, hh.name),
              h(
                "span",
                { class: "row-meta" },
                hh.daypart +
                  (hh.measurable ? ` · ${hh.target ?? ""} ${hh.unit ?? ""}`.trimEnd() : ""),
              ),
              h(
                "button",
                {
                  class: "btn btn-ghost btn-sm",
                  "data-action": "toggle-habit-active",
                  "data-id": hh.id,
                },
                hh.active ? "Pause" : "Resume",
              ),
              h(
                "button",
                { class: "btn btn-ghost btn-sm", "data-action": "delete-habit", "data-id": hh.id },
                "✕",
              ),
            ),
          ),
        )
      : emptyLine("No habits yet. Add your own — nothing is hardcoded.");
  grid.appendChild(
    card(
      "Small habits",
      h(
        "div",
        {},
        habitRows,
        form(
          "add-habit",
          [
            field("Habit", "name", { placeholder: "Brush teeth (AM)" }),
            selectField("When", "daypart", daypartOptions, "morning"),
            field("Target (optional)", "amount", { type: "number", min: "0", placeholder: "" }),
            field("Unit", "unit", { placeholder: "e.g. glasses" }),
          ],
          "Add habit",
        ),
      ),
      { count: v.habits.length > 0 ? String(v.habits.length) : undefined },
    ),
  );

  // Routines admin
  const habitOptions = v.habits.map((hh) => ({ value: hh.id, label: hh.name }));
  const routineRows =
    v.routines.length > 0
      ? h(
          "div",
          { class: "rows" },
          ...v.routines.map((r) =>
            h(
              "div",
              { class: "routine-admin" },
              h(
                "div",
                { class: "session-head" },
                h("span", { class: "row-title" }, r.name),
                h("span", { class: "row-meta" }, r.daypart ?? "anytime"),
                h(
                  "button",
                  { class: "btn btn-ghost btn-sm", "data-action": "delete-routine", "data-id": r.id },
                  "✕",
                ),
              ),
              r.steps.length > 0
                ? h(
                    "div",
                    { class: "chips" },
                    ...r.steps.map((s) => h("span", { class: "chip" }, s.name)),
                  )
                : emptyLine("No steps yet — add a habit below."),
              habitOptions.length > 0
                ? form(
                    "add-routine-step",
                    [selectField("Add step", "habitId", habitOptions)],
                    "Add step",
                    { "data-routine": r.id },
                  )
                : null,
            ),
          ),
        )
      : emptyLine("No routines yet. Create a Morning or Night flow.");
  grid.appendChild(
    card(
      "Routines",
      h(
        "div",
        {},
        routineRows,
        form(
          "add-routine",
          [
            field("Routine", "name", { placeholder: "Morning routine" }),
            selectField("When", "daypart", daypartOptions, "morning"),
          ],
          "Create routine",
        ),
      ),
    ),
  );

  root.appendChild(grid);
  return root;
};

// ======================= Reading & learning =======================

export const renderReading = (v: ReadingView): HTMLElement => {
  const root = h("div", { class: "dash module" });
  root.appendChild(pageHead("Reading & learning", "Books, articles, progress, notes, and a learning log."));

  const grid = h("div", { class: "grid" });

  const notesBlock = (it: ReadingView["current"][number]): HTMLElement | null =>
    it.notes.length > 0
      ? h(
          "div",
          { class: "reading-notes" },
          h("div", { class: "reading-notes-head" }, `Notes · ${it.notes.length}`),
          ...it.notes.map((n) =>
            h(
              "div",
              { class: "reading-note" },
              n.location !== null ? h("span", { class: "reading-note-loc mono" }, `p.${n.location}`) : null,
              h("span", { class: "reading-note-text" }, n.text),
            ),
          ),
        )
      : null;

  const itemCard = (it: ReadingView["current"][number]): HTMLElement => {
    const progressLine =
      it.total !== null || it.unit === "percent"
        ? h(
            "div",
            { class: "prog" },
            h(
              "div",
              { class: "prog-head" },
              h("span", { class: "mono" }, `${it.current}${it.total !== null ? `/${it.total}` : ""} ${it.unit}`),
              h("span", { class: "mono" }, `${it.percent}%`),
            ),
            bar(it.percent / 100),
          )
        : null;

    // ---- FINISHED: clean, read-only completed card ----
    if (it.status === "finished") {
      return h(
        "div",
        { class: "read-item is-finished" },
        h(
          "div",
          { class: "read-head" },
          h("span", { class: "row-title" }, it.title),
          h("span", { class: "pill pill-good" }, "✓ Finished"),
          h("span", { class: "read-head-meta row-meta" }, it.author ?? it.kind),
        ),
        progressLine,
        notesBlock(it),
        // One deliberate action set — reopen to editing, or remove — not the full editor.
        h(
          "div",
          { class: "read-finished-actions" },
          h("button", { class: "btn btn-ghost btn-sm", "data-action": "reading-status", "data-id": it.id, "data-status": "current" }, "Reopen"),
          h("button", { class: "icon-btn", "data-action": "delete-reading", "data-id": it.id, title: "Remove" }, "✕"),
        ),
      );
    }

    // ---- ACTIVE / UPCOMING: full editor ----
    const statusBtns = READING_STATUSES.filter((s) => s !== it.status).map((s) =>
      h(
        "button",
        { class: "btn btn-ghost btn-sm", "data-action": "reading-status", "data-id": it.id, "data-status": s },
        s === "current" ? "Reading" : s === "finished" ? "Finish" : "Later",
      ),
    );
    return h(
      "div",
      { class: "read-item" },
      h(
        "div",
        { class: "read-head" },
        h("span", { class: "row-title" }, it.title),
        h("span", { class: "row-meta" }, it.author ?? it.kind),
      ),
      progressLine,
      h(
        "div",
        { class: "read-actions" },
        form(
          "set-progress",
          [field("Progress", "current", { type: "number", min: "0", placeholder: String(it.current) })],
          "Update",
          { "data-id": it.id },
        ),
        ...statusBtns,
        h("button", { class: "btn btn-ghost btn-sm", "data-action": "delete-reading", "data-id": it.id }, "✕"),
      ),
      form(
        "add-note",
        [field("Note", "text", { placeholder: "A thought…" })],
        "Add note",
        { "data-id": it.id },
      ),
      notesBlock(it),
    );
  };

  const group = (title: string, items: ReadingView["current"]): HTMLElement =>
    card(
      title,
      items.length > 0
        ? h("div", { class: "rows" }, ...items.map(itemCard))
        : emptyLine("Nothing here yet."),
      { count: items.length > 0 ? String(items.length) : undefined, cls: "card-wide" },
    );

  grid.appendChild(
    card(
      "Add to list",
      form(
        "add-reading",
        [
          selectField("Type", "kind", [
            { value: "book", label: "Book" },
            { value: "article", label: "Article" },
          ]),
          field("Title", "title", { placeholder: "Atomic Habits" }),
          field("Author", "author", { placeholder: "James Clear" }),
          field("Total", "total", { type: "number", min: "0", placeholder: "320" }),
          selectField("Unit", "unit", [
            { value: "pages", label: "pages" },
            { value: "minutes", label: "minutes" },
            { value: "percent", label: "percent" },
          ]),
        ],
        "Add",
      ),
    ),
  );

  grid.appendChild(group("Currently reading", v.current));
  grid.appendChild(group("Up next", v.upcoming));
  grid.appendChild(group("Finished", v.finished));

  const learnBody = h(
    "div",
    {},
    form(
      "add-learning",
      [
        field("Topic", "topic", { placeholder: "Systems" }),
        field("What you learned", "text", { placeholder: "Small habits compound…" }),
      ],
      "Log it",
    ),
    v.learningToday.length > 0
      ? h(
          "div",
          { class: "rows" },
          ...v.learningToday.map((e) =>
            h(
              "div",
              { class: "row" },
              e.topic !== null ? h("span", { class: "pill" }, e.topic) : null,
              h("span", { class: "row-title" }, e.text),
            ),
          ),
        )
      : emptyLine("Nothing logged today."),
  );
  grid.appendChild(card("Learning log — today", learnBody, { cls: "card-wide" }));

  root.appendChild(grid);
  return root;
};
