# Personal Life OS

A **local-first, offline** personal life operating system: plan your goals and
tasks, track fitness, diet, sleep, routines/hygiene and reading, and reflect with
a daily review — all in one dark-first web app that stores everything on your own
device.

The project is built in strict, layered phases. It currently contains **Phases
1–4**:

- **Phase 1 — Foundation.** Typed domain models, pure business logic, and
  versioned local persistence (migrations + export/import). No UI.
- **Phase 2 — Today dashboard.** A premium dark-first dashboard + app shell that
  *consumes* the Phase 1 core.
- **Phase 3 — Tracking modules.** Fitness, Diet, Sleep, Routines & hygiene, and
  Reading & learning, each a real navigable page that also feeds the Today
  dashboard's "Across your day" summary.
- **Phase 4 — Plan & reflect.** Goals (with a vision→week hierarchy and
  milestones), a full Tasks manager, Projects, a Daily Review journal, and a
  Settings & Data page with JSON export/import.

There are **zero runtime dependencies** — the app is hand-written TypeScript that
compiles to a single self-contained HTML file which runs with no network access.

---

## Requirements

- **Node.js >= 20** (uses the built-in test runner and `--import`).
- npm (bundled with Node).

## Setup

```bash
npm install
```

This installs dev tooling only: **TypeScript** (typecheck), **tsx** (run the test
suite directly from TypeScript), and **Playwright** (browser smoke test). The app
itself has no dependencies.

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run typecheck` | Strict `tsc --noEmit` over the whole project (app + tests). |
| `npm test` | Run the full unit + integration suite (Node test runner via tsx). |
| `npm run test:watch` | Same, in watch mode. |
| `npm run build:preview` | Compile everything and emit the self-contained `dist/index.html`. |
| `npm run smoke` | Browser smoke test (see below). |

## Preview (run the real app offline)

```bash
npm run build:preview
# then open dist/index.html in any browser — no server, no network needed
```

`dist/index.html` is a **single self-contained file**: the compiled app, a tiny
hand-written SystemJS-style module runtime, and the stylesheet are all inlined.
It runs by double-clicking the file. Data is persisted in the browser's
`localStorage`, so it survives reloads. Use the **Settings & data** page to export
a JSON backup or import one.

> A verified build of `dist/index.html` is committed to the repo for convenience;
> re-run `npm run build:preview` any time to regenerate it.

## Browser smoke test

Unit tests render into a fake DOM, so they can't catch real layout/CSS problems.
The smoke test loads the **actual built `dist/index.html`** in Chromium, seeds
example data, visits every route, and asserts there are no console errors, no
sidebar/content overlap, and that each page renders content.

```bash
npm run build:preview           # smoke test runs against dist/index.html
npx playwright install chromium # one-time: download the browser
npm run smoke
```

To point at a specific Chromium binary instead of Playwright's managed one, set
`CHROMIUM_PATH=/path/to/chrome`.

---

## Architecture at a glance

Strict one-way dependency flow — each layer only depends on the ones above it:

```
core  ->  domain  ->  logic  ->  state  ->  persistence  ->  config
                                    \                          /
                                     ui (model -> dom -> app -> main)
```

- **`core`** — primitives: branded scalars, `Result`, id factory, clock.
- **`domain`** — pure `readonly` data types (Goal, Task, Habit, Routine, Project,
  JournalEntry, Exercise/WorkoutSession, Meal, SleepEntry, ReadingItem, ...) and
  the `AppData` shape.
- **`logic`** — pure, UI-free functions deriving everything computable (goal
  rollups, task filtering, streaks, workout PRs/volume, nutrition progress, sleep
  consistency, reading progress, the Today summary).
- **`state`** — pure reducers: `(deps, data, input) => newAppData`. All mutation
  lives here; nothing mutates in place.
- **`persistence`** — a versioned envelope, structural validation/coercion,
  numbered migrations, and JSON export/import over a pluggable storage adapter
  (`localStorage` in the browser, in-memory for tests).
- **`config`** — constants, defaults, and the current schema version.
- **`ui`** — `model` (pure view-models) -> `dom` (logic-free renderers) ->
  `app` (a DOM-free controller seam) -> `main` (the browser shell + routing).

The current persisted schema is **version 2**, with migrations `0->1->2`.

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for the full design, invariants, and
per-phase details.

---

## Feature list (Phases 1-4)

**Plan**
- **Today dashboard** — greeting + live clock, daily completion ring, "Across your
  day" module summary, priorities, today's tasks, habit checklist, routines, goals.
- **Goals** — vision -> year -> quarter -> month -> week hierarchy with parent
  links, numeric metrics, milestones, status lifecycle, and rolled-up progress.
- **Tasks** — filter by Today / Upcoming / Overdue / No-date / Done; priorities,
  due dates, subtasks, recurrence, and linking tasks to goals/projects.
- **Projects** — group tasks, track per-project completion.
- **Daily Review** — one reflective journal entry per day (wins, friction,
  learnings, tomorrow's top priority, day rating) with history.

**Track**
- **Fitness** — exercise catalog, workout sessions (exercises/sets/reps/weight),
  derived personal records & estimated 1RM, progressive-overload trend, weekly/
  monthly volume, body-weight tracking, and measurements.
- **Diet** — meals with calories + macros, water logging, and daily progress vs
  your calorie/protein/water targets.
- **Sleep** — duration (entered or from bed/wake times), target, 7-night history,
  average, and a consistency score.
- **Routines & hygiene** — fully user-configurable small habits grouped into
  routines (nothing hardcoded).
- **Reading & learning** — books/articles with pages/minutes/percent progress,
  automatic upcoming->current->finished transitions, notes, and a learning log.

**System**
- **Settings & data** — timezone, week-start, nutrition/sleep targets, live data
  counts, and **local-first JSON export / import / reset**.
- **Theming** — dark / light / system, persisted.
- **Responsive** — two-column desktop layout; off-canvas drawer on small screens.

---

## Project layout

```
src/
  core/         primitives (scalars, Result, id, clock, brand)
  time/         LocalDate, timezone, week helpers
  domain/       pure data types + AppData
  logic/        pure derivations (per module + Today summary)
  state/        pure reducers (operations) + helpers
  persistence/  envelope, validation, migrations, serialization, store, adapter
  config/       constants, defaults, schema version
  ui/
    model/      pure view-models (Today + module + plan pages)
    dom/        logic-free renderers + shared primitives + hyperscript helper
    app/        controller (DOM-free seam)
    main.ts     browser shell: routing, delegated events, theme, clock
    styles.css  dark-first design tokens + component styles
  testing/      test utilities
scripts/
  build-preview.mjs   compile + inline into dist/index.html
  smoke-browser.mjs   Chromium smoke test over the built preview
dist/
  index.html    self-contained offline build (committed)
```

Tests live next to the code they cover as `*.test.ts` and run under the Node test
runner.

## Notes

- **No license file is included** — add the license of your choice before making
  the repository public.
- Deployment (GitHub, Vercel, etc.) is intentionally left to you; nothing in this
  repo assumes a host.
