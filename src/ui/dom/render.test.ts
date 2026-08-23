import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAppData } from "../../domain/appData";
import { DEFAULT_SETTINGS } from "../../config";
import {
  createTask,
  createHabit,
  createRoutine,
  createGoal,
} from "../../state/operations";
import { buildTodayView } from "../model/viewModel";
import { ld, makeDeps } from "../../testing/util";

/* ------- Minimal fake DOM (enough for the render layer) ------- */
class FakeText {
  constructor(public readonly text: string) {}
}
class FakeEl {
  readonly attrs = new Map<string, string>();
  children: Array<FakeEl | FakeText> = [];
  #html = "";
  constructor(public readonly tag: string) {}
  setAttribute(k: string, v: string): void {
    this.attrs.set(k, String(v));
  }
  appendChild(c: FakeEl | FakeText): FakeEl | FakeText {
    this.children.push(c);
    return c;
  }
  replaceChildren(...c: Array<FakeEl | FakeText>): void {
    this.children = c;
  }
  set innerHTML(s: string) {
    this.#html = String(s);
  }
  get innerHTML(): string {
    return this.#html;
  }
}
const fakeDoc = {
  createElement: (t: string): FakeEl => new FakeEl(t),
  createTextNode: (t: string): FakeText => new FakeText(t),
};
(globalThis as unknown as { document: unknown }).document = fakeDoc;

// Import AFTER the fake document is installed (render/h read it at call time).
const { renderDashboard } = await import("./render");

const walk = (node: FakeEl | FakeText, visit: (n: FakeEl | FakeText) => void): void => {
  visit(node);
  if (node instanceof FakeEl) for (const c of node.children) walk(c, visit);
};
const actions = (root: FakeEl): string[] => {
  const out: string[] = [];
  walk(root, (n) => {
    if (n instanceof FakeEl) {
      const a = n.attrs.get("data-action");
      if (a !== undefined) out.push(a);
    }
  });
  return out;
};
const allText = (root: FakeEl): string => {
  let s = "";
  walk(root, (n) => {
    if (n instanceof FakeText) s += n.text + " ";
  });
  return s;
};

const today = ld("2025-08-22");

const seeded = () => {
  const deps = makeDeps();
  let data = emptyAppData(DEFAULT_SETTINGS);
  ({ data } = createTask(deps, data, { title: "Plan week", due: today, priority: "high" }));
  ({ data } = createTask(deps, data, { title: "Email Sam", due: today }));
  const hab = createHabit(deps, data, { name: "Meditate", schedule: { kind: "daily" } });
  data = hab.data;
  ({ data } = createRoutine(deps, data, {
    name: "Morning ritual",
    schedule: { kind: "daily" },
    daypart: "morning",
    steps: [{ habitId: hab.habit.id }],
  }));
  ({ data } = createGoal(deps, data, {
    horizon: "year",
    name: "Read more",
    metric: { target: 12, current: 3, unit: null },
  }));
  return buildTodayView(data, today, 9);
};

test("renderDashboard projects a populated view into DOM", () => {
  const root = renderDashboard(seeded(), "11:30:07") as unknown as FakeEl;
  assert.equal(root.attrs.get("class"), "dash");

  const text = allText(root);
  assert.ok(/Good morning/.test(text));
  assert.ok(/Friday, August 22/.test(text));
  assert.ok(/Plan week/.test(text));
  assert.ok(/Meditate/.test(text));
  assert.ok(/Morning ritual/.test(text));
  assert.ok(/Read more/.test(text));

  const acts = actions(root);
  assert.ok(acts.includes("toggle-task"), "has task toggles");
  assert.ok(acts.includes("toggle-habit"), "has habit toggles");
  assert.ok(acts.includes("toggle-step"), "has routine step toggles");
});

test("renderDashboard shows an actionable empty state", () => {
  const vm = buildTodayView(emptyAppData(DEFAULT_SETTINGS), today, 9);
  const root = renderDashboard(vm, "11:30:07") as unknown as FakeEl;
  const acts = actions(root);
  assert.ok(acts.includes("seed-example"));
  assert.ok(acts.includes("focus-quickadd"));
  assert.ok(/quiet, clean day/.test(allText(root)));
});
