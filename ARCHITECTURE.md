# Architecture — Phase 1

## Goals of this phase

Build a foundation that makes future modules (Today dashboard, fitness, diet,
knowledge, analytics) easy to add cleanly, while keeping the rules the brief
insisted on: business logic separate from UI, typed models, pure functions,
centralized config, persistence behind an abstraction, schema versioning with
explicit migrations, no silent data loss, configurable (not hardcoded) habits,
explicit Asia/Kolkata timezone, minimal dependencies, and local-first storage.

## Dependency layering (one direction only)

```
config  <-  (imported by persistence, logic)
core/       brand, result, scalars(Timestamp), clock, id        (no app deps)
  ^
time/       LocalDate + calendar math, timezone (Intl), week
  ^
domain/     pure type definitions only (Goal, Task, Habit, ...)
  ^
logic/      pure functions over domain (recurrence, progress, summaries)
  ^
state/      pure reducers over AppData (create/update/remove/complete)
  ^
persistence/ adapters, envelope, validation, migrations, serialization, Store
```

Higher layers import lower layers, never the reverse. Domain files are
type-only, so any cross-references between `time` and `domain` are erased at
compile time (no runtime cycles). This keeps the whole core tree-shakeable and
free of a UI or framework dependency.

## Key design decisions

1. **`LocalDate` vs `Timestamp` are different types.**
   `Timestamp` (branded ISO string) is an exact instant, used for
   created/updated/completed moments. `LocalDate` (branded `YYYY-MM-DD`) is a
   calendar day in the user’s timezone, used for all day-based tracking. The
   single bridge between them is `instantToLocalDate(instant, tz)`, which uses
   `Intl.DateTimeFormat` — correct across offsets and DST, no manual math.
   Calendar arithmetic on `LocalDate` (`addDays`, `diffDays`, `weekdayOf`) is
   done on a UTC anchor purely as abstract-date math, so it is DST-safe.

2. **Branded (nominal) types** for every id and for the date/time scalars, so a
   `TaskId` can’t be passed where a `GoalId` is expected and a raw string can’t
   masquerade as a `LocalDate`. Costs nothing at runtime.

3. **One recurrence engine** (`domain/recurrence.ts` + `logic/recurrence.ts`)
   powers habit frequency, routine schedules, and recurring tasks. `occursOn`
   is total and pure; `nextOccurrence` scans forward within a bounded window so
   it always terminates.

4. **Habit completion = dated event** (`HabitCompletion`), never a boolean flag
   on the habit. Streaks, per-day ratios, and future consistency analytics all
   derive from these immutable events. Measurable habits (e.g. water: 8 glasses)
   sum event amounts against a target.

5. **Routines are ordered groups of habit references.** A routine’s progress is
   computed from its member habits’ completion events, so there is no second
   tracking system. Steps pointing at a deleted habit are ignored, not errored.

6. **Progress is always derived, never stored.** `goalProgress`,
   `routineProgress`, and `computeDailySummary` compute from raw fields. The
   daily "overall" number is a transparent ratio
   `(habitsDone + tasksDone) / (habitsDue + tasksDue)` — no arbitrary
   "life score". Routines are deliberately excluded from that ratio because
   their steps are habits already counted (avoids double counting).

7. **Purity via injected `Clock` and `IdFactory`.** No module calls
   `new Date()` or `crypto.randomUUID()` except the two default implementations.
   Every operation takes `{ ids, clock }`, so tests are fully deterministic
   (`fixedClock`, `sequentialFactory`).

8. **State operations are immutable reducers.** `(deps, data, input) -> AppData`
   (creates also return the new entity). The UI/app layer decides when to call
   them and when to persist; the core holds no mutable global state.

9. **Persistence is IO-only and safe.**
   - `StorageAdapter` is a minimal string-in/string-out interface (memory,
     localStorage today; IndexedDB/file/server later) — sync or async.
   - Data is written as a `PersistedEnvelope { schemaVersion, savedAt, data }`.
   - **Loading never writes.** The load/import pipeline is:
     `parse -> detect version (unversioned blob => v0) -> refuse if newer than
     supported -> migrate -> structurally validate/coerce -> LoadOutcome`.
   - **No silent data loss.** A hard failure returns
     `{ status: "error", rawBackup }` with the original bytes; recoverable
     issues (a non-array collection, a malformed entity) are repaired to a safe
     value and reported in `issues`, while the raw bytes remain retrievable via
     `Store.backupRaw()`.

10. **Explicit, versioned migrations.** `CURRENT_SCHEMA_VERSION` lives once in
    `config`. `MIGRATIONS` is an ordered registry of `{ from, to, migrate }`
    applied sequentially. A shipped v0->v1 migration upgrades a legacy habit
    model (string `frequency` + a `habitLog` map) to the current recurrence-rule
    + completion-event model, proving the path end to end.

## Zero runtime dependencies

The core uses only platform APIs available in both Node 20+ and browsers
(`Intl`, Web Crypto, JSON). This is why it stays portable to a future
browser/Vercel deployment with no bundler surprises, and why it needs no network
to build or test.

## How to extend (later phases)

- **New entity (e.g. workouts, meals, sleep):** add a type in `domain/`, add it
  to `AppData` + `emptyAppData`, add pure logic in `logic/`, add reducers in
  `state/operations.ts`, and add a coercion line in
  `persistence/validation.ts`. If the persisted shape changes, bump
  `APP_CONFIG.schemaVersion` and append a migration.
- **New persistence backend:** implement `StorageAdapter`; nothing else changes.
- **UI (Phase 2):** import from `src/index.ts`. Keep all calculation in the core
  — the UI only renders results and calls operations. Recommended: React/Next on
  Vercel, holding `AppData` in app state, calling `store.save` after mutations.

## Known Phase-1 limitations (documented, not hidden)

- Field-level validation on load is **structural** (arrays + string ids), not
  exhaustive per-field. Structural safety is guaranteed and raw bytes are never
  lost, so deeper schema validation can be added later without risk.
- `Project` and `JournalEntry` are intentionally minimal (enough for references
  and dated reflection); richer features come in later phases.
- `monthlyDay` recurrence matches an exact day number; months without that day
  simply don’t match (no end-of-month clamping yet).

---

# Architecture — Phase 2 (Today dashboard UI)

Phase 2 adds a UI layer under `src/ui/` and a preview build. It changes **no**
Phase 1 domain or business logic. The guiding rule: *the UI decides nothing.*
Every due/overdue/complete/progress question is answered by Phase 1 logic; the UI
only projects those answers and calls Phase 1 operations back.

## UI layering (one direction, mirrors the core)

```
core (Phase 1: domain, logic, state, persistence)
  ^
ui/model/     viewModel.ts   pure: AppData -> TodayView (calls logic only)
              quickAdd.ts    pure: (kind, text) -> create-intent (no NLP)
              theme.ts       pure: choice + system -> effective theme
  ^
ui/app/       controller.ts  the ONLY UI<->core seam: holds AppData, mutates via
                             Phase 1 operations, persists via the Phase 1 Store,
                             emits change events. DOM-free.
  ^
ui/dom/       h.ts           tiny hyperscript (createElement/text/append)
              render.ts      TodayView -> DOM tree + data-action hooks. No logic.
  ^
ui/main.ts    browser entry: builds the shell, wires ONE delegated click handler,
              runs a 1s clock tick, applies/persists theme, mounts + re-renders.
```

Because the model and controller are DOM-free and pure/deterministic, the whole
application logic — including the persistence path — is tested headlessly with
`node:test`. The DOM projection is tested by installing a minimal fake `document`
and asserting on the produced tree (`ui/dom/render.test.ts`).

## Key UI decisions

- **View model delegates every rule.** `buildTodayView` calls
  `computeDailySummary`, `filterTasks`/`sortByPriority`/`isOverdue`,
  `isHabitDueOn`/`isHabitCompletedOn`/`habitDayRatio`/`currentStreak`,
  `isRoutineDueOn`/`routineProgress`, and `rollupProgress`. It contains no
  thresholds or status rules of its own.
- **Priorities** are not a new entity — they are the top-3 highest-signal active
  tasks (due today / overdue / high / urgent), reusing `sortByPriority`. This
  avoided a domain change.
- **Routines → Morning / Day / Night** by mapping each routine’s `daypart`
  (morning→Morning, evening|night→Night, else→Day). Toggling a step just
  completes/uncompletes its habit for today — no parallel state.
- **Controller persists on every mutation**: `#commit` sets state, emits (so the
  UI updates instantly), then `await store.save`. On load error it keeps a safe
  empty state and never overwrites the stored bytes (Phase 1 guarantee surfaced
  in the UI).
- **Theme** is a UI-only preference in its own `localStorage` key (`plo.theme`),
  never mixed into the domain store.

## Preview build (offline, no bundler)

No bundler/registry is available, and the core intentionally has zero deps, so
the preview is produced with tooling only:

1. `tsconfig.build.json` (extends the strict base for identical type semantics)
   compiles the app to **one SystemJS-format file** via `tsc` `outFile` — tsc
   handles every import/export form, so no hand-written bundler is needed.
2. `scripts/build-preview.mjs` inlines a **~40-line dependency-free System
   runtime**, that bundle, and `src/ui/styles.css` into a single self-contained
   `dist/index.html` that opens with no server and no network.

The authoritative typecheck remains the pure-ESM `tsc --noEmit`; the System
bundle is strictly a preview artifact.

## Responsive & accessibility

Layout is CSS-driven: a two-column card grid on desktop, collapsing to a single
column and a slide-over sidebar at ≤900px, with the hero stacking and the Quick
Add defaulting to Task at ≤560px. Keyboard focus is always visible
(`:focus-visible`), controls carry aria labels/pressed state, and
`prefers-reduced-motion` disables transitions. (Automated cross-viewport
rendering isn’t possible inside this headless container; breakpoints are verified
by construction and in a browser via the preview.)

---

# Architecture — Phase 3 (tracking modules)

Phase 3 adds five real, navigable modules — **Fitness, Diet, Sleep, Routines &
hygiene, Reading & learning** — plus the Today integration that pulls each
module's status into one place. It follows the same rule as Phase 2: *the UI
decides nothing.* Every calculation lives in pure `logic/`; the pages only
project view-models and call back into pure `state/` reducers.

## What was added, by layer

- **domain/** — new pure types: `fitness.ts` (Exercise, WorkoutSession,
  SessionExercise, SetEntry, BodyWeightEntry, MeasurementEntry), `diet.ts`
  (FoodItem, MealEntry, MealItem, WaterEntry, Macros), `sleep.ts` (SleepEntry),
  `reading.ts` (ReadingItem, ReadingNote, LearningLogEntry). `AppData` gained the
  matching collections; `Settings` gained `nutrition` targets.
- **logic/** — one pure module each: `fitness.ts` (estimated 1RM, session volume,
  personal records, progressive-overload trend, body-weight trend, weekly/monthly
  rollups), `diet.ts` (daily macro totals, water, progress vs targets), `sleep.ts`
  (averages, consistency score, duration formatting), `reading.ts` (progress %,
  status grouping). `moduleStatus.ts` produces the compact per-module snapshot the
  Today dashboard shows.
- **state/operations.ts** — pure reducers for each module (log a workout set, log
  a meal/water, upsert a night's sleep, advance reading progress with automatic
  status transitions, etc.), plus routine-step management.
- **ui/** — pure view-models in `model/modules.ts`, logic-free renderers in
  `dom/modules.ts`, controller getters/intents, and routing in `main.ts`.

## Persistence change: schema v1 -> v2

Adding the new collections changed the persisted shape, so `CURRENT_SCHEMA_VERSION`
became **2** with a new **`v1toV2`** migration. It is **purely additive**: every
existing collection is preserved and the new ones are initialised empty, with
nutrition defaults backfilled into settings. Old v1 saves load and upgrade with no
data loss; the round-trip and migration tests cover this.

## Today integration

`todayModuleStatus(data, date, settings)` returns a small read-only summary
(workout logged?, calories/protein/water vs target, sleep vs target, currently
reading). The Today view-model embeds it and renders an "Across your day" card
whose chips deep-link to each module. It is shown **separately** from the daily
completion ring so that "overall" stays an honest measure of tasks/habits.

## Hygiene = configuration, not code

The "Routines & hygiene" module is deliberately built on the Phase 1 habit/routine
engine: the user creates their own small habits (brushing, skincare, anything) and
groups them into routines. Nothing is hardcoded.

---

# Architecture — Phase 4 (plan & reflect)

Phase 4 surfaces four Phase 1 engines that previously had no dedicated UI, and
adds a data page. It required **no schema change** — every collection already
existed — so persistence stays at v2 with migrations `0->1->2`.

## What was added, by layer

- **state/operations.ts** — five small additive reducers only:
  `toggleMilestone`, `removeMilestone` (goals); `toggleSubtask`, `removeSubtask`
  (tasks); `removeJournalEntry`. Everything else reuses existing Phase 1
  operations (`createGoal`/`updateGoal`/`addMilestone`, `createTask`/`updateTask`/
  `addSubtask`, `createProject`/`updateProject`/`removeProject`,
  `upsertJournalEntry`).
- **ui/model/plan.ts** — pure view-models: `buildGoalsView` (renders the
  parent/child hierarchy as a depth-tagged tree), `buildTasksView` (Today /
  Upcoming / Overdue / No-date / Done buckets via Phase 1 filters),
  `buildProjectsView`, `buildJournalView`, `buildSettingsView` (incl. live data
  counts).
- **ui/dom/plan.ts** — renderers for Goals, Tasks, Projects, Daily Review, and
  Settings & Data, using the shared primitives extracted to **`ui/dom/ui.ts`**
  (so the module and plan pages share one card/form system).
- **ui/app/controller.ts** — plan getters/intents plus `exportData()`,
  `importData(raw)`, and `resetData()`, all routed through the existing Phase 1
  serialization pipeline.
- **ui/main.ts** — routing extended to 11 routes; the sidebar is grouped into
  **Plan / Track / Settings**; a client-side JSON download is wired for export.

## Data export / import

Export serialises the whole store to JSON via the same `exportJson` used for
backups; import runs the untrusted text through the identical **load pipeline** as
startup (`importJson` -> validate/coerce -> migrate), so a malformed or older file
fails safely or upgrades cleanly rather than corrupting state. Import then commits
through the normal reducer/save path, so it persists across reloads. Reset clears
tracked data but keeps the user's settings.

---

## Testing strategy

- **Unit / integration** (`*.test.ts`, Node test runner): pure logic, pure
  reducers, persistence round-trips + migrations, controller-through-store
  persistence, and fake-DOM render projections.
- **Browser smoke** (`scripts/smoke-browser.mjs`, Playwright/Chromium): loads the
  built `dist/index.html`, seeds data, visits **every** route, and asserts no
  console errors, no sidebar/content overlap, and non-empty content. This exists
  because fake-DOM unit tests cannot catch real layout/CSS regressions.

## Intentionally deferred (Phase 5+)

An Insights/analytics dashboard with charts and long-range trends, a calendar/
timeline view, reminders/notifications scheduling, global search / command
palette, tags & saved filters, and any cloud sync / multi-device. The app remains
local-first and single-device.
