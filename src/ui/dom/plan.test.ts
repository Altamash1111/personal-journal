import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAppData } from "../../domain/appData";
import { DEFAULT_SETTINGS } from "../../config";
import {
  createGoal,
  addMilestone,
  createTask,
  addSubtask,
  createProject,
  updateTask,
  upsertJournalEntry,
} from "../../state/operations";
import type { GoalId, TaskId, ProjectId } from "../../domain/ids";
import {
  buildGoalsView,
  buildTasksView,
  buildProjectsView,
  buildJournalView,
  buildSettingsView,
} from "../model/plan";
import { ld, makeDeps } from "../../testing/util";

/* ------- Minimal fake DOM (same shape as render.test.ts) ------- */
class FakeText {
  constructor(public readonly text: string) {}
}
class FakeEl {
  readonly attrs = new Map<string, string>();
  children: Array<FakeEl | FakeText> = [];
  #html = "";
  constructor(public readonly tag: string) {}
  setAttribute(k: string, v: string): void { this.attrs.set(k, String(v)); }
  appendChild(c: FakeEl | FakeText): FakeEl | FakeText { this.children.push(c); return c; }
  replaceChildren(...c: Array<FakeEl | FakeText>): void { this.children = c; }
  set innerHTML(s: string) { this.#html = String(s); }
  get innerHTML(): string { return this.#html; }
  querySelector(): null { return null; }
}
const fakeDoc = {
  createElement: (t: string): FakeEl => new FakeEl(t),
  createTextNode: (t: string): FakeText => new FakeText(t),
};
(globalThis as unknown as { document: unknown }).document = fakeDoc;

const { renderGoals, renderTasks, renderProjects, renderJournal, renderSettings } =
  await import("./plan");

const walk = (n: FakeEl | FakeText, visit: (x: FakeEl | FakeText) => void): void => {
  visit(n);
  if (n instanceof FakeEl) for (const c of n.children) walk(c, visit);
};
const collect = (root: FakeEl, attr: string): string[] => {
  const out: string[] = [];
  walk(root, (n) => { if (n instanceof FakeEl) { const a = n.attrs.get(attr); if (a !== undefined) out.push(a); } });
  return out;
};
const allText = (root: FakeEl): string => {
  let s = "";
  walk(root, (n) => { if (n instanceof FakeText) s += n.text + " "; });
  return s;
};

const today = ld("2025-08-22");
const seeded = () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  const g = createGoal(deps, data, { horizon: "year", name: "Read 24 books", metric: { target: 24, current: 7, unit: "books" } });
  data = g.data;
  data = addMilestone(deps, data, g.goal.id as GoalId, { title: "Q1 list" });
  const proj = createProject(deps, data, { name: "Launch" });
  data = proj.data;
  const t = createTask(deps, data, { title: "Ship it", due: today, priority: "high" });
  data = t.data;
  data = updateTask(deps, data, t.task.id as TaskId, { projectId: proj.project.id as ProjectId });
  data = addSubtask(deps, data, t.task.id as TaskId, "write tests");
  ({ data } = upsertJournalEntry(deps, data, ld("2025-08-21"), { accomplished: "Yesterday win", rating: 4 }));
  return data;
};

test("goals page renders tree, milestones and forms", () => {
  const data = seeded();
  const gv = buildGoalsView(data);
  const expanded = new Set<string>(gv.goals.map((g) => g.id)); // open all so details render
  const root = renderGoals(gv, expanded) as unknown as FakeEl;
  const text = allText(root);
  assert.ok(/Goals/.test(text));
  assert.ok(/Read 24 books/.test(text));
  const forms = collect(root, "data-form");
  assert.ok(forms.includes("add-goal"));
  assert.ok(forms.includes("add-milestone"));
  assert.ok(collect(root, "data-action").includes("toggle-milestone"));
});

test("tasks page renders tabs, task rows, subtasks and controls", () => {
  const root = renderTasks(buildTasksView(seeded(), today), "today") as unknown as FakeEl;
  const text = allText(root);
  assert.ok(/Tasks/.test(text));
  assert.ok(/Ship it/.test(text));
  const acts = collect(root, "data-action");
  assert.ok(acts.includes("task-filter"));
  assert.ok(acts.includes("toggle-task"));
  assert.ok(acts.includes("toggle-subtask"));
  const forms = collect(root, "data-form");
  assert.ok(forms.includes("add-task-full"));
  assert.ok(forms.includes("add-subtask"));
});

test("projects page renders project with linked task", () => {
  const root = renderProjects(buildProjectsView(seeded())) as unknown as FakeEl;
  const text = allText(root);
  assert.ok(/Launch/.test(text));
  assert.ok(/Ship it/.test(text));
  assert.ok(collect(root, "data-form").includes("add-project"));
});

test("journal page renders today form + past history", () => {
  const root = renderJournal(buildJournalView(seeded(), today)) as unknown as FakeEl;
  const text = allText(root);
  assert.ok(/Daily review/.test(text));
  assert.ok(/Yesterday win/.test(text));
  assert.ok(collect(root, "data-form").includes("save-journal"));
});

test("settings page renders prefs, targets, and data actions", () => {
  const root = renderSettings(buildSettingsView(seeded())) as unknown as FakeEl;
  const text = allText(root);
  assert.ok(/Settings/.test(text));
  const acts = collect(root, "data-action");
  assert.ok(acts.includes("export-data"));
  assert.ok(acts.includes("reset-data"));
  const forms = collect(root, "data-form");
  assert.ok(forms.includes("set-timezone"));
  assert.ok(forms.includes("import-data"));
});
