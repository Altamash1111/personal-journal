import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../persistence/store";
import { MemoryStorageAdapter } from "../../persistence/adapter";
import { fixedClock } from "../../core/clock";
import { sequentialFactory } from "../../core/id";
import type { OpDeps } from "../../state/helpers";
import type { GoalId, MilestoneId, TaskId, SubtaskId, ProjectId } from "../../domain/ids";
import { AppController } from "./controller";

const ISO = "2025-08-22T06:00:00.000Z";
const makeOps = (): OpDeps => ({ ids: sequentialFactory("c"), clock: fixedClock(ISO) });
const makeController = (adapter: MemoryStorageAdapter) =>
  new AppController({ store: new Store(adapter, { clock: fixedClock(ISO) }), ops: makeOps() });

test("goals: create, add + toggle milestone, metric update — all persist", async () => {
  const adapter = new MemoryStorageAdapter();
  const c = makeController(adapter);
  await c.init();
  await c.createGoalFull({ horizon: "year", name: "Read 24 books", metric: { target: 24, current: 0, unit: "books" } });
  const gId = c.getState().goals[0]!.id as GoalId;
  await c.setGoalMetricCurrent(gId, 7);
  await c.addMilestoneTo(gId, "Finish Q1 list");
  const mId = c.getState().goals[0]!.milestones[0]!.id as MilestoneId;
  await c.toggleMilestone(gId, mId);

  const gv = c.goalsView();
  assert.equal(gv.goals.length, 1);
  assert.equal(gv.goals[0]!.metricCurrent, 7);
  assert.ok(gv.goals[0]!.progress > 0);
  assert.equal(gv.goals[0]!.milestones[0]!.done, true);

  const c2 = makeController(adapter);
  await c2.init();
  assert.equal(c2.goalsView().goals[0]!.metricCurrent, 7);
  assert.equal(c2.getState().goals[0]!.milestones[0]!.done, true);
});

test("goals: parent/child hierarchy renders in tree order with depth", async () => {
  const c = makeController(new MemoryStorageAdapter());
  await c.init();
  await c.createGoalFull({ horizon: "year", name: "Parent" });
  const parent = c.getState().goals[0]!.id as GoalId;
  await c.createGoalFull({ horizon: "quarter", name: "Child", parentId: parent });
  const gv = c.goalsView();
  assert.equal(gv.goals.length, 2);
  assert.equal(gv.goals[0]!.name, "Parent");
  assert.equal(gv.goals[0]!.depth, 0);
  assert.equal(gv.goals[1]!.name, "Child");
  assert.equal(gv.goals[1]!.depth, 1);
});

test("tasks: full manager — buckets, subtasks, links persist", async () => {
  const adapter = new MemoryStorageAdapter();
  const c = makeController(adapter);
  await c.init();
  await c.createProjectFull({ name: "Launch" });
  const projId = c.getState().projects[0]!.id as ProjectId;
  await c.addTask({ title: "Overdue thing", due: "2025-08-01" as unknown as import("../../time/localDate").LocalDate });
  await c.addTask({ title: "Today thing", due: c.today() });
  const t2 = c.getState().tasks[1]!.id as TaskId;
  await c.editTask(t2, { projectId: projId, priority: "high" });
  await c.addSubtaskTo(t2, "step one");
  const sId = c.getState().tasks[1]!.subtasks[0]!.id as SubtaskId;
  await c.toggleSubtask(t2, sId);

  const tv = c.tasksView();
  assert.equal(tv.counts.overdue, 1);
  assert.equal(tv.counts.today, 2); // today bucket includes overdue+today per Phase 1 filter
  const todayThing = tv.buckets.today.find((t) => t.title === "Today thing")!;
  assert.equal(todayThing.projectName, "Launch");
  assert.equal(todayThing.priority, "high");
  assert.equal(todayThing.subtasks[0]!.done, true);

  const pv = c.projectsView();
  assert.equal(pv.projects[0]!.taskCount, 1);

  const c2 = makeController(adapter);
  await c2.init();
  assert.equal(c2.getState().tasks.length, 2);
  assert.equal(c2.projectsView().projects[0]!.taskCount, 1);
});

test("journal: save today then reload sees it; history excludes today", async () => {
  const adapter = new MemoryStorageAdapter();
  const c = makeController(adapter);
  await c.init();
  await c.saveJournalToday({ accomplished: "Shipped Phase 4", rating: 4 });
  const jv = c.journalView();
  assert.ok(jv.todayEntry !== null);
  assert.equal(jv.todayEntry!.rating, 4);
  assert.equal(jv.history.length, 0);

  const c2 = makeController(adapter);
  await c2.init();
  assert.equal(c2.journalView().todayEntry!.accomplished, "Shipped Phase 4");
});

test("data: export -> reset -> import round-trips through the UI seam", async () => {
  const adapter = new MemoryStorageAdapter();
  const c = makeController(adapter);
  await c.init();
  await c.createGoalFull({ horizon: "year", name: "Keep me" });
  await c.addTask({ title: "Keep me too" });
  const backup = c.exportData();
  assert.ok(backup.includes("Keep me"));

  await c.resetData();
  assert.equal(c.getState().goals.length, 0);
  assert.equal(c.getState().tasks.length, 0);

  const res = await c.importData(backup);
  assert.equal(res.ok, true);
  assert.equal(c.getState().goals.length, 1);
  assert.equal(c.getState().tasks.length, 1);

  // Import persisted: a fresh controller over the same adapter sees the restored data.
  const c2 = makeController(adapter);
  await c2.init();
  assert.equal(c2.getState().goals[0]!.name, "Keep me");
});

test("data: importing garbage fails safely without changing state", async () => {
  const c = makeController(new MemoryStorageAdapter());
  await c.init();
  await c.createGoalFull({ horizon: "year", name: "Safe" });
  const res = await c.importData("{ not json");
  assert.equal(res.ok, false);
  assert.ok((res.error ?? "").length > 0);
  assert.equal(c.getState().goals.length, 1); // unchanged
});

test("reset keeps settings (timezone/targets)", async () => {
  const c = makeController(new MemoryStorageAdapter());
  await c.init();
  await c.setTimeZone("Europe/London");
  await c.createGoalFull({ horizon: "year", name: "x" });
  await c.resetData();
  assert.equal(c.getState().settings.timeZone, "Europe/London");
  assert.equal(c.getState().goals.length, 0);
});
